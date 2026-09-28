import { PageHeader } from "@/components/ui";
import { OverviewClient } from "./overview-client";
import BackupStatusPanel from "../../../integrations/gdrive-backup/app-side/BackupStatusPanel";

/**
 * Admin overview — server component so the BackupStatusPanel (async server
 * component reading the SystemStatus table written by the Google Drive
 * backup / Apps Script keepalive integration) can render directly.
 * Interactive stats stay in the client component below.
 */
export default function AdminOverviewPage() {
  return (
    <div>
      <PageHeader title="Admin overview" subtitle="Marketplace health at a glance" />
      <div className="mb-6">
        <BackupStatusPanel />
      </div>
      <OverviewClient />
    </div>
  );
}
