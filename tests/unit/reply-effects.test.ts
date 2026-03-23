import { describe, expect, it } from "vitest";
import { deriveInboundReplyUpdates } from "../../convex/lib/replyEffects";

describe("deriveInboundReplyUpdates", () => {
  it("marks inspection reports received and stores uploaded report link", () => {
    const result = deriveInboundReplyUpdates({
      site: {
        lidarScheduled: true,
        inspectionScheduled: true,
        reportReceived: false,
      },
      classificationType: "inspection_report",
      intent: {
        type: "attachment_only",
        hasAttachments: true,
        summary: "Attached report",
      },
      uploadedAttachmentLinks: ["https://drive.example/report.pdf"],
    });

    expect(result.updates).toEqual({
      reportReceived: true,
      reportLink: "https://drive.example/report.pdf",
    });
  });

  it("marks lidar as scheduled first when no work has been scheduled yet", () => {
    const result = deriveInboundReplyUpdates({
      site: {
        lidarScheduled: false,
        inspectionScheduled: false,
        reportReceived: false,
      },
      classificationType: "vendor_scheduling",
      intent: {
        type: "scheduling_update",
        extractedDate: "March 30, 2026",
        hasAttachments: false,
        summary: "Scheduled for March 30",
      },
    });

    expect(result.updates.lidarScheduled).toBe(true);
    expect(result.updates.lidarScheduledDatetime).toBeTypeOf("number");
    expect(result.updates.inspectionScheduled).toBeUndefined();
  });

  it("marks inspection scheduled after lidar is already scheduled", () => {
    const result = deriveInboundReplyUpdates({
      site: {
        lidarScheduled: true,
        lidarJobStatus: "Scheduled",
        inspectionScheduled: false,
        reportReceived: false,
      },
      classificationType: "vendor_scheduling",
      intent: {
        type: "scheduling_update",
        extractedDate: "April 2 at 10 AM",
        hasAttachments: false,
        summary: "Inspection booked",
      },
    });

    expect(result.updates).toEqual({
      inspectionScheduled: true,
      inspectionDate: "April 2 at 10 AM",
    });
  });

  it("marks lidar complete from a completion update", () => {
    const result = deriveInboundReplyUpdates({
      site: {
        lidarScheduled: true,
        lidarJobStatus: "Pending",
        inspectionScheduled: false,
        reportReceived: false,
      },
      classificationType: "vendor_completion",
      intent: {
        type: "completion_update",
        extractedStatus: "complete",
        hasAttachments: false,
        summary: "Completed today",
      },
    });

    expect(result.updates).toEqual({
      lidarJobStatus: "complete",
    });
  });
});
