import { describe, it, expect } from "vitest";
import { classifyByRules } from "../../convex/services/emailClassifier";
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

describe("classifyByRules", () => {
  it("classifies auto-reply emails", () => {
    const email = makeEmail({
      subject: "Out of Office: Re: Site update",
      body: "I am currently out of the office and will return on Monday.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("auto_reply");
    expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("classifies internal emails from trilogy.com", () => {
    const email = makeEmail({
      from: "andrea@trilogy.com",
      body: "FYI the site visit went well yesterday. Everything looks good.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("internal_fyi");
  });

  it("classifies internal action-needed emails", () => {
    const email = makeEmail({
      from: "robbie@trilogy.com",
      subject: "Please review this vendor contract",
      body: "Can you please review and approve the attached contract?",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("internal_action_needed");
  });

  it("classifies scheduling emails", () => {
    const email = makeEmail({
      body: "The LiDAR scan has been scheduled for March 20th. The team will be there at 9am.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("vendor_scheduling");
  });

  it("classifies completion emails", () => {
    const email = makeEmail({
      body: "The inspection has been completed. All items passed. Report will follow.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("vendor_completion");
  });

  it("classifies invoice emails", () => {
    const email = makeEmail({
      subject: "Invoice #12345",
      body: "Please find attached invoice for the inspection services. Amount due: $2,500.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("vendor_invoice");
  });

  it("classifies permit emails", () => {
    const email = makeEmail({
      from: "permits@cityofaustin.gov",
      body: "Your building permit application has been received. Permit number BP-2026-12345.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("government_permit");
  });

  it("classifies zoning emails", () => {
    const email = makeEmail({
      body: "The property is zoned C-2 commercial. A variance may be required for educational use in this land use category.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("government_zoning");
  });

  it("classifies inspection report emails", () => {
    const email = makeEmail({
      subject: "Inspection Report - 123 Main St",
      body: "Please find attached the inspection report with findings from yesterday's visit.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationType).toBe("inspection_report");
  });

  it("boosts confidence when vendor category is known", () => {
    const emailWithVendor = makeEmail({
      body: "The scan has been scheduled for next Tuesday.",
    });
    const resultWithVendor = classifyByRules(emailWithVendor, "lidar");
    const resultWithoutVendor = classifyByRules(emailWithVendor, null);
    expect(resultWithVendor).not.toBeNull();
    expect(resultWithoutVendor).not.toBeNull();
    expect(resultWithVendor!.confidence).toBeGreaterThan(resultWithoutVendor!.confidence);
  });

  it("returns null for ambiguous emails", () => {
    const email = makeEmail({
      body: "Hi, I wanted to follow up on our conversation from last week. Let me know your thoughts.",
    });
    const result = classifyByRules(email, null);
    expect(result).toBeNull();
  });

  it("always uses rule classification method", () => {
    const email = makeEmail({
      subject: "Invoice attached",
      body: "Invoice for payment processing.",
    });
    const result = classifyByRules(email, null);
    expect(result).not.toBeNull();
    expect(result!.classificationMethod).toBe("rule");
  });
});
