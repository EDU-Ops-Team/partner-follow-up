"use node";

import type { ParsedEmail, ExtractedEntities } from "../lib/types";
import { extractSiteInfo } from "./emailParser";
import { normalizeAddress, matchAddress } from "../lib/addressNormalizer";
import { logger } from "../lib/logger";

function extractEmailAddress(str: string): string {
  const match = str.match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : str.trim().toLowerCase();
}

function extractDatesFromText(text: string): string[] {
  const dates: string[] = [];
  const patterns = [
    // Month DD, YYYY
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}/gi,
    // MM/DD/YYYY or MM-DD-YYYY
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    // YYYY-MM-DD (ISO)
    /\b\d{4}-\d{2}-\d{2}\b/g,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) dates.push(...matches);
  }
  return dates;
}

export interface ResolvedContext {
  matchedSiteIds: string[];
  matchedVendorId: string | null;
  extractedEntities: ExtractedEntities;
}

/**
 * Resolve context for an inbound email.
 *
 * This function is designed to be called from the classifyInbound action,
 * which passes in pre-fetched data from Convex queries. This avoids needing
 * direct database access in the service layer.
 */
export function resolveContext(
  email: ParsedEmail,
  vendorLookupResult: { vendorId: string; vendorName: string } | null,
  existingThread: { linkedSiteIds: string[] } | null,
  allSiteAddresses: Array<{ id: string; normalizedAddress: string }>
): ResolvedContext {
  const senderEmail = extractEmailAddress(email.from);

  // Extract entities from email body
  const siteInfo = extractSiteInfo(email);
  const dates = extractDatesFromText(email.body);

  const extractedEntities: ExtractedEntities = {
    siteAddress: siteInfo?.address,
    vendorName: vendorLookupResult?.vendorName,
    dates: dates.length > 0 ? dates : undefined,
  };

  // Determine matched site IDs
  const matchedSiteIds: string[] = [];

  // First: if thread already links to sites, carry those forward
  if (existingThread?.linkedSiteIds?.length) {
    matchedSiteIds.push(...existingThread.linkedSiteIds);
  }

  // Second: if we extracted an address, try to match it to a site
  if (siteInfo?.address) {
    const candidates = allSiteAddresses.map((s) => ({
      original: s.id,
      normalized: s.normalizedAddress,
    }));

    const result = matchAddress(
      siteInfo.address,
      candidates.map((c) => c.normalized)
    );

    if (result.matched && result.matchedAddress) {
      const matchedCandidate = candidates.find((c) => c.normalized === normalizeAddress(result.matchedAddress!));
      if (matchedCandidate && !matchedSiteIds.includes(matchedCandidate.original)) {
        matchedSiteIds.push(matchedCandidate.original);
      }
    }
  }

  logger.info("Context resolved", {
    senderEmail,
    matchedSiteCount: matchedSiteIds.length,
    matchedVendor: vendorLookupResult?.vendorName ?? "none",
    hasAddress: !!siteInfo?.address,
  });

  return {
    matchedSiteIds,
    matchedVendorId: vendorLookupResult?.vendorId ?? null,
    extractedEntities,
  };
}
