import { describe, expect, it } from "vitest";
import {
  deriveTrackingState,
  formatTrackingStateLabel,
  isLidarComplete,
} from "../../shared/siteTracking";

describe("isLidarComplete", () => {
  it("treats common completion labels as complete", () => {
    expect(isLidarComplete("complete")).toBe(true);
    expect(isLidarComplete("Completed")).toBe(true);
    expect(isLidarComplete("done")).toBe(true);
    expect(isLidarComplete("in progress")).toBe(false);
  });
});

describe("deriveTrackingState", () => {
  it("defaults to scheduling when nothing is scheduled", () => {
    expect(deriveTrackingState({})).toEqual({
      trackingStatus: "scheduling",
      trackingScope: "none",
    });
  });

  it("shows scheduled scope for lidar only", () => {
    expect(deriveTrackingState({ lidarScheduled: true })).toEqual({
      trackingStatus: "scheduled",
      trackingScope: "lidar",
    });
  });

  it("shows scheduled scope for both", () => {
    expect(deriveTrackingState({ lidarScheduled: true, inspectionScheduled: true })).toEqual({
      trackingStatus: "scheduled",
      trackingScope: "both",
    });
  });

  it("shows complete scope for inspection when report is received", () => {
    expect(deriveTrackingState({ reportReceived: true })).toEqual({
      trackingStatus: "complete",
      trackingScope: "inspection",
    });
  });

  it("shows complete scope for both when lidar is complete and report is received", () => {
    expect(deriveTrackingState({ lidarJobStatus: "complete", reportReceived: true })).toEqual({
      trackingStatus: "complete",
      trackingScope: "both",
    });
  });

  it("prefers resolved when the site is resolved", () => {
    expect(deriveTrackingState({
      resolved: true,
      lidarScheduled: true,
      inspectionScheduled: true,
      lidarJobStatus: "complete",
      reportReceived: true,
    })).toEqual({
      trackingStatus: "resolved",
      trackingScope: "both",
    });
  });
});

describe("formatTrackingStateLabel", () => {
  it("formats scope-aware labels", () => {
    expect(formatTrackingStateLabel("scheduled", "both")).toBe("Scheduled: Both");
    expect(formatTrackingStateLabel("complete", "lidar")).toBe("Complete: LiDAR");
    expect(formatTrackingStateLabel("complete", "inspection")).toBe("Complete: Inspection");
    expect(formatTrackingStateLabel("scheduling", "none")).toBe("Scheduling");
    expect(formatTrackingStateLabel("resolved", "both")).toBe("Resolved");
  });
});
