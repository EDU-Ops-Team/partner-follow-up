"use node";

import { parse } from "csv-parse/sync";
import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";
import type { AirtableRow } from "../lib/types";
import { normalizeAddress, similarity } from "../lib/addressNormalizer";
import { ADDRESS_MATCH_THRESHOLD } from "../lib/constants";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
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

function extractSharedViewId(url: string): string {
  const shareMatch = url.match(/(shr\w+)/);
  if (!shareMatch) throw new Error(`Cannot extract shared view ID from URL: ${url}`);
  return shareMatch[1];
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
    scheduledDate: find(["job scheduled date", "scheduled date", "scan date", "lidar date"]),
    scheduledTime: find(["scheduled time", "scan time"]),
    jobStatus: find(["job status", "scan status"]),
    dataAsOf: find(["reporting request date", "data as of", "data as-of", "as of date", "as of"]),
    notes: find(["notes", "comments", "remarks"]),
    modelUrl: find(["model url", "matterport", "model link"]),
  };
}

function normalizeScrapedUrl(value: string): string {
  return value
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
}

function extractCsvDownloadUrlFromHtml(html: string, viewUrl: string): string | null {
  const normalizedHtml = normalizeScrapedUrl(html);
  const patterns = [
    /https:\/\/airtable\.com\/[^"'\\\s<]*downloadCsv[^"'\\\s<]*/i,
    /\/v0\.3\/view\/[^"'\\\s<]*downloadCsv[^"'\\\s<]*/i,
    /\/[^"'\\\s<]*downloadCsv[^"'\\\s<]*/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedHtml.match(pattern);
    if (match) {
      return new URL(match[0], viewUrl).toString();
    }
  }

  return null;
}

function parseAirtableCsv(csvText: string): AirtableRow[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  return records
    .map((record) => mapRowToAirtable(record))
    .filter((row) => row.address);
}

function parseDateValue(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusPriority(status?: string): number {
  if (!status) return 0;
  const normalized = status.toLowerCase().trim();
  if (["complete", "completed", "done", "finished"].includes(normalized)) return 5;
  if (normalized.includes("scheduled")) return 4;
  if (normalized.includes("pending") || normalized.includes("in progress")) return 3;
  if (normalized.includes("expired") || normalized.includes("cancel")) return 1;
  return 2;
}

function compareRows(a: AirtableRow, b: AirtableRow): number {
  const statusDiff = statusPriority(b.jobStatus) - statusPriority(a.jobStatus);
  if (statusDiff !== 0) return statusDiff;

  const dataAsOfDiff = parseDateValue(b.dataAsOf) - parseDateValue(a.dataAsOf);
  if (dataAsOfDiff !== 0) return dataAsOfDiff;

  const scheduledDiff = parseDateValue(b.scheduledDate) - parseDateValue(a.scheduledDate);
  if (scheduledDiff !== 0) return scheduledDiff;

  return b.address.length - a.address.length;
}

export function selectBestAirtableRow(rows: AirtableRow[]): AirtableRow | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort(compareRows)[0];
}

function looksLikeSameAirtableSite(rowAddress: string, targetAddress: string): boolean {
  const normalizedRow = normalizeAddress(rowAddress);
  const normalizedTarget = normalizeAddress(targetAddress);

  if (normalizedRow === normalizedTarget) return true;
  if (normalizedRow.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedRow)) return true;

  const rowStreet = normalizeAddress(rowAddress.split(",")[0] ?? rowAddress);
  const targetStreet = normalizeAddress(targetAddress.split(",")[0] ?? targetAddress);
  if (rowStreet === targetStreet) return true;

  return similarity(rowStreet, targetStreet) >= ADDRESS_MATCH_THRESHOLD;
}

export function findBestAirtableRow(rows: AirtableRow[], targetAddress: string): AirtableRow | undefined {
  const candidates = rows.filter((row) => looksLikeSameAirtableSite(row.address, targetAddress));
  return selectBestAirtableRow(candidates);
}

interface AirtableApiResponse {
  records: Array<{
    id: string;
    fields: Record<string, unknown>;
  }>;
  offset?: string;
}

interface SharedViewColumn {
  id: string;
  name: string;
  type?: string;
  typeOptions?: {
    choices?: Record<string, { id: string; name: string }>;
  };
}

interface SharedViewRow {
  id: string;
  cellValuesByColumnId: Record<string, unknown>;
}

interface SharedViewResponse {
  msg: string;
  data: {
    table: {
      columns: SharedViewColumn[];
      rows: SharedViewRow[];
    };
  };
}

function extractSharedViewDataUrlFromHtml(html: string, viewUrl: string): string | null {
  const normalizedHtml = normalizeScrapedUrl(html).replace(/&amp;/gi, "&");
  const match = normalizedHtml.match(/urlWithParams:\s*"([^"]*readSharedViewData[^"]*)"/);
  return match ? new URL(match[1], viewUrl).toString() : null;
}

function mapSharedViewRows(columns: SharedViewColumn[], rows: SharedViewRow[]): AirtableRow[] {
  const columnById = new Map(columns.map((column) => [column.id, column]));

  return rows
    .map((row) => {
      const record: Record<string, unknown> = {};
      for (const [columnId, rawValue] of Object.entries(row.cellValuesByColumnId ?? {})) {
        const column = columnById.get(columnId);
        if (!column) continue;

        let value = rawValue;
        const choices = column.typeOptions?.choices;
        if (choices && typeof rawValue === "string" && choices[rawValue]) {
          value = choices[rawValue].name;
        }

        record[column.name] = value;
      }
      return mapRowToAirtable(record);
    })
    .filter((row) => row.address);
}

async function fetchSharedViewData(viewUrl: string): Promise<AirtableRow[]> {
  return withRetry(async () => {
    const pageResponse = await fetch(viewUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!pageResponse.ok) {
      throw new Error(`Shared view fetch failed: ${pageResponse.status}`);
    }

    const html = await pageResponse.text();
    const dataUrl = extractSharedViewDataUrlFromHtml(html, viewUrl);
    if (!dataUrl) {
      throw new Error("Shared view data URL not found in page payload");
    }

    const applicationId = viewUrl.match(/(app\w+)/)?.[1];
    const dataResponse = await fetch(dataUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
        "x-user-locale": "en",
        "x-airtable-inter-service-client": "webClient",
        "x-time-zone": "America/Chicago",
        ...(applicationId ? { "x-airtable-application-id": applicationId } : {}),
      },
    });

    if (!dataResponse.ok) {
      throw new Error(`Shared view data fetch failed: ${dataResponse.status}`);
    }

    const payload = (await dataResponse.json()) as SharedViewResponse;
    const rows = mapSharedViewRows(payload.data.table.columns, payload.data.table.rows);
    if (rows.length === 0) {
      throw new Error("Shared view data returned no rows");
    }

    logger.info("Fetched Airtable data via shared view data endpoint", {
      rowCount: rows.length,
      source: "shared_view_data",
      sharedViewId: extractSharedViewId(viewUrl),
    });

    return rows;
  }, { maxRetries: 2, context: "airtable-shared-view-data" });
}

