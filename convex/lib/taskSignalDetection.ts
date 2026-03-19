import { matchAddress, normalizeAddress } from "./addressNormalizer";
import { TASK_STATES, type TaskState, type TaskType } from "../../shared/taskModel";

export type SignalSiteCandidate = {
  _id: string;
  siteAddress: string;
  fullAddress?: string;
  responsiblePartyEmail: string;
  inspectionContactEmail?: string;
};

export type SignalMessageCandidate = {
  subject: string;
  bodyText: string;
  from: string;
  to: string[];
  cc: string[];
  attachments?: Array<{
    name: string;
    mimeType?: string;
    url?: string;
  }>;
};

export type DetectedTaskSignal = {
  siteId?: string;
  taskType?: TaskType;
  partnerKey?: string;
  proposedState?: TaskState;
  confidence: number;
  evidenceSnippet?: string;
  detector: string;
};

const DETECTOR_NAME = "group_backfill_heuristic_v1";
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ADDRESS_REGEX = /(\d+\s+[A-Za-z0-9.'\-\s]+(?:street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|road|rd|court|ct|place|pl|circle|cir|way|terrace|ter|highway|hwy|parkway|pkwy)(?:[^\n,;]*)?(?:,\s*[^\n,;]+){0,3})/gi;

const TASK_PARTNER_KEYS: Record<TaskType, string> = {
  sir: "cds",
  lidar_scan: "scanning_vendor",
  building_inspection: "worksmith",
};

function lower(value: string): string {
  return value.toLowerCase();
}

function extractEmails(value: string): string[] {
  return Array.from(value.matchAll(EMAIL_REGEX)).map((match) => lower(match[0]));
}

function extractParticipantEmails(message: SignalMessageCandidate): string[] {
  const raw = [message.from, ...message.to, ...message.cc].join(" ");
  return Array.from(new Set(extractEmails(raw)));
}

function extractAddressCandidates(text: string): string[] {
  return Array.from(text.matchAll(ADDRESS_REGEX)).map((match) => match[1].trim());
}

function detectTaskType(text: string): TaskType | undefined {
  if (/site initiation report|\bsir\b|\bcds\b/i.test(text)) {
    return "sir";
  }
  if (/lidar|matterport|3d scan|point cloud|as-built|scan scheduled|scan complete/i.test(text)) {
    return "lidar_scan";
  }
  if (/building inspection|inspection report|\binspection\b|svrr|dohmh|health department|site viable/i.test(text)) {
    return "building_inspection";
  }
  return undefined;
}

function detectTaskState(text: string, taskType: TaskType, hasAttachments: boolean): TaskState | undefined {
  if (/blocked|hold off|cannot proceed|can't proceed|serious barriers|waiting on .*lease|waiting on .*loi/i.test(text)) {
    return "blocked";
  }

  if (hasAttachments || /attached is|attached report|report attached|please find attached|attached .*sir|attached .*inspection/i.test(text)) {
    if (taskType === "sir" || taskType === "building_inspection" || taskType === "lidar_scan") {
      return "in_review";
    }
  }

  if (/scheduled for|scheduled on|confirmed for|appointment|inspection on|scan on|set for/i.test(text)) {
    return "scheduled";
  }

  if (/in progress|underway|conducting|facilitating today'?s inspection|working on/i.test(text)) {
    return "in_progress";
  }

  if (/completed|complete|finished|delivered|done/i.test(text)) {
    return "completed";
  }

  if (/need to schedule|would like to move forward|get .* scheduled|please schedule|check in and see|follow up on .*schedule/i.test(text)) {
    return "requested";
  }

  return undefined;
}

function matchSite(
  sites: SignalSiteCandidate[],
  message: SignalMessageCandidate,
  messageText: string,
): { siteId?: string; confidence: number } {
  const participantEmails = extractParticipantEmails(message);
  const addressCandidates = extractAddressCandidates(messageText);
  let bestSiteId: string | undefined;
  let bestConfidence = 0;

  for (const site of sites) {
    let score = 0;
    const responsible = lower(site.responsiblePartyEmail);
    const inspection = site.inspectionContactEmail ? lower(site.inspectionContactEmail) : undefined;

    if (participantEmails.includes(responsible)) {
      score += 0.55;
    }
    if (inspection && participantEmails.includes(inspection)) {
      score += 0.3;
    }

    const candidateAddresses = [site.fullAddress, site.siteAddress].filter(Boolean) as string[];
    const normalizedMessage = normalizeAddress(messageText);
    for (const candidate of candidateAddresses) {
      const normalizedCandidate = normalizeAddress(candidate);
      if (normalizedMessage.includes(normalizedCandidate)) {
        score = Math.max(score, 0.95);
      }
    }

    if (score < 0.95 && addressCandidates.length > 0) {
      for (const extracted of addressCandidates) {
        const match = matchAddress(extracted, candidateAddresses, 0.85);
        if (match.matched) {
          score = Math.max(score, 0.4 + (match.confidence * 0.5));
        }
      }
    }

    if (score > bestConfidence) {
      bestConfidence = score;
      bestSiteId = site._id;
    }
  }

  if (bestConfidence < 0.45) {
    return { confidence: 0 };
  }

  return {
    siteId: bestSiteId,
    confidence: Math.min(bestConfidence, 0.99),
  };
}

function buildEvidenceSnippet(message: SignalMessageCandidate): string | undefined {
  const combined = [message.subject, message.bodyText]
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  if (!combined) {
    return undefined;
  }

  return combined.slice(0, 280);
}

export function detectTaskSignalFromMessage(
  sites: SignalSiteCandidate[],
  message: SignalMessageCandidate,
): DetectedTaskSignal | null {
  const combinedText = `${message.subject}\n${message.bodyText}`;
  const taskType = detectTaskType(combinedText);
  if (!taskType) {
    return null;
  }

  const siteMatch = matchSite(sites, message, combinedText);
  if (!siteMatch.siteId) {
    return null;
  }

  const proposedState = detectTaskState(combinedText, taskType, (message.attachments?.length ?? 0) > 0);
  if (!proposedState || !TASK_STATES.includes(proposedState)) {
    return null;
  }

  const confidence = Math.min(
    0.99,
    0.2
      + 0.2
      + siteMatch.confidence
      + ((message.attachments?.length ?? 0) > 0 ? 0.05 : 0),
  );

  return {
    siteId: siteMatch.siteId,
    taskType,
    partnerKey: TASK_PARTNER_KEYS[taskType],
    proposedState,
    confidence,
    evidenceSnippet: buildEvidenceSnippet(message),
    detector: DETECTOR_NAME,
  };
}

export function getDetectorName() {
  return DETECTOR_NAME;
}

export function getTaskPartnerKey(taskType: TaskType) {
  return TASK_PARTNER_KEYS[taskType];
}
