"use node";

import { google } from "googleapis";
import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { InspectionRow } from "../lib/types";

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
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function parseInspectionRow(headers: string[], row: string[]): InspectionRow | null {
  const get = (patterns: string[]): string | undefined => {
    for (const p of patterns) {
      const idx = headers.findIndex((h) => h.includes(p));
      if (idx >= 0 && row[idx]) return row[idx].trim();
    }
    return undefined;
  };

  const address = get(["address", "site", "location", "property"]);
  if (!address) return null;

  const reportReceivedStr = get(["report received", "received", "report status"]);
  return {
    address,
    inspectionDate: get(["inspection date", "building inspection date", "bi date"]),
    inspectionTime: get(["inspection time", "building inspection time", "bi time"]),
    reportDueDate: get(["report due", "due date"]),
    reportReceived: reportReceivedStr
      ? ["yes", "true", "received", "complete", "done"].includes(reportReceivedStr.toLowerCase())
      : false,
    reportLink: get(["report link", "report url", "link"]),
  };
}

export async function fetchInspectionData(sheetId: string, range: string): Promise<InspectionRow[]> {
  return withRetry(async () => {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const rows = res.data.values;
    if (!rows || rows.length < 2) {
      logger.info("No data rows found in Google Sheet");
      return [];
    }
    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    return rows.slice(1).map((row) => parseInspectionRow(headers, row)).filter((r): r is InspectionRow => r !== null);
  }, { maxRetries: 2, context: "google-sheets-fetch" });
}
