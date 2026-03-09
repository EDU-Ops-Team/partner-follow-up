import { describe, it, expect } from "vitest";
import { extractSiteInfo, isTriggerEmail } from "../../convex/services/emailParser";
import type { ParsedEmail } from "../../convex/lib/types";

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: "msg-123",
    from: "Zack Lamb <zack.lamb@2hourlearning.com>",
    to: ["vendor@example.com", "auth.permitting@trilogy.com"],
    cc: [],
    subject: "New site: 123 Main Street, Springfield, IL 62701",
    body: `Hi team,

Please schedule LiDAR and Building Inspection for the following site:

123 Main Street, Springfield, IL 62701

Thanks,
Zack`,
    date: new Date("2026-03-04"),
    attachments: [],
    ...overrides,
  };
}

describe("extractSiteInfo", () => {
  it("extracts address from email body", () => {
    const result = extractSiteInfo(makeEmail());
    expect(result).not.toBeNull();
    expect(result!.address).toContain("123 Main Street");
    expect(result!.address).toContain("Springfield");
  });

  it("extracts responsible party from TO field", () => {
    const result = extractSiteInfo(makeEmail());
    expect(result).not.toBeNull();
    expect(result!.responsiblePartyEmail).toBe("vendor@example.com");
  });

  it("extracts address with apartment/unit", () => {
    const result = extractSiteInfo(makeEmail({
      body: "Site at 456 Oak Avenue, Apt 3B, Chicago, IL 60601",
    }));
    expect(result).not.toBeNull();
    expect(result!.address).toContain("456 Oak Avenue");
  });

  it("falls back to subject if body has no address", () => {
    const result = extractSiteInfo(makeEmail({
      body: "Please check on this site.",
      subject: "Schedule: 789 Pine Boulevard, Naperville, IL 60540",
    }));
    expect(result).not.toBeNull();
    expect(result!.address).toContain("789 Pine Boulevard");
  });

  it("returns null if no address found", () => {
    const result = extractSiteInfo(makeEmail({ body: "No address here", subject: "Hello" }));
    expect(result).toBeNull();
  });

  it("extracts named responsible party", () => {
    const result = extractSiteInfo(makeEmail({
      to: ['"John Smith" <john@vendor.com>', "auth.permitting@trilogy.com"],
    }));
    expect(result).not.toBeNull();
    expect(result!.responsiblePartyEmail).toBe("john@vendor.com");
    expect(result!.responsiblePartyName).toBe("John Smith");
  });
});

describe("isTriggerEmail", () => {
  it("returns true for matching sender", () => {
    expect(isTriggerEmail(makeEmail(), "zack.lamb@2hourlearning.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isTriggerEmail(makeEmail({ from: "Zack.Lamb@2HourLearning.com" }), "zack.lamb@2hourlearning.com")).toBe(true);
  });

  it("returns false for non-matching sender", () => {
    expect(isTriggerEmail(makeEmail({ from: "other@example.com" }), "zack.lamb@2hourlearning.com")).toBe(false);
  });
});