async function fetchSharedViewCsv(viewUrl: string): Promise<AirtableRow[]> {
  return withRetry(async () => {
    const explicitCsvUrl = getOptionalEnv("AIRTABLE_SHARED_VIEW_CSV_URL");
    if (explicitCsvUrl) {
      const csvResponse = await fetch(explicitCsvUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EDUOpsAgent/1.0)",
          Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
        },
      });

      if (!csvResponse.ok) {
        throw new Error(`Explicit shared view CSV fetch failed: ${csvResponse.status}`);
      }

      const csvText = await csvResponse.text();
      const rows = parseAirtableCsv(csvText);
      if (rows.length === 0) {
        throw new Error("Explicit shared view CSV returned no rows");
      }

      logger.info("Fetched Airtable data via explicit shared view CSV URL", {
        rowCount: rows.length,
        source: "shared_view_csv_explicit",
        sharedViewId: extractSharedViewId(viewUrl),
      });
      return rows;
    }

    const response = await fetch(viewUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EDUOpsAgent/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`Shared view fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const csvDownloadUrl =
      extractCsvDownloadUrlFromHtml(html, viewUrl) ??
      `${viewUrl.replace(/\/$/, "")}.csv`;

    const csvResponse = await fetch(csvDownloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EDUOpsAgent/1.0)",
        Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
      },
    });

    if (!csvResponse.ok) {
      throw new Error(`Shared view CSV fetch failed: ${csvResponse.status}`);
    }

    const csvText = await csvResponse.text();
    const rows = parseAirtableCsv(csvText);
    if (rows.length === 0) {
      throw new Error("Shared view CSV returned no rows");
    }

    logger.info("Fetched Airtable data via shared view CSV", {
      rowCount: rows.length,
      source: "shared_view_csv",
      sharedViewId: extractSharedViewId(viewUrl),
    });
    return rows;
  }, { maxRetries: 2, context: "airtable-shared-view-csv" });
}

async function fetchAirtableViaApi(viewUrl: string): Promise<AirtableRow[]> {
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

    logger.info("Fetched Airtable data via API", {
      rowCount: allRows.length,
      baseId,
      tableId,
      source: "api",
    });
    return allRows;
  }, { maxRetries: 2, context: "airtable-api" });
}

/**
 * Fetch Airtable data, preferring shared-view CSV access when available.
 * Falls back to the Airtable REST API when a token is configured.
 */
export async function fetchAirtableData(viewUrl: string): Promise<AirtableRow[]> {
  let sharedViewError: string | null = null;
  const strictSharedView = getOptionalEnv("AIRTABLE_STRICT_SHARED_VIEW") === "true";
  const allowApiFallback = getOptionalEnv("AIRTABLE_ALLOW_API_FALLBACK") === "true" || !strictSharedView;

  if (viewUrl.includes("shr")) {
    try {
      return await fetchSharedViewCsv(viewUrl);
    } catch (error) {
      sharedViewError = error instanceof Error ? error.message : String(error);
      logger.warn("Shared view CSV fetch failed", {
        error: sharedViewError,
      });
    }

    try {
      return await fetchSharedViewData(viewUrl);
    } catch (error) {
      sharedViewError = error instanceof Error ? error.message : String(error);
      logger.warn("Shared view data fetch failed", {
        error: sharedViewError,
      });
    }
  }

  if (process.env.AIRTABLE_API_TOKEN && (!viewUrl.includes("shr") || allowApiFallback)) {
    return fetchAirtableViaApi(viewUrl);
  }

  throw new Error(
    sharedViewError
      ? `Unable to fetch Airtable shared view CSV: ${sharedViewError}`
      : "Unable to fetch Airtable data: no shared view CSV path succeeded and API fallback is disabled"
  );
}

export async function checkAirtableHealth(viewUrl: string): Promise<boolean> {
  try {
    if (viewUrl.includes("shr")) {
      const rows = await fetchSharedViewCsv(viewUrl);
      return rows.length > 0;
    }

    const token = process.env.AIRTABLE_API_TOKEN;
    if (!token) return false;

    const { baseId, tableId } = extractIds(viewUrl);
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}?maxRecords=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export { extractIds, extractSharedViewId, extractCsvDownloadUrlFromHtml, parseAirtableCsv };
