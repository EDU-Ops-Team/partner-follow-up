import { describe, it, expect } from "vitest";
import { extractViewId, parseCsvRows } from "../../convex/services/airtableScraper";

describe("extractViewId", () => {
  it("extracts view ID from a standard shared URL", () => {
    expect(extractViewId("https://airtable.com/appABC123/shrXYZ456/tblDEF789")).toBe("shrXYZ456");
  });

  it("extracts view ID from a simple URL", () => {
    expect(extractViewId("https://airtable.com/shrABCDEF12345")).toBe("shrABCDEF12345");
  });

  it("throws for invalid URL", () => {
    expect(() => extractViewId("https://example.com/nope")).toThrow("Cannot extract view ID");
  });
});

describe("parseCsvRows", () => {
  it("parses CSV with standard headers", () => {
    const csv = `Address,Scheduled Date,Job Status,Notes
123 Main St,2026-03-15,Scheduled,First scan
456 Oak Ave,2026-03-20,Pending,`;

    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].address).toBe("123 Main St");
    expect(rows[0].scheduledDate).toBe("2026-03-15");
    expect(rows[0].jobStatus).toBe("Scheduled");
    expect(rows[0].notes).toBe("First scan");
  });

  it("handles alternative column names", () => {
    const csv = `Site Location,Scan Date,Scan Status
789 Pine Blvd,2026-04-01,Complete`;

    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("789 Pine Blvd");
    expect(rows[0].scheduledDate).toBe("2026-04-01");
    expect(rows[0].jobStatus).toBe("Complete");
  });

  it("handles empty CSV", () => {
    const rows = parseCsvRows(`Address,Date,Status`);
    expect(rows).toHaveLength(0);
  });

  it("handles rows with missing fields", () => {
    const csv = `Address,Scheduled Date,Job Status
123 Main St,,`;

    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("123 Main St");
    expect(rows[0].scheduledDate).toBeUndefined();
    expect(rows[0].jobStatus).toBeUndefined();
  });
});
