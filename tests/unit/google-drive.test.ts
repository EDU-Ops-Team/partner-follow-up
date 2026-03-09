import { describe, it, expect } from "vitest";
import { sanitizeFolderName } from "../../convex/services/googleDrive";

describe("sanitizeFolderName", () => {
  it("passes through normal addresses", () => {
    expect(sanitizeFolderName("123 Main Street")).toBe("123 Main Street");
  });

  it("removes illegal characters", () => {
    expect(sanitizeFolderName('123 Main St "Suite A"')).toBe("123 Main St Suite A");
  });

  it("removes colons and pipe characters", () => {
    expect(sanitizeFolderName("Site: 456 Oak Ave | Building A")).toBe("Site 456 Oak Ave Building A");
  });

  it("collapses multiple spaces", () => {
    expect(sanitizeFolderName("123   Main   Street")).toBe("123 Main Street");
  });

  it("trims whitespace", () => {
    expect(sanitizeFolderName("  123 Main Street  ")).toBe("123 Main Street");
  });

  it("handles addresses with special chars", () => {
    expect(sanitizeFolderName("123 Main St, Springfield, IL 62701")).toBe("123 Main St, Springfield, IL 62701");
  });
});
