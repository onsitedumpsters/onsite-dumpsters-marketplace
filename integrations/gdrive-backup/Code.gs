/**
 * Onsite Dumpsters Marketplace — App keepalive + Google Drive JSON backups.
 *
 * Architecture (v2): this script NEVER touches the database directly.
 * Apps Script's JDBC driver cannot negotiate the SSL connection that Render
 * Postgres requires (it rejects both `sslmode` and `ssl` parameters), so the
 * app itself performs the database export and this script acts as the
 * scheduler + Drive storage + alerter:
 *
 *  1. keepalive()    — every 10 min: GETs the app's /api/health, then POSTs
 *                      the observation to /api/backup/ping (Bearer
 *                      BACKUP_SHARED_SECRET). The app measures DB latency
 *                      itself and records keepalive.* in SystemStatus, which
 *                      the admin dashboard reads.
 *  2. dailyBackup()  — every day 02:00 ET: GETs /api/backup/export?kind=daily
 *                      (authenticated), uploads the EXACT response bytes to
 *                      Drive, records SHA-256 in backup-manifest.json, prunes
 *                      retention, then POSTs the file name + hash to
 *                      /api/backup/ping so the app can verify end-to-end
 *                      integrity (Drive bytes === exported bytes).
 *  3. weeklyBackup() — Sundays 03:00 ET: same with kind=weekly.
 *  4. setupAll()     — one-time: creates the time-driven triggers.
 *  5. testConnections() — one-time: verifies app URL, backup API, Drive.
 *
 * Restore is MANUAL and does NOT live here: download the snapshot from the
 * Drive folder and run `npx tsx scripts/restore-backup.ts <snapshot.json>`
 * from the app repo (needs DATABASE_URL). See README.md "Restore runbook".
 * There is intentionally no trigger on any restore path.
 *
 * Security model (read README.md for the full write-up)
 *  - ALL secrets live in Script Properties (Project settings > Script
 *    properties). Nothing secret is in this code, in Drive, or in the repo.
 *  - NO database credentials exist in Google at all. The app holds
 *    DATABASE_URL (Vercel env); this script holds only BACKUP_SHARED_SECRET,
 *    a bearer token that authorizes the two backup endpoints and nothing else.
 *  - Every snapshot carries a SHA-256 checksum; the app rejects the backup
 *    completion report unless the hash matches the canonical export bytes.
 *  - Backup files live in a private, unshared Drive folder. The script uses
 *    the full `drive` scope (required: creating the root folder needs
 *    DriveApp.createFolder, which `drive.file` does not allow — verified
 *    live 2026-09-28); the folder is created once and its ID persisted in
 *    Script Properties, because the global Drive search needs this scope.
 *  - Any keepalive or backup failure sends an email alert to ADMIN_EMAIL.
 *
 * Free-tier honesty
 *  - The 10-minute keepalive keeps the app warm and detects outages fast.
 *    It does NOT prevent Render's 30-day free-database expiry. The Drive
 *    snapshots are the real safety net: if the free DB expires, provision a
 *    new one and restore the latest snapshot in minutes.
 *
 * Apps Script quotas: 6 min max execution per run. Snapshots are produced by
 * the app (not in this runtime), so the only size limit here is the 50 MB
 * UrlFetchApp response cap — plenty for this marketplace; see README.md
 * "Scaling beyond".
 */

var APP_NAME = 'onsite-dumpsters-marketplace';
var BACKUP_FORMAT_VERSION = 1;
var RETENTION = { daily: 30, weekly: 12 };

// ── Config ──────────────────────────────────────────────────────────────────

function getConfig_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  var missing = [];
  if (!p.ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
  if (!p.BACKUP_SHARED_SECRET) missing.push('BACKUP_SHARED_SECRET');
  if (missing.length) {
    throw new Error('Missing Script Properties: ' + missing.join(', ') +
      '. Set them under Project settings > Script properties.');
  }
  // APP_URL is optional until the app is deployed. While empty, keepalive and
  // backups skip quietly (no false alarms, no failed runs).
  var appUrl = (p.APP_URL || '').replace(/\/$/, '');
  return {
    appUrl: appUrl,
    backupSecret: p.BACKUP_SHARED_SECRET,
    adminEmail: p.ADMIN_EMAIL,
    driveFolderId: p.DRIVE_FOLDER_ID || null,
  };
}

function apiHeaders_(cfg) {
  return { 'Authorization': 'Bearer ' + cfg.backupSecret };
}

function appBase_(cfg) {
  if (!cfg.appUrl) throw new Error('APP_URL is not set. Set it after deploying the app.');
  return cfg.appUrl;
}

// ── Drive helpers ───────────────────────────────────────────────────────────

