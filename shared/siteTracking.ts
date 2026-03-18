export const TRACKING_STATUSES = [
  "scheduling",
  "scheduled",
  "complete",
  "resolved",
] as const;

export const TRACKING_SCOPES = [
  "none",
  "lidar",
  "inspection",
  "both",
] as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[number];
export type TrackingScope = (typeof TRACKING_SCOPES)[number];

export interface TrackingStateInput {
  resolved?: boolean;
  lidarScheduled?: boolean;
  inspectionScheduled?: boolean;
  lidarJobStatus?: string;
  reportReceived?: boolean;
}

export interface TrackingState {
  trackingStatus: TrackingStatus;
  trackingScope: TrackingScope;
}

export function isLidarComplete(jobStatus?: string): boolean {
  if (!jobStatus) return false;
  return ["complete", "completed", "done", "finished"].includes(jobStatus.toLowerCase().trim());
}

function scopeFromParts(lidar: boolean, inspection: boolean): TrackingScope {
  if (lidar && inspection) return "both";
  if (lidar) return "lidar";
  if (inspection) return "inspection";
  return "none";
}

export function deriveTrackingState(input: TrackingStateInput): TrackingState {
  if (input.resolved) {
    return { trackingStatus: "resolved", trackingScope: "both" };
  }

  const lidarComplete = isLidarComplete(input.lidarJobStatus);
  const inspectionComplete = Boolean(input.reportReceived);
  const completionScope = scopeFromParts(lidarComplete, inspectionComplete);
  if (completionScope !== "none") {
    return { trackingStatus: "complete", trackingScope: completionScope };
  }

  const scheduledScope = scopeFromParts(Boolean(input.lidarScheduled), Boolean(input.inspectionScheduled));
  if (scheduledScope !== "none") {
    return { trackingStatus: "scheduled", trackingScope: scheduledScope };
  }

  return { trackingStatus: "scheduling", trackingScope: "none" };
}

export function formatTrackingStateLabel(status: TrackingStatus, scope: TrackingScope): string {
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  if (status === "scheduling" || status === "resolved" || scope === "none") {
    return statusLabel;
  }

  const scopeLabel =
    scope === "both" ? "Both" : scope === "lidar" ? "LiDAR" : "Inspection";
  return `${statusLabel}: ${scopeLabel}`;
}
