import { describe, it, expect } from "vitest";
import { executeTree, type DecisionContext } from "../../convex/services/decisionEngine";

function makeContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    classification: {
      classificationType: "unknown",
      confidence: 0.9,
      extractedEntities: {},
      matchedSiteIds: [],
      ...overrides.classification,
    },
    site: overrides.site,
    thread: overrides.thread,
  };
}

describe("executeTree — email-triage", () => {
  it("archives auto-reply emails", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "auto_reply",
        confidence: 0.95,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("archive");
  });

  it("takes no action on internal FYI emails", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "internal_fyi",
        confidence: 0.95,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("no_action");
  });

  it("takes no action on zoning emails", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "government_zoning",
        confidence: 0.85,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("no_action");
    expect(result.nodesTraversed.length).toBeGreaterThan(0);
  });

  it("takes no action on permit emails", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "government_permit",
        confidence: 0.85,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("no_action");
  });

  it("drafts a reply for invoices with tier 2", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "vendor_invoice",
        confidence: 0.9,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("draft_reply");
    expect(result.tier).toBe(2);
    expect(result.templateId).toBe("g05_invoice_no_approval");
  });

  it("sends template for inspection reports", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "inspection_report",
        confidence: 0.9,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("send_template");
    expect(result.tier).toBe(1);
    expect(result.templateId).toBe("t05_inspection_report_clean");
  });

  it("drafts reply for vendor scheduling with tier 2", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "vendor_scheduling",
        confidence: 0.9,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("draft_reply");
    expect(result.tier).toBe(2);
  });

  it("drafts reply for vendor questions with tier 2", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "vendor_question",
        confidence: 0.85,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("draft_reply");
    expect(result.tier).toBe(2);
  });

  it("escalates unknown classifications", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "unknown",
        confidence: 0.3,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.action).toBe("escalate");
  });

  it("records traversal steps", () => {
    const ctx = makeContext({
      classification: {
        classificationType: "vendor_invoice",
        confidence: 0.9,
        extractedEntities: {},
        matchedSiteIds: [],
      },
    });
    const result = executeTree("email-triage", ctx);
    expect(result.nodesTraversed.length).toBeGreaterThan(2);
    expect(result.treeId).toBe("email-triage");
    expect(result.treeVersion).toBe("1.0.0");
  });

  it("returns no_action for non-existent tree", () => {
    const ctx = makeContext();
    const result = executeTree("nonexistent-tree", ctx);
    expect(result.action).toBe("no_action");
    expect(result.reason).toContain("not found");
  });
});

describe("executeTree — followup-timer", () => {
  it("returns escalated follow-up for 5+ day wait", () => {
    const ctx = makeContext({
      thread: {
        businessDaysSinceLastMessage: 6,
      },
    });
    const result = executeTree("followup-timer", ctx);
    expect(result.action).toBe("send_template");
    expect(result.templateId).toBe("t03_vendor_followup_escalated");
    expect(result.tier).toBe(2);
  });

  it("returns standard follow-up for <5 day wait", () => {
    const ctx = makeContext({
      thread: {
        businessDaysSinceLastMessage: 2,
      },
    });
    const result = executeTree("followup-timer", ctx);
    expect(result.action).toBe("send_template");
    expect(result.templateId).toBe("t02_vendor_followup_noncritical");
    expect(result.tier).toBe(1);
  });
});
