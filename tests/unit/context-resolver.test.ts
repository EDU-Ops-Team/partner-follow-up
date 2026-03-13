import { describe, it, expect } from "vitest";
import { resolveContext } from "../../convex/services/contextResolver";
import type { ParsedEmail } from "../../convex/lib/types";

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: "msg-123",
    threadId: "thread-123",
    from: "vendor@example.com",
    to: ["edu.ops@trilogy.com"],
    cc: [],
    subject: "Test email",
    body: "Test body",
    date: new Date(),
    attachments: [],
    ...overrides,
  };
}

describe("resolveContext", () => {
  it("returns matched vendor when vendor lookup succeeds", () => {
    const email = makeEmail();
    const result = resolveContext(
      email,
      { vendorId: "vendor-123", vendorName: "Worksmith" },
      null,
      []
    );
    expect(result.matchedVendorId).toBe("vendor-123");
    expect(result.extractedEntities.vendorName).toBe("Worksmith");
  });

  it("returns null vendor when no vendor match", () => {
    const email = makeEmail();
    const result = resolveContext(email, null, null, []);
    expect(result.matchedVendorId).toBeNull();
  });

  it("carries forward site IDs from existing thread", () => {
    const email = makeEmail();
    const result = resolveContext(
      email,
      null,
      { linkedSiteIds: ["site-1", "site-2"] },
      []
    );
    expect(result.matchedSiteIds).toContain("site-1");
    expect(result.matchedSiteIds).toContain("site-2");
  });

  it("extracts dates from email body", () => {
    const email = makeEmail({
      body: "The inspection is scheduled for March 20, 2026 and follow-up on 3/25/2026.",
    });
    const result = resolveContext(email, null, null, []);
    expect(result.extractedEntities.dates).toBeDefined();
    expect(result.extractedEntities.dates!.length).toBeGreaterThanOrEqual(1);
  });

  it("matches site by address in email body", () => {
    const email = makeEmail({
      body: "Update on 835 Oak Creek Drive, the LiDAR scan is confirmed.",
    });
    const result = resolveContext(
      email,
      null,
      null,
      [
        { id: "site-abc", normalizedAddress: "835 oak creek dr" },
        { id: "site-def", normalizedAddress: "100 main st" },
      ]
    );
    expect(result.matchedSiteIds).toContain("site-abc");
    expect(result.matchedSiteIds).not.toContain("site-def");
  });

  it("deduplicates site IDs from thread and address match", () => {
    const email = makeEmail({
      body: "Update on 835 Oak Creek Drive",
    });
    const result = resolveContext(
      email,
      null,
      { linkedSiteIds: ["site-abc"] },
      [{ id: "site-abc", normalizedAddress: "835 oak creek dr" }]
    );
    const occurrences = result.matchedSiteIds.filter((id) => id === "site-abc");
    expect(occurrences.length).toBe(1);
  });

  it("extracts site address into entities", () => {
    const email = makeEmail({
      body: "Regarding 1234 Main Street, the permit has been filed.",
    });
    const result = resolveContext(email, null, null, []);
    expect(result.extractedEntities.siteAddress).toBeDefined();
    expect(result.extractedEntities.siteAddress).toContain("1234 Main Street");
  });

  it("returns empty site IDs when no match found", () => {
    const email = makeEmail({
      body: "General update, no specific site mentioned.",
    });
    const result = resolveContext(email, null, null, []);
    expect(result.matchedSiteIds).toEqual([]);
  });
});
