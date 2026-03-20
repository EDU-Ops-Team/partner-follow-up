import type { ParsedEmail, ExtractedSiteInfo } from "../lib/types";
import { logger } from "../lib/logger";

type ExtractSiteInfoOptions = {
  requireStrongSiteIntent?: boolean;
};

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function stripSignatureContent(text: string): string {
  const lines = text.split(/\r?\n/);
  const signatureStartPatterns = [
    /^thanks[,!-\s]*$/i,
    /^thank you[,!-\s]*$/i,
    /^best[,!-\s]*$/i,
    /^best regards[,!-\s]*$/i,
    /^regards[,!-\s]*$/i,
    /^sincerely[,!-\s]*$/i,
    /^sent from my/i,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }
    if (signatureStartPatterns.some((pattern) => pattern.test(trimmed))) {
      return lines.slice(0, index).join("\n");
    }
  }

  return text;
}

function hasStrongSiteIntent(text: string): boolean {
  return /\b(new site|site kickoff|site request|please schedule|schedule (?:the )?site|site below|for the following site|lidar|building inspection|inspection|sir|site initiation report)\b/i.test(text);
}

function hasSiteWorkflowContext(address: string, text: string): boolean {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return false;
  }

  const addressPattern = new RegExp(escapeRegex(address), "i");
  const match = normalizedText.match(addressPattern);
  if (!match || match.index === undefined) {
    return false;
  }

  const start = Math.max(0, match.index - 160);
  const end = Math.min(normalizedText.length, match.index + address.length + 160);
  const window = normalizedText.slice(start, end);

  const positivePatterns = [
    /\b(new site|site kickoff|site request|schedule (?:the )?site|site below|for the following site)\b/i,
    /\b(lidar|building inspection|inspection|sir|site initiation report)\b/i,
    /\b(schedule|scheduled|scheduling|kickoff|project site|property site)\b/i,
  ];
  const negativePatterns = [
    /\b(send|mail|mailing|ship|shipping|deliver|delivery|invoice|insurance packet|w-9|tax form|signature)\b/i,
    /\b(thanks|thank you|best regards|regards|sincerely)\b/i,
  ];

  return positivePatterns.some((pattern) => pattern.test(window)) &&
    !negativePatterns.some((pattern) => pattern.test(window));
}

function scoreAddressInContext(address: string, text: string): number {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return 0;
  }

  const addressPattern = new RegExp(escapeRegex(address), "i");
  const match = normalizedText.match(addressPattern);
  if (!match || match.index === undefined) {
    return 0;
  }

  const start = Math.max(0, match.index - 120);
  const end = Math.min(normalizedText.length, match.index + address.length + 120);
  const window = normalizedText.slice(start, end);

  let score = 0;
  if (/\b(new site|site kickoff|site request|site below|for the following site|project site|property site|lidar|building inspection|inspection|sir|site initiation report|schedule|scheduled|scheduling)\b/i.test(window)) {
    score += 80;
  }
  if (/\b(please schedule|need to schedule|would like to schedule|for the following site|site below)\b/i.test(window)) {
    score += 30;
  }
  if (/\b(send|mail|mailing|ship|shipping|deliver|delivery|invoice|insurance packet|w-9|tax form)\b/i.test(window)) {
    score -= 90;
  }
  if (/\b(signature|regards|thanks|best regards)\b/i.test(window)) {
    score -= 60;
  }
  return score;
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

export function extractSiteInfo(email: ParsedEmail, options: ExtractSiteInfoOptions = {}): ExtractedSiteInfo | null {
  const bodyWithoutQuotes = stripQuotedContent(email.body);
  const bodyWithoutSignature = stripSignatureContent(bodyWithoutQuotes);
  const requireStrongSiteIntent = options.requireStrongSiteIntent ?? false;

  const rawAddress = [
    ...extractAddress(email.subject).map((address) => ({
      address,
      score: scoreAddressCandidate(address) + 120 + scoreAddressInContext(address, email.subject),
      source: "subject",
    })),
    ...extractAddress(bodyWithoutSignature).map((address) => ({
      address,
      score: scoreAddressCandidate(address) + 70 + scoreAddressInContext(address, bodyWithoutSignature),
      source: "body_without_signature",
    })),
    ...extractAddress(bodyWithoutQuotes).map((address) => ({
      address,
      score: scoreAddressCandidate(address) + 30 + scoreAddressInContext(address, bodyWithoutQuotes),
      source: "body_without_quotes",
    })),
    ...extractAddress(email.body).map((address) => ({
      address,
      score: scoreAddressCandidate(address) + scoreAddressInContext(address, email.body),
      source: "raw_body",
    })),
  ]
    .sort((a, b) => b.score - a.score)[0] ?? null;
  const address = rawAddress && isValidAddress(rawAddress.address) ? rawAddress : null;
  if (!address) {
    logger.warn("Could not extract address from email", { messageId: email.messageId, subject: email.subject });
    return null;
  }

  if (requireStrongSiteIntent) {
    const intentSources = [email.subject, bodyWithoutSignature, bodyWithoutQuotes].filter(Boolean).join("\n");
    const strongIntent =
      hasStrongSiteIntent(intentSources) ||
      hasSiteWorkflowContext(rawAddress.address, intentSources) ||
      (rawAddress.source === "subject" && hasStrongSiteIntent(email.subject));

    if (!strongIntent) {
      logger.warn("Rejected weak site extraction from email", {
        messageId: email.messageId,
        subject: email.subject,
        address: rawAddress.address,
        source: rawAddress.source,
        score: rawAddress.score,
      });
      return null;
    }
  }

  const systemEmail = "auth.permitting@trilogy.com";
  const responsibleParty = email.to
    .filter((addr) => extractEmail(addr) !== systemEmail)
    .concat(email.cc.filter((addr) => extractEmail(addr) !== systemEmail));

  const rpAddr = responsibleParty[0] || email.to[0];
  const responsiblePartyEmail = extractEmail(rpAddr);
  const responsiblePartyName = extractName(rpAddr) || responsiblePartyEmail;

  return { address: address.address.trim(), responsiblePartyEmail, responsiblePartyName };
}

export function isTriggerEmail(email: ParsedEmail, expectedSender: string): boolean {
  return extractEmail(email.from) === expectedSender.toLowerCase();
}
