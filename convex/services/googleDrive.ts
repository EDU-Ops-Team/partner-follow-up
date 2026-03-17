"use node";

import { google } from "googleapis";
import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import { normalizeAddress, similarity } from "../lib/addressNormalizer";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("Missing env var: GOOGLE_SERVICE_ACCOUNT_KEY");
  let key: Record<string, unknown>;
  try {
    key = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid base64 JSON");
  }
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

/**
 * Sanitize an address for use as a Drive folder name.
 */
export function sanitizeFolderName(address: string): string {
  return address
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search for an existing school folder by name under a parent folder.
 * Uses fuzzy matching to handle slight naming differences.
 */
export async function findSchoolFolder(
  parentFolderId: string,
  siteName: string
): Promise<{ folderId: string; folderName: string } | null> {
  return withRetry(async () => {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    // List all folders in the parent
    const res = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      pageSize: 1000,
    });

    const folders = res.data.files ?? [];
    if (folders.length === 0) return null;

    const normalizedSite = normalizeAddress(siteName);

    // First try exact match
    for (const folder of folders) {
      if (!folder.name || !folder.id) continue;
      if (normalizeAddress(folder.name) === normalizedSite) {
        return { folderId: folder.id, folderName: folder.name };
      }
    }

    // Then try fuzzy match (threshold 0.75 for folder names — slightly more lenient)
    let bestMatch: { folderId: string; folderName: string; score: number } | null = null;
    for (const folder of folders) {
      if (!folder.name || !folder.id) continue;
      const score = similarity(normalizedSite, normalizeAddress(folder.name));
      if (score >= 0.75 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { folderId: folder.id, folderName: folder.name, score };
      }
    }

    if (bestMatch) {
      logger.info("Drive: fuzzy matched school folder", {
        siteName, matchedFolder: bestMatch.folderName, score: bestMatch.score,
      });
      return { folderId: bestMatch.folderId, folderName: bestMatch.folderName };
    }

    return null;
  }, { maxRetries: 2, context: "drive-find-folder" });
}

/**
 * Create a new folder under the parent.
 */
export async function createFolder(
  parentFolderId: string,
  folderName: string
): Promise<string> {
  return withRetry(async () => {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      },
      fields: "id",
    });

    const folderId = res.data.id!;
    logger.info("Drive: created folder", { folderName, folderId });
    return folderId;
  }, { maxRetries: 2, context: "drive-create-folder" });
}

/**
 * Find an existing school folder or create a new one.
 */
export async function findOrCreateFolder(
  parentFolderId: string,
  siteName: string
): Promise<string> {
  const existing = await findSchoolFolder(parentFolderId, siteName);
  if (existing) return existing.folderId;

  const folderName = sanitizeFolderName(siteName);
  return createFolder(parentFolderId, folderName);
}

/**
 * Upload a file to a Drive folder.
 */
export async function uploadFile(
  folderId: string,
  filename: string,
  mimeType: string,
  content: Buffer
): Promise<{ fileId: string; webViewLink: string }> {
  return withRetry(async () => {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    const { Readable } = await import("stream");
    const stream = Readable.from(content);

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: "id, webViewLink",
    });

    const fileId = res.data.id!;
    const webViewLink = res.data.webViewLink ?? "";
    logger.info("Drive: uploaded file", { filename, fileId, folderId });
    return { fileId, webViewLink };
  }, { maxRetries: 2, context: "drive-upload-file" });
}
