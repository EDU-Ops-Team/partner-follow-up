import { describe, it, expect } from "vitest";
import { parseReplyIntent, stripQuotedText } from "../../convex/services/replyParser";
import type { AttachmentInfo } from "../../convex/lib/types";

const mockAttachment: AttachmentInfo = {
  attachmentId: "att-1",
  filename: "report.pdf",
  mimeType: "application/pdf",
  size: 1024,
};

describe("stripQuotedText", () => {
  it("removes lines after 'On ... wrote:'", () => {
    const body = `Thanks, scheduled for Friday.

On Mon, Mar 9, 2026 at 10:00 AM Someone wrote:
> Please schedule the LiDAR scan.`;
    expect(stripQuotedText(body)).toBe("Thanks, scheduled for Friday.");
  });

  it("removes lines starting with >", () => {
    const body = `Got it, will do.
> Previous message content
> More quoted text`;
    expect(stripQuotedText(body)).toBe("Got it, will do.");
  });

  it("returns full text when no quotes present", () => {
    const body = "Scheduled for March 15, 2026.";
    expect(stripQuotedText(body)).toBe(body);
  });

  it("stops at forwarded message markers", () => {
    const body = `See below.

---------- Forwarded message ----------
From: someone@example.com`;
    expect(stripQuotedText(body)).toBe("See below.");
  });
});

describe("parseReplyIntent", () => {
  it("detects scheduling updates with date", () => {
    const intent = parseReplyIntent("Scheduled for March 15, 2026.", []);
    expect(intent.type).toBe("scheduling_update");
    expect(intent.extractedDate).toBeTruthy();
    expect(intent.hasAttachments).toBe(false);
  });

  it("detects scheduling keywords without explicit date", () => {
    const intent = parseReplyIntent("The appointment has been confirmed and booked.", []);
    expect(intent.type).toBe("scheduling_update");
  });

  it("detects completion updates", () => {
    const intent = parseReplyIntent("The LiDAR scan is complete.", []);
    expect(intent.type).toBe("completion_update");
    expect(intent.extractedStatus).toBe("complete");
  });

  it("detects 'done' as completion", () => {
    const intent = parseReplyIntent("All done on our end.", []);
    expect(intent.type).toBe("completion_update");
  });

  it("detects attachment-only replies", () => {
    const intent = parseReplyIntent("See attached.", [mockAttachment]);
    expect(intent.type).toBe("attachment_only");
    expect(intent.hasAttachments).toBe(true);
  });

  it("returns informational for general replies", () => {
    const intent = parseReplyIntent("We are working on it and will have an update soon.", []);
    expect(intent.type).toBe("informational");
  });

  it("returns unknown for very short replies", () => {
    const intent = parseReplyIntent("Ok", []);
    expect(intent.type).toBe("unknown");
  });

  it("returns unknown for empty body", () => {
    const intent = parseReplyIntent("", []);
    expect(intent.type).toBe("unknown");
  });

  it("strips quoted text before analyzing", () => {
    const body = `Done.

On Mon, Mar 9, 2026 at 10:00 AM Someone wrote:
> Please schedule the LiDAR scan for March 15.`;
    const intent = parseReplyIntent(body, []);
    expect(intent.type).toBe("completion_update");
  });

  it("extracts date from 'date is' format", () => {
    const intent = parseReplyIntent("The date is 3/15/2026 for the inspection.", []);
    expect(intent.type).toBe("scheduling_update");
    expect(intent.extractedDate).toContain("3/15/2026");
  });

  it("detects attachments with substantive body", () => {
    const intent = parseReplyIntent("Here is the completed report for the site.", [mockAttachment]);
    expect(intent.hasAttachments).toBe(true);
    // "completed" triggers completion
    expect(intent.type).toBe("completion_update");
  });

  it("truncates long summaries", () => {
    const longBody = "A".repeat(300);
    const intent = parseReplyIntent(longBody, []);
    expect(intent.summary.length).toBeLessThanOrEqual(200);
    expect(intent.summary.endsWith("...")).toBe(true);
  });
});
