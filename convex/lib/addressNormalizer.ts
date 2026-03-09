import { distance } from "fastest-levenshtein";
import { ADDRESS_MATCH_THRESHOLD } from "./constants";

const ABBREVIATIONS: Record<string, string> = {
  street: "st", avenue: "ave", boulevard: "blvd", drive: "dr", lane: "ln",
  road: "rd", court: "ct", place: "pl", circle: "cir", terrace: "ter",
  highway: "hwy", parkway: "pkwy", north: "n", south: "s", east: "e",
  west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  apartment: "apt", suite: "ste", building: "bldg", floor: "fl", unit: "unit",
};

export function normalizeAddress(address: string): string {
  let normalized = address.toLowerCase().trim();
  normalized = normalized.replace(/[.,#]/g, "");
  for (const [long, short] of Object.entries(ABBREVIATIONS)) {
    normalized = normalized.replace(new RegExp(`\\b${long}\\b`, "gi"), short);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

export interface MatchResult {
  matched: boolean;
  confidence: number;
  matchedAddress?: string;
}

export function matchAddress(
  target: string,
  candidates: string[],
  threshold = ADDRESS_MATCH_THRESHOLD
): MatchResult {
  const normalizedTarget = normalizeAddress(target);
  let bestMatch: MatchResult = { matched: false, confidence: 0 };

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeAddress(candidate);
    if (normalizedTarget === normalizedCandidate) {
      return { matched: true, confidence: 1.0, matchedAddress: candidate };
    }
    const sim = similarity(normalizedTarget, normalizedCandidate);
    if (sim > bestMatch.confidence) {
      bestMatch = { matched: sim >= threshold, confidence: sim, matchedAddress: candidate };
    }
  }
  return bestMatch;
}
