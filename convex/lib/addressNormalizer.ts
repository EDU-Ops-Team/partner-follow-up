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

/**
 * Extract the leading street number from a normalized address.
 * Returns null if no number is found.
 */
function extractStreetNumber(normalized: string): string | null {
  const match = normalized.match(/^(\d+[\-\d]*)/);
  return match ? match[1] : null;
}

/**
 * Check if two addresses have the same street number.
 * If either has no number, returns true (don't block on missing data).
 */
function streetNumbersMatch(a: string, b: string): boolean {
  const numA = extractStreetNumber(a);
  const numB = extractStreetNumber(b);
  if (!numA || !numB) return true; // can't verify, allow match
  return numA === numB;
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

    // Street numbers must match — reject "835 oak creek dr" vs "995 oak creek dr"
    if (!streetNumbersMatch(normalizedTarget, normalizedCandidate)) {
      continue;
    }

    // Exact match
    if (normalizedTarget === normalizedCandidate) {
      return { matched: true, confidence: 1.0, matchedAddress: candidate };
    }

    // Prefix/substring match: if the shorter address starts the longer one,
    // this handles cases where one source has "620 5th ave" and the other has
    // "620 5th ave s kirkland wa king county usa 98033"
    if (normalizedCandidate.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedCandidate)) {
      const shorter = normalizedTarget.length <= normalizedCandidate.length ? normalizedTarget : normalizedCandidate;
      const longer = normalizedTarget.length > normalizedCandidate.length ? normalizedTarget : normalizedCandidate;
      const coverage = shorter.length / longer.length;
      const prefixConfidence = 0.90 + (coverage * 0.10);
      if (prefixConfidence > bestMatch.confidence) {
        bestMatch = { matched: true, confidence: prefixConfidence, matchedAddress: candidate };
      }
      continue;
    }

    // Fuzzy match on the full strings
    const sim = similarity(normalizedTarget, normalizedCandidate);
    if (sim > bestMatch.confidence) {
      bestMatch = { matched: sim >= threshold, confidence: sim, matchedAddress: candidate };
    }

    // Also try fuzzy match on just the street portion (before first comma
    // in the original address, then normalized) to handle
    // "620 5th ave" vs "620 5th ave s, kirkland, wa..."
    const targetStreet = normalizeAddress(target.split(",")[0]);
    const candidateStreet = normalizeAddress(candidate.split(",")[0]);
    if (targetStreet && candidateStreet) {
      const streetSim = similarity(targetStreet, candidateStreet);
      if (streetSim >= threshold && streetSim > bestMatch.confidence) {
        bestMatch = { matched: true, confidence: streetSim, matchedAddress: candidate };
      }
    }
  }
  return bestMatch;
}
