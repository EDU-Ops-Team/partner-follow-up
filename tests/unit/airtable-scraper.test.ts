import { describe, expect, it } from "vitest";
import {
  extractIds,
  extractSharedViewId,
  extractCsvDownloadUrlFromHtml,
  parseAirtableCsv,
} from "../../convex/services/airtableScraper";

describe("extractIds", () => {
  it("extracts base ID and table ID from a full URL", () => {
    const { baseId, tableId } = extractIds("https://airtable.com/appABC123/shrXYZ456/tblDEF789");
    expect(baseId).toBe("appABC123");
    expect(tableId).toBe("tblDEF789");
  });

  it("extracts from URL without share ID", () => {
    const { baseId, tableId } = extractIds("https://airtable.com/appABC123/tblDEF789");
    expect(baseId).toBe("appABC123");
    expect(tableId).toBe("tblDEF789");
  });

  it("throws for URL missing base ID", () => {
    expect(() => extractIds("https://airtable.com/shrXYZ456")).toThrow("Cannot extract base ID");
  });

  it("throws for URL missing table ID", () => {
    expect(() => extractIds("https://airtable.com/appABC123/shrXYZ456")).toThrow("Cannot extract table ID");
  });
});

describe("extractSharedViewId", () => {
  it("extracts a shared view ID", () => {
    expect(extractSharedViewId("https://airtable.com/appABC123/shrXYZ456/tblDEF789")).toBe("shrXYZ456");
  });

  it("throws when the URL has no shared view ID", () => {
    expect(() => extractSharedViewId("https://airtable.com/appABC123/tblDEF789")).toThrow(
      "Cannot extract shared view ID"
    );
  });
});

describe("extractCsvDownloadUrlFromHtml", () => {
  it("extracts an absolute CSV download URL from scraped HTML", () => {
    const html = `
      <script>
        window.__DATA__ = {
          csvDownloadUrl: "https://airtable.com/v0.3/view/viw123/downloadCsv?foo=bar"
        };
      </script>
    `;

    expect(extractCsvDownloadUrlFromHtml(html, "https://airtable.com/appABC123/shrXYZ456")).toBe(
      "https://airtable.com/v0.3/view/viw123/downloadCsv?foo=bar"
    );
  });

  it("extracts a relative CSV download URL from escaped HTML", () => {
    const html = `
      <script>
        window.__DATA__ = {
          csvDownloadUrl: "\\/v0.3\\/view\\/viw123\\/downloadCsv?foo=bar&amp;baz=qux"
        };
      </script>
    `;

    expect(extractCsvDownloadUrlFromHtml(html, "https://airtable.com/appABC123/shrXYZ456")).toBe(
      "https://airtable.com/v0.3/view/viw123/downloadCsv?foo=bar&baz=qux"
    );
  });

  it("returns null when no CSV URL is present", () => {
    expect(
      extractCsvDownloadUrlFromHtml("<html><body>No CSV link here</body></html>", "https://airtable.com/appABC123/shrXYZ456")
    ).toBeNull();
  });
});

describe("parseAirtableCsv", () => {
  it("maps CSV headers into Airtable rows", () => {
    const csv = [
      "Capture Address,Job Scheduled Date,Job Status,Reporting Request Date,Model URL",
      "\"620 5th Ave S, Kirkland, WA\",2026-03-18,Scheduled,2026-03-17,https://example.com/model",
    ].join("\n");

    expect(parseAirtableCsv(csv)).toEqual([
      {
        address: "620 5th Ave S, Kirkland, WA",
        scheduledDate: "2026-03-18",
        scheduledTime: undefined,
        jobStatus: "Scheduled",
        dataAsOf: "2026-03-17",
        notes: undefined,
        modelUrl: "https://example.com/model",
      },
    ]);
  });
});
