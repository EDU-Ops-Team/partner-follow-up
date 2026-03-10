"use node";

import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { AirtableRow } from "../lib/types";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Extract the base ID (appXXX) and table ID (tblXXX) from an Airtable URL.
 */
function extractIds(url: string): { baseId: string; tableId: string } {
  const baseMatch = url.match(/(app\w+)/);
  const tableMatch = url.match(/(tbl\w+)/);
  if (!baseMatch) throw new Error(`Cannot extract base ID from URL: ${url}`);
  if (!tableMatch) throw new Error(`Cannot extract table ID from URL: ${url}`);
  return { baseId: baseMatch[1], tableId: tableMatch[1] };
}

function mapRowToAirtable(fields: Record<string, unknown>): AirtableRow {
  const keys = Object.keys(fields);
  const find = (patterns: string[]): string | undefined => {
    for (const p of patterns) {
      const key = keys.find((k) => k.toLowerCase().includes(p.toLowerCase()));
      if (key && fields[key] != null) return String(fields[key]);
    }
    return undefined;
  };
  return {
    address: find(["capture address", "address", "site", "location", "property", "project name"]) ?? "",
    scheduledDate: find(["scheduled date", "scan date", "lidar date", "date"]),
    scheduledTime: find(["scheduled time", "scan time", "time"]),
    jobStatus: find(["status", "job status", "scan status"]),
    dataAsOf: find(["reporting request date", "data as of", "data as-of", "as of date", "as of"]),
    notes: find(["notes", "comments", "remarks"]),
    modelUrl: find(["model url", "matterport", "model link"]),
  };
}

interface AirtableApiResponse {
  records: Array<{
    id: string;
    fields: Record<string, unknown>;
  }>;
  offset?: string;
}

/**
 * Fetch all records from an Airtable table using the official REST API.
 * Handles pagination automatically.
 */
export async function fetchAirtableData(viewUrl: string): Promise<AirtableRow[]> {
  const { baseId, tableId } = extractIds(viewUrl);
  const token = getEnv("AIRTABLE_API_TOKEN");

  return withRetry(async () => {
    const allRows: AirtableRow[] = [];
    let offset: string | undefined;

    do {
      const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
      if (offset) url.searchParams.set("offset", offset);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Airtable API error: ${res.status} - ${body}`);
      }

      const data: AirtableApiResponse = await res.json();
      const rows = data.records.map((r) => mapRowToAirtable(r.fields));
      allRows.push(...rows);
      offset = data.offset;
    } while (offset);

    logger.info("Fetched Airtable data via API", { rowCount: allRows.length, baseId, tableId });
    return allRows;
  }, { maxRetries: 2, context: "airtable-api" });
}

export async function checkAirtableHealth(viewUrl: string): Promise<boolean> {
  try {
    const { baseId, tableId } = extractIds(viewUrl);
    const token = process.env.AIRTABLE_API_TOKEN;
    if (!token) return false;

    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}?maxRecords=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch { return false; }
}

export { extractIds };
