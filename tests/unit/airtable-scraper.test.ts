import { describe, it, expect } from "vitest";
import { extractIds } from "../../convex/services/airtableScraper";

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

  it("throws for invalid URL", () => {
    expect(() => extractIds("https://example.com/nope")).toThrow("Cannot extract base ID");
  });
});
