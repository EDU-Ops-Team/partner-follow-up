import { distance } from "fastest-levenshtein";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeEmailField(value?: string | null): string {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join(", ");
}

function normalizedDistance(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) {
    return 0;
  }
  return distance(a, b) / maxLength;
}

export interface ReviewDiffInput {
  originalTo: string;
  originalCc?: string;
  originalSubject: string;
  originalBodyHtml: string;
  editedTo: string;
  editedCc?: string;
  editedSubject: string;
  editedBodyText: string;
}

export interface ReviewDiffMetrics {
  editsMade: boolean;
  editDistance: number;
  editCategories: string[];
}

export function analyzeReviewDiff(input: ReviewDiffInput): ReviewDiffMetrics {
  const categories: string[] = [];

  const originalTo = normalizeEmailField(input.originalTo);
  const editedTo = normalizeEmailField(input.editedTo);
  if (originalTo !== editedTo) {
    categories.push("recipient_to_changed");
  }

  const originalCc = normalizeEmailField(input.originalCc);
  const editedCc = normalizeEmailField(input.editedCc);
  if (originalCc !== editedCc) {
    categories.push("recipient_cc_changed");
  }

  const originalSubject = normalizeText(input.originalSubject);
  const editedSubject = normalizeText(input.editedSubject);
  if (originalSubject !== editedSubject) {
    categories.push("subject_changed");
  }

  const originalBody = normalizeText(htmlToPlainText(input.originalBodyHtml));
  const editedBody = normalizeText(input.editedBodyText);
  const bodyDistance = normalizedDistance(originalBody, editedBody);
  if (bodyDistance > 0) {
    if (bodyDistance <= 0.05) {
      categories.push("body_minor_edit");
    } else if (bodyDistance <= 0.2) {
      categories.push("body_major_edit");
    } else {
      categories.push("body_rewrite");
    }
  }

  const originalContent = [originalSubject, originalBody].join("\n\n");
  const editedContent = [editedSubject, editedBody].join("\n\n");

  return {
    editsMade: categories.length > 0,
    // Deliberately excludes CC-only changes from the distance metric.
    editDistance: normalizedDistance(originalContent, editedContent),
    editCategories: categories,
  };
}