function rootFolder_(cfg) {
  // NOTE: never use DriveApp.getFoldersByName — the global Drive search needs
  // the full drive scope (which we have; verified live 2026-09-28 that
  // DriveApp.createFolder requires it). We still create the folder once,
  // persist its ID in Script Properties, and reopen it by ID.
  var props = PropertiesService.getScriptProperties();
  var folderId = cfg.driveFolderId || props.getProperty('DRIVE_FOLDER_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) { /* deleted or inaccessible — recreate below */ }
  }
  var folder = DriveApp.createFolder('OnsiteDumpstersDB');
  folder.setDescription('Private automated backups for ' + APP_NAME + '. Do not share.');
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function subFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sha256Hex_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function (b) {
    var v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function loadManifest_(root) {
  var it = root.getFilesByName('backup-manifest.json');
  if (it.hasNext()) {
    try {
      return JSON.parse(it.next().getBlob().getDataAsString());
    } catch (e) { /* corrupt manifest — rebuild below */ }
  }
  return { app: APP_NAME, backupFormatVersion: BACKUP_FORMAT_VERSION, updatedAt: null, backups: [] };
}

function saveManifest_(root, manifest) {
  manifest.updatedAt = new Date().toISOString();
  var blob = Utilities.newBlob(JSON.stringify(manifest, null, 2), 'application/json', 'backup-manifest.json');
  var it = root.getFilesByName('backup-manifest.json');
  if (it.hasNext()) {
    it.next().setContent(blob.getDataAsString());
  } else {
    root.createFile(blob);
  }
}

function pruneRetention_(root, manifest, kind) {
  var keep = RETENTION[kind] || RETENTION.daily;
  var seen = 0;
  var survivors = [];
  manifest.backups.forEach(function (b) {
    if (b.kind === kind) {
      seen++;
      if (seen > keep) {
        try { DriveApp.getFileById(b.fileId).setTrashed(true); } catch (e) { /* already gone */ }
        return;
      }
    }
    survivors.push(b);
  });
  manifest.backups = survivors;
}

// ── 1. Keepalive ────────────────────────────────────────────────────────────

function keepalive() {
  var cfg = getConfig_();
  if (!cfg.appUrl) {
    Logger.log('keepalive: APP_URL not set — skipping until the app is deployed.');
    return;
  }
  var base = appBase_(cfg);
  var appOk = false;
  var appStatus = 0;

  try {
    var resp = UrlFetchApp.fetch(base + '/api/health', {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
    });
    appStatus = resp.getResponseCode();
    if (appStatus === 200) {
      var body = JSON.parse(resp.getContentText() || '{}');
      appOk = (body.status || 'ok') === 'ok';
    }
  } catch (e) {
    appOk = false;
  }

  // Report the observation; the app measures DB latency itself and writes
  // keepalive.* into SystemStatus (the admin dashboard's source of truth).
  try {
    UrlFetchApp.fetch(base + '/api/backup/ping', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: apiHeaders_(cfg),
      payload: JSON.stringify({ app_ok: appOk, app_status: appStatus }),
    });
  } catch (e) {
    Logger.log('keepalive: ping report failed: ' + e.message);
  }

  if (!appOk) {
    alertFailure_('keepalive', 'GET /api/health -> HTTP ' + appStatus + ' at ' + base);
  } else {
    Logger.log('keepalive ok (HTTP ' + appStatus + ')');
  }
}

// ── 2 & 3. Backups ──────────────────────────────────────────────────────────

function dailyBackup() { runBackupNow_('daily'); }
function weeklyBackup() { runBackupNow_('weekly'); }

function runBackupNow_(kind) {
  var cfg = getConfig_();
  var base = appBase_(cfg); // throws while APP_URL is empty — no false alarms
  var startedAt = new Date();
  try {
    // 1) Ask the app to export the database. The response bytes ARE the
    //    canonical snapshot (the app hashes these same bytes).
    var res = UrlFetchApp.fetch(base + '/api/backup/export?kind=' + encodeURIComponent(kind), {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: apiHeaders_(cfg),
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('export HTTP ' + res.getResponseCode() + ': ' +
        String(res.getContentText() || '').slice(0, 300));
    }
    var bytes = res.getContent();
    var checksum = sha256Hex_(bytes);
    var payload;
    try {
      payload = JSON.parse(res.getContentText());
    } catch (e) {
      throw new Error('export did not return JSON: ' + e.message);
    }
    if (payload.version !== BACKUP_FORMAT_VERSION) {
      throw new Error('snapshot version ' + payload.version +
        ' != expected ' + BACKUP_FORMAT_VERSION + ' — update this script.');
    }
    var totalRows = 0;
    Object.keys(payload.tables || {}).forEach(function (t) {
      totalRows += (payload.tables[t].rows || []).length;
    });

    // 2) Store the exact bytes in Drive.
    var root = rootFolder_(cfg);
    var folder = subFolder_(subFolder_(root, 'backups'), kind);
    var stamp = Utilities.formatDate(startedAt, 'America/New_York', 'yyyyMMdd-HHmmss');
    var fileName = APP_NAME + '-' + kind + '-' + stamp + '.json';
    var file = folder.createFile(Utilities.newBlob(bytes, 'application/json', fileName));
    file.setDescription('Automated ' + kind + ' backup. SHA-256: ' + checksum);

    // 3) Manifest + retention.
    var manifest = loadManifest_(root);
    manifest.backups.unshift({
      kind: kind,
      fileId: file.getId(),
      fileName: fileName,
      takenAt: payload.exportedAt,
      tables: Object.keys(payload.tables || {}),
      totalRows: totalRows,
      bytes: bytes.length,
      sha256: checksum,
    });
    pruneRetention_(root, manifest, kind);
    saveManifest_(root, manifest);

    // 4) Report completion; the app verifies the hash matches the canonical
    //    export bytes and records backup.last_file in SystemStatus.
    var ping = UrlFetchApp.fetch(base + '/api/backup/ping', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: apiHeaders_(cfg),
      payload: JSON.stringify({
        app_ok: true,
        app_status: 200,
        backup_file: fileName,
        backup_sha256: checksum,
      }),
    });
    if (ping.getResponseCode() !== 200) {
      throw new Error('completion report rejected (HTTP ' + ping.getResponseCode() + '): ' +
        String(ping.getContentText() || '').slice(0, 300));
    }

    Logger.log(kind + ' backup ok: ' + fileName + ' rows=' + totalRows +
      ' bytes=' + bytes.length + ' sha256=' + checksum);
  } catch (e) {
    // Best-effort: tell the app to flag backup.status=error, then alert.
    try {
      UrlFetchApp.fetch(base + '/api/backup/ping', {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        headers: apiHeaders_(cfg),
        payload: JSON.stringify({
          app_ok: true,
          app_status: 200,
          backup_error: String((e && e.message) || e).slice(0, 500),
        }),
      });
    } catch (ignore) { /* alert email below is the backstop */ }
    alertFailure_('backup-' + kind, (e && e.message) || String(e));
    throw e; // surface in the Apps Script execution log
  }
}

// ── 4 & 5. Setup & diagnostics ──────────────────────────────────────────────

function setupAll() {
  // One-time setup. Deletes old triggers for our functions, then creates:
  // keepalive every 10 min, daily backup 02:00, weekly backup Sun 03:00 ET.
  // No restore function exists on purpose — restore is manual (see README).
  var fns = ['keepalive', 'dailyBackup', 'weeklyBackup'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (fns.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('keepalive').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('dailyBackup').timeBased().atHour(2).everyDays(1)
    .inTimezone('America/New_York').create();
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3).inTimezone('America/New_York').create();
  Logger.log('Triggers created: keepalive/10min, dailyBackup 02:00 ET, weeklyBackup Sun 03:00 ET.');
}

function testConnections() {
  var cfg = getConfig_();
  var out = [];
  if (!cfg.appUrl) {
    out.push('APP /api/health: SKIPPED (APP_URL empty — set after deploy)');
    out.push('BACKUP API: SKIPPED (APP_URL empty — set after deploy)');
  } else {
    var base = cfg.appUrl;
    try {
      var h = UrlFetchApp.fetch(base + '/api/health', { muteHttpExceptions: true });
      out.push('APP /api/health: HTTP ' + h.getResponseCode() +
        (h.getResponseCode() === 200 ? ' OK' : ' FAIL'));
    } catch (e) { out.push('APP /api/health: FAIL — ' + e.message); }
    try {
      var p = UrlFetchApp.fetch(base + '/api/backup/ping', {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        headers: apiHeaders_(cfg),
        payload: JSON.stringify({ app_ok: true, app_status: 200 }),
      });
      out.push('BACKUP API (ping): HTTP ' + p.getResponseCode() +
        (p.getResponseCode() === 200 ? ' OK' : ' FAIL — ' + String(p.getContentText() || '').slice(0, 200)));
    } catch (e) { out.push('BACKUP API (ping): FAIL — ' + e.message); }
  }
  try {
    var root = rootFolder_(cfg);
    out.push('DRIVE folder: OK (' + root.getName() + ')');
  } catch (e) { out.push('DRIVE folder: FAIL — ' + e.message); }
  try {
    MailApp.sendEmail(cfg.adminEmail, '[OnsiteDumpsters] backup integration test', out.join('\n'));
    out.push('ALERT EMAIL: sent to ' + cfg.adminEmail);
  } catch (e) { out.push('ALERT EMAIL: FAIL — ' + e.message); }
  Logger.log(out.join('\n'));
  return out.join('\n');
}

// ── Alerts ──────────────────────────────────────────────────────────────────

function alertFailure_(job, detail) {
  try {
    var cfg = getConfig_();
    MailApp.sendEmail(
      cfg.adminEmail,
      '[OnsiteDumpsters] ' + job + ' FAILED',
      'Job: ' + job + '\nTime: ' + new Date().toISOString() + '\n\nDetail:\n' + detail +
      '\n\nCheck Executions in the Apps Script dashboard and the admin System panel.'
    );
  } catch (e) {
    Logger.log('ALERT FAILED: ' + e.message + ' | original: ' + detail);
  }
}
