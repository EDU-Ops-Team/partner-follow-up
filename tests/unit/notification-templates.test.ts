import { describe, it, expect } from "vitest";
import {
  schedulingReminderChat,
  bothScheduledChat,
  lidarCompleteChat,
  reportReminderChat,
  reportReceivedChat,
  siteResolvedChat,
  schedulingReminderEmail,
  reportReminderEmail,
  lidarCompletionReminderEmail,
  inspectionReportReminderEmail,
} from "../../convex/lib/templates";

// Mock the Convex _generated import - templates use Doc<"sites"> type
// For tests, we create compatible objects manually
type MockSite = {
  _id: string;
  _creationTime: number;
  siteAddress: string;
  normalizedAddress: string;
  responsiblePartyEmail: string;
  responsiblePartyName?: string;
  phase: "scheduling" | "completion" | "resolved";
  triggerEmailId?: string;
  triggerDate: number;
  nextCheckDate: number;
  lidarScheduled: boolean;
  lidarScheduledDatetime?: number;
  lidarJobStatus?: string;
  lidarCompleteNotified: boolean;
  inspectionScheduled: boolean;
  inspectionDate?: string;
  inspectionTime?: string;
  reportDueDate?: string;
  reportReceived: boolean;
  reportLink?: string;
  reportLinkNotified: boolean;
  reportReminderCount: number;
  schedulingReminderCount: number;
  inspectionContactEmail?: string;
  inspectionContactName?: string;
  lidarDataAsOf?: string;
  bothScheduledNotified: boolean;
  resolved: boolean;
  resolvedAt?: number;
};

function makeSite(overrides: Partial<MockSite> = {}): MockSite {
  return {
    _id: "site_001",
    _creationTime: Date.now(),
    siteAddress: "123 Main Street, Springfield, IL 62701",
    normalizedAddress: "123 main st springfield il 62701",
    responsiblePartyEmail: "vendor@example.com",
    responsiblePartyName: "John Vendor",
    phase: "scheduling",
    triggerDate: new Date("2026-03-01").getTime(),
    nextCheckDate: new Date("2026-03-05").getTime(),
    lidarScheduled: false,
    lidarCompleteNotified: false,
    inspectionScheduled: false,
    reportReceived: false,
    reportLinkNotified: false,
    reportReminderCount: 0,
    schedulingReminderCount: 0,
    bothScheduledNotified: false,
    resolved: false,
    ...overrides,
  };
}

describe("Chat templates", () => {
  it("scheduling reminder includes address and reminder count", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = schedulingReminderChat(makeSite() as any, 4);
    expect(msg).toContain("123 Main Street");
    expect(msg).toContain("4 business days");
    expect(msg).toContain("LiDAR Scheduled: No");
    expect(msg).toContain("Reminder #1");
  });

  it("both scheduled includes dates", () => {
    const msg = bothScheduledChat(makeSite({
      lidarScheduledDatetime: new Date("2026-03-15T10:00:00").getTime(),
      inspectionDate: "2026-03-20",
      inspectionTime: "9:00 AM",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    expect(msg).toContain("Both Scheduled");
    expect(msg).toContain("Mar 15, 2026");
    expect(msg).toContain("2026-03-20");
    expect(msg).toContain("9:00 AM");
  });

  it("LiDAR complete shows status", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = lidarCompleteChat(makeSite({ lidarJobStatus: "Complete" }) as any);
    expect(msg).toContain("LiDAR Scan Complete");
    expect(msg).toContain("Complete");
  });

  it("report reminder includes due date", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = reportReminderChat(makeSite({ reportDueDate: "2026-04-01", reportReminderCount: 2 }) as any);
    expect(msg).toContain("Report Reminder");
    expect(msg).toContain("2026-04-01");
    expect(msg).toContain("Reminder #3");
  });

  it("report received includes link", () => {
    const msg = reportReceivedChat(makeSite({
      reportReceived: true,
      reportLink: "https://docs.google.com/report",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    expect(msg).toContain("Report Received");
    expect(msg).toContain("https://docs.google.com/report");
  });

  it("site resolved shows all complete", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = siteResolvedChat(makeSite({ resolved: true, reportLink: "https://link" }) as any);
    expect(msg).toContain("Site Resolved");
    expect(msg).toContain("LiDAR: Complete");
    expect(msg).toContain("Report: Received");
  });
});

describe("Email templates", () => {
  it("scheduling reminder email has correct subject and body", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject, html } = schedulingReminderEmail(makeSite() as any, 4);
    expect(subject).toContain("Scheduling Reminder");
    expect(subject).toContain("123 Main Street");
    expect(subject).toContain("Reminder #1");
    expect(html).toContain("4 business days");
    expect(html).toContain("John Vendor");
  });

  it("report reminder email has due date", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject, html } = reportReminderEmail(makeSite({ reportDueDate: "2026-04-01", reportReminderCount: 1 }) as any);
    expect(subject).toContain("Report Reminder");
    expect(subject).toContain("Reminder #2");
    expect(html).toContain("2026-04-01");
  });

  it("LiDAR completion reminder addresses original responsible party", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject, html } = lidarCompletionReminderEmail(makeSite({ lidarJobStatus: "scheduled" }) as any);
    expect(subject).toContain("LiDAR Completion Reminder");
    expect(subject).toContain("123 Main Street");
    expect(html).toContain("John Vendor");
    expect(html).toContain("LiDAR scan");
    expect(html).toContain("scheduled");
  });

  it("inspection report reminder addresses inspection contact", () => {
    const { subject, html } = inspectionReportReminderEmail(makeSite({
      reportDueDate: "2026-04-01",
      reportReminderCount: 2,
      inspectionContactName: "Steve Hehl",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    expect(subject).toContain("Inspection Report Reminder");
    expect(subject).toContain("Reminder #3");
    expect(html).toContain("Steve Hehl");
    expect(html).toContain("past due");
    expect(html).toContain("2026-04-01");
  });

  it("inspection report reminder falls back to 'Steve' when no contact name", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { html } = inspectionReportReminderEmail(makeSite({ reportReminderCount: 0 }) as any);
    expect(html).toContain("Hello Steve");
  });
});
