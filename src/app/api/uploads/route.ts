import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { requireApiSession, badRequest, sessionUserId } from "@/lib/server-auth";
import { rateLimit, UPLOAD_RATE_LIMIT } from "@/lib/rate-limit";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Detect the image type from magic bytes — the client-supplied MIME type is
 * not trustworthy. Returns the safe extension, or null if unrecognized.
 */
function detectImageExt(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ".jpg"; // JPEG SOI
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return ".png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return ".webp";
  }
  return null;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * POST /api/uploads — multipart form-data {file}.
 *
 * Storage backend is selected by environment:
 * - Production (Vercel): `BLOB_READ_WRITE_TOKEN` set → Vercel Blob
 *   (public). Vercel's filesystem is read-only, so local disk is impossible.
 * - Local dev: falls back to `public/uploads/{yyyy-mm}/{uuid}.{ext}`.
 *
 * Response contract is unchanged: `{ url }` (absolute https URL in prod,
 * `/uploads/...` path locally). Callers store the URL string as-is.
 */
export async function POST(req: Request) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const userId = sessionUserId(session);
  const rl = await rateLimit(`upload:${userId}`, UPLOAD_RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected multipart form-data with a 'file' field");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("Missing 'file' in form data");

  if (file.size > MAX_BYTES) return badRequest("File must be 5 MB or smaller");
  if (file.size === 0) return badRequest("Empty file");

  // Validate actual file content, not the client-claimed MIME type.
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = detectImageExt(buffer);
  if (!ext) return badRequest("Only JPEG, PNG, or WebP images are accepted");

  const now = new Date();
  const dir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const name = `${randomUUID()}${ext}`;

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    const blob = await put(`uploads/${dir}/${name}`, buffer, {
      access: "public",
      contentType: MIME_BY_EXT[ext],
      token: blobToken,
    });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  }

  // Local-dev fallback (Vercel's filesystem is read-only; never hit in prod).
  const relDir = join("public", "uploads", dir);
  await mkdir(join(process.cwd(), relDir), { recursive: true });
  await writeFile(join(process.cwd(), relDir, name), buffer);

  return NextResponse.json({ url: `/uploads/${dir}/${name}` }, { status: 201 });
}
