import type { ParsedEmail, ExtractedSiteInfo } from "../lib/types";
import { logger } from "../lib/logger";

function extractEmail(str: string): string {
  const match = str.match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : str.trim().toLowerCase();
}

function extractName(str: string): string {
  const match = str.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : "";
}

function findAddressMatches(text: string): string[] {
  const patterns = [
    /(\d+\s+[\w\s]+(?:street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|road|rd|court|ct|place|pl|circle|cir|way|terrace|ter|highway|hwy|parkway|pkwy)[.,]?\s*(?:(?:apt|ste|suite|unit|#)\s*[\w-]+[.,]?\s*)?[\w\s]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)/i,
    /(\d+\s+[\w\s]+(?:street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|road|rd|court|ct|place|pl|circle|cir|way|terrace|ter|highway|hwy|parkway|pkwy)[.,]?\s*(?:(?:apt|ste|suite|unit|#)\s*[\w-]+[.,]?\s*)?[\w\s]+,\s*[A-Z]{2})/i,
    /(\d+\s+[\w\s]+(?:street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|road|rd|court|ct|place|pl|circle|cir|way|terrace|ter|highway|hwy|parkway|pkwy))/i,
  ];
  const matches: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) matches.push(match[1].trim());
  }
  return matches;
}

function scoreAddressCandidate(address: string): number {
  let score = address.length;
  if (/\b[A-Z]{2}\s*\d{5}(?:-\d{4})?$/i.test(address)) score += 100;
  else if (/\b[A-Z]{2}$/i.test(address)) score += 60;
  else if (address.includes(",")) score += 20;
  return score;
}

function extractAddress(text: string): string[] {
  return findAddressMatches(text)
    .filter(isValidAddress)
    .sort((a, b) => scoreAddressCandidate(b) - scoreAddressCandidate(a));
}

function stripQuotedContent(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^on .+wrote:$/i.test(trimmed)) break;
    if (/^(from|sent|to|subject):/i.test(trimmed)) break;
    if (trimmed.startsWith(">")) continue;
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Validate that an extracted string looks like a real street address.
 * Rejects time strings, names, and other false positives.
 */
function isValidAddress(address: string): boolean {
  // Must be at least 10 characters (e.g., "1 Main St")
  if (address.length < 10) return false;

  // Must start with a street number
  if (!/^\d+\s/.test(address)) return false;

  // Must contain a street-type word (not just a number + random words)
  const streetTypes = /\b(street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|road|rd|court|ct|place|pl|circle|cir|way|terrace|ter|highway|hwy|parkway|pkwy)\b/i;
  if (!streetTypes.test(address)) return false;

  // Reject if it looks like a time (e.g., "13 PM", "1:30 AM")
  if (/^\d{1,2}\s*(am|pm)\b/i.test(address)) return false;

  return true;
}

export function extractSiteInfo(email: ParsedEmail): ExtractedSiteInfo | null {
  const bodyWithoutQuotes = stripQuotedContent(email.body);
  const rawAddress = [
    ...extractAddress(bodyWithoutQuotes).map((address) => ({
      address,
      score: scoreAddressCandidate(address) + 20,
    })),
    ...extractAddress(email.subject).map((address) => ({
      address,
      score: scoreAddressCandidate(address) + 10,
    })),
    ...extractAddress(email.body).map((address) => ({
      address,
      score: scoreAddressCandidate(address),
    })),
  ]
    .sort((a, b) => b.score - a.score)[0]?.address ?? null;
  const address = rawAddress && isValidAddress(rawAddress) ? rawAddress : null;
  if (!address) {
    logger.warn("Could not extract address from email", { messageId: email.messageId, subject: email.subject });
    return null;
  }

  const systemEmail = "auth.permitting@trilogy.com";
  const responsibleParty = email.to
    .filter((addr) => extractEmail(addr) !== systemEmail)
    .concat(email.cc.filter((addr) => extractEmail(addr) !== systemEmail));

  const rpAddr = responsibleParty[0] || email.to[0];
  const responsiblePartyEmail = extractEmail(rpAddr);
  const responsiblePartyName = extractName(rpAddr) || responsiblePartyEmail;

  return { address: address.trim(), responsiblePartyEmail, responsiblePartyName };
}

export function isTriggerEmail(email: ParsedEmail, expectedSender: string): boolean {
  return extractEmail(email.from) === expectedSender.toLowerCase();
}
