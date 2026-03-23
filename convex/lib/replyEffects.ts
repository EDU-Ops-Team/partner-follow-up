import type { ReplyIntent } from "./types";
import { isLidarComplete } from "../../shared/taskModel";

type SiteReplyState = {
  lidarScheduled: boolean;
  lidarJobStatus?: string;
  inspectionScheduled: boolean;
  inspectionDate?: string;
  reportReceived: boolean;
  reportLink?: string;
};

type ReplyDerivedUpdate = {
  updates: Record<string, unknown>;
  summary: string[];
};

function parseDateToTimestamp(input?: string): number | undefined {
  if (!input) {
    return undefined;
  }

  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

export function deriveInboundReplyUpdates(args: {
  site: SiteReplyState;
  classificationType: string;
  intent: ReplyIntent;
  uploadedAttachmentLinks?: string[];
}): ReplyDerivedUpdate {
  const { site, classificationType, intent, uploadedAttachmentLinks } = args;
  const updates: Record<string, unknown> = {};
  const summary: string[] = [];

  if (classificationType === "inspection_report") {
    if (!site.reportReceived) {
      updates.reportReceived = true;
      summary.push("Marked report received");
    }

    const firstLink = uploadedAttachmentLinks?.[0];
    if (firstLink && firstLink !== site.reportLink) {
      updates.reportLink = firstLink;
      summary.push("Saved report link from attachment");
    }
  }

  if (intent.type === "completion_update" && !isLidarComplete(site.lidarJobStatus)) {
    updates.lidarJobStatus = "complete";
    summary.push("Marked LiDAR complete from partner reply");
  }

  if (intent.type === "scheduling_update") {
    if (!site.lidarScheduled && !isLidarComplete(site.lidarJobStatus)) {
      updates.lidarScheduled = true;
      const lidarTs = parseDateToTimestamp(intent.extractedDate);
      if (lidarTs) {
        updates.lidarScheduledDatetime = lidarTs;
      }
      summary.push("Marked LiDAR scheduled from partner reply");
    } else if (!site.inspectionScheduled) {
      updates.inspectionScheduled = true;
      if (intent.extractedDate) {
        updates.inspectionDate = intent.extractedDate;
      }
      summary.push("Marked inspection scheduled from partner reply");
    }
  }

  return { updates, summary };
}
