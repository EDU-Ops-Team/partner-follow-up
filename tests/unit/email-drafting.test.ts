import { describe, it, expect } from "vitest";
import { buildMimeMessage } from "../../convex/services/gmail";

describe("buildMimeMessage", () => {
  const from = "system@example.com";
  const to = "vendor@example.com";
  const subject = "Scheduling Reminder: 123 Main St";
  const body = "<p>Hello</p>";

  it("builds a basic MIME message with required headers", () => {
    const { mimeText } = buildMimeMessage(from, to, subject, body);
    expect(mimeText).toContain(`From: ${from}`);
    expect(mimeText).toContain(`To: ${to}`);
    expect(mimeText).toContain(`Subject: ${subject}`);
    expect(mimeText).toContain("Content-Type: text/html; charset=utf-8");
    expect(mimeText).toContain(body);
  });

  it("does not include threading headers when no threading options", () => {
    const { mimeText } = buildMimeMessage(from, to, subject, body);
    expect(mimeText).not.toContain("In-Reply-To:");
    expect(mimeText).not.toContain("References:");
  });

  it("does not add Re: prefix when no threading", () => {
    const { effectiveSubject } = buildMimeMessage(from, to, subject, body);
    expect(effectiveSubject).toBe(subject);
  });

  it("includes Cc header when provided", () => {
    const { mimeText } = buildMimeMessage(from, to, subject, body, "cc@example.com");
    expect(mimeText).toContain("Cc: cc@example.com");
  });

  it("does not include Cc header when not provided", () => {
    const { mimeText } = buildMimeMessage(from, to, subject, body);
    expect(mimeText).not.toContain("Cc:");
  });

  describe("with threading options", () => {
    const threading = {
      threadId: "thread-123",
      inReplyTo: "<original-msg-id@mail.gmail.com>",
      references: "<original-msg-id@mail.gmail.com>",
    };

    it("adds In-Reply-To header", () => {
      const { mimeText } = buildMimeMessage(from, to, subject, body, undefined, threading);
      expect(mimeText).toContain(`In-Reply-To: ${threading.inReplyTo}`);
    });

    it("adds References header", () => {
      const { mimeText } = buildMimeMessage(from, to, subject, body, undefined, threading);
      expect(mimeText).toContain(`References: ${threading.references}`);
    });

    it("prefixes subject with Re: for threaded replies", () => {
      const { effectiveSubject, mimeText } = buildMimeMessage(from, to, subject, body, undefined, threading);
      expect(effectiveSubject).toBe(`Re: ${subject}`);
      expect(mimeText).toContain(`Subject: Re: ${subject}`);
    });

    it("does not double Re: prefix if already present", () => {
      const reSubject = `Re: ${subject}`;
      const { effectiveSubject } = buildMimeMessage(from, to, reSubject, body, undefined, threading);
      expect(effectiveSubject).toBe(reSubject);
      expect(effectiveSubject).not.toContain("Re: Re:");
    });

    it("does not add Re: when inReplyTo is missing", () => {
      const partialThreading = { threadId: "thread-123" };
      const { effectiveSubject } = buildMimeMessage(from, to, subject, body, undefined, partialThreading);
      expect(effectiveSubject).toBe(subject);
    });
  });

  it("uses CRLF line endings per RFC 2822", () => {
    const { mimeText } = buildMimeMessage(from, to, subject, body);
    const lines = mimeText.split("\r\n");
    // Should have: From, To, Subject, Content-Type, empty line, body
    expect(lines.length).toBeGreaterThanOrEqual(6);
    expect(lines[0]).toBe(`From: ${from}`);
  });

  it("has an empty line separating headers from body", () => {
    const { mimeText } = buildMimeMessage(from, to, subject, body);
    // RFC 2822: headers and body separated by blank line
    expect(mimeText).toContain("\r\n\r\n");
    const [headers, messageBody] = mimeText.split("\r\n\r\n");
    expect(headers).toContain("Content-Type:");
    expect(messageBody).toBe(body);
  });

  it("includes all threading headers with Cc", () => {
    const threading = {
      threadId: "t-1",
      inReplyTo: "<msg@gmail.com>",
      references: "<msg@gmail.com>",
    };
    const { mimeText } = buildMimeMessage(from, to, subject, body, "boss@example.com", threading);
    // Verify order: From, To, Cc, Subject, In-Reply-To, References, Content-Type
    const lines = mimeText.split("\r\n");
    const headerLines = lines.slice(0, lines.indexOf(""));
    expect(headerLines[0]).toMatch(/^From:/);
    expect(headerLines[1]).toMatch(/^To:/);
    expect(headerLines[2]).toMatch(/^Cc:/);
    expect(headerLines[3]).toMatch(/^Subject:/);
    expect(headerLines[4]).toMatch(/^In-Reply-To:/);
    expect(headerLines[5]).toMatch(/^References:/);
    expect(headerLines[6]).toMatch(/^Content-Type:/);
  });
});
