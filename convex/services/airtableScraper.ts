"use node";

import { parse } from "csv-parse/sync";
import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { AirtableRow } from "../lib/types";

function extractViewId(url: string): string {
  const match = url.match(/\/(shr\w+)/);
  if (!match) throw new Error(`Cannot extract view ID from URL: ${url}`);
  return match[1];
}

async function fetchAccessToken(viewId: string): Promise<string> {
  const res = await fetch(`https://airtable.com/${viewId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`Failed to fetch Airtable view: ${res.status}`);
  const html = await res.text();
  const tokenMatch = html.match(/"accessPolicy"\s*:\s*\{[^}]*"token"\s*:\s*"([^"]+)"/);
  if (!tokenMatch) {
    const altMatch = html.match(/accessToken['"]\s*:\s*['"]([^'"]+)/);
    if (!altMatch) throw new Error("Could not extract access token from Airtable HTML");
    return altMatch[1];
  }
  return tokenMatch[1];
}

async function downloadCsv(viewId: string, accessToken: string): Promise<string> {
  const res = await fetch(`https://airtable.com/v0.3/view/${viewId}/downloadCsv`, {
    headers: {
      "x-airtable-inter-service-client": "webClient",
      "x-requested-with": "XMLHttpRequest",
      "x-time-zone": "America/Chicago",
      cookie: `__Host-airtable-session=${accessToken}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`Failed to download CSV: ${res.status}`);
  return res.text();
}

async function readSharedViewData(viewId: string, accessToken: string): Promise<AirtableRow[]> {
  const res = await fetch(`https://airtable.com/v0.3/view/${viewId}/readSharedViewData`, {
    headers: {
      "x-airtable-inter-service-client": "webClient",
      "x-requested-with": "XMLHttpRequest",
      "x-time-zone": "America/Chicago",
      cookie: `__Host-airtable-session=${accessToken}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`Failed to read shared view data: ${res.status}`);
  const data = await res.json();
  return parseJsonResponse(data);
}

function mapRowToAirtable(row: Record<string, string>): AirtableRow {
  const keys = Object.keys(row);
  const find = (patterns: string[]): string | undefined => {
    for (const p of patterns) {
      const key = keys.find((k) => k.toLowerCase().includes(p.toLowerCase()));
      if (key && row[key]) return row[key];
    }
    return undefined;
  };
  return {
    address: find(["address", "site", "location", "property"]) ?? "",
    scheduledDate: find(["scheduled date", "scan date", "lidar date", "date"]),
    scheduledTime: find(["scheduled time", "scan time", "time"]),
    jobStatus: find(["status", "job status", "scan status"]),
    notes: find(["notes", "comments", "remarks"]),
  };
}

function parseCsvRows(csv: string): AirtableRow[] {
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return records.map((row) => mapRowToAirtable(row));
}

function parseJsonResponse(data: unknown): AirtableRow[] {
  const obj = data as Record<string, unknown>;
  const table = obj.data as Record<string, unknown> | undefined;
  const rows = (table?.rows ?? obj.rows ?? []) as Record<string, unknown>[];
  return rows.map((row) => {
    const fields = (row.cellValuesByColumnId ?? row.fields ?? row) as Record<string, string>;
    return mapRowToAirtable(fields);
  });
}

export async function fetchAirtableData(viewUrl: string): Promise<AirtableRow[]> {
  const viewId = extractViewId(viewUrl);
  return withRetry(async () => {
    logger.info("Fetching Airtable access token", { viewId });
    const token = await fetchAccessToken(viewId);
    try {
      const csv = await downloadCsv(viewId, token);
      const rows = parseCsvRows(csv);
      logger.info("Parsed Airtable CSV", { rowCount: rows.length });
      return rows;
    } catch (csvError) {
      logger.warn("CSV download failed, trying JSON fallback", {
        error: csvError instanceof Error ? csvError.message : String(csvError),
      });
      const rows = await readSharedViewData(viewId, token);
      logger.info("Parsed Airtable JSON", { rowCount: rows.length });
      return rows;
    }
  }, { maxRetries: 2, context: "airtable-scrape" });
}

export async function checkAirtableHealth(viewUrl: string): Promise<boolean> {
  try {
    const viewId = extractViewId(viewUrl);
    const res = await fetch(`https://airtable.com/${viewId}`, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    return res.ok;
  } catch { return false; }
}

export { extractViewId, parseCsvRows };
