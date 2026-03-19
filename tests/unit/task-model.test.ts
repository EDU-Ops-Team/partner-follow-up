import { describe, expect, it } from "vitest";
import { calculateProgress, deriveTaskStateFromSite, formatTaskStateLabel, formatTaskTypeLabel, getTaskProgressValue } from "../../shared/taskModel";

describe("deriveTaskStateFromSite", () => {
  it("marks lidar as requested until scheduled", () => {
    expect(deriveTaskStateFromSite("lidar_scan", {})).toBe("requested");
  });

  it("marks lidar as completed when job status is complete", () => {
    expect(deriveTaskStateFromSite("lidar_scan", { lidarJobStatus: "Completed" })).toBe("completed");
  });

  it("marks building inspection as completed when a report is present", () => {
    expect(deriveTaskStateFromSite("building_inspection", { reportReceived: true })).toBe("completed");
  });
});

describe("calculateProgress", () => {
  it("uses weighted task progress and excludes not needed tasks", () => {
    const progress = calculateProgress([
      {
        taskType: "sir",
        partnerKey: "cds",
        partnerName: "CDS",
        milestone: "M1",
        state: "requested",
        stateUpdatedAt: 1,
        lastProgressValue: getTaskProgressValue("requested"),
      },
      {
        taskType: "lidar_scan",
        partnerKey: "scanning_vendor",
        partnerName: "Scanning Vendor",
        milestone: "M1",
        state: "scheduled",
        stateUpdatedAt: 1,
        lastProgressValue: getTaskProgressValue("scheduled"),
      },
      {
        taskType: "building_inspection",
        partnerKey: "worksmith",
        partnerName: "Worksmith",
        milestone: "M1",
        state: "not_needed",
        stateUpdatedAt: 1,
        lastProgressValue: getTaskProgressValue("not_needed"),
      },
    ]);

    expect(progress.percentComplete).toBe(22.5);
    expect(progress.activeTaskCount).toBe(2);
  });

  it("preserves blocked task value from the prior state", () => {
    const progress = calculateProgress([
      {
        taskType: "sir",
        partnerKey: "cds",
        partnerName: "CDS",
        milestone: "M1",
        state: "blocked",
        stateUpdatedAt: 1,
        lastProgressValue: 50,
      },
    ]);

    expect(progress.percentComplete).toBe(50);
    expect(progress.blockedTaskCount).toBe(1);
  });
});

describe("task labels", () => {
  it("formats task labels for display", () => {
    expect(formatTaskTypeLabel("building_inspection")).toBe("Building Inspection");
    expect(formatTaskStateLabel("in_review")).toBe("In review");
  });
});
