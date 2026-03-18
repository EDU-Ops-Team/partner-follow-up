export const REVIEW_FEEDBACK_REASONS = [
  "wrong_recipient",
  "wrong_facts",
  "missing_answer",
  "wrong_tone",
  "too_vague",
  "overcommitted",
  "missing_context",
  "should_not_reply_yet",
  "escalate_to_human",
] as const;

export type ReviewFeedbackReason = (typeof REVIEW_FEEDBACK_REASONS)[number];

const REVIEW_FEEDBACK_REASON_LABELS: Record<ReviewFeedbackReason, string> = {
  wrong_recipient: "Wrong recipient",
  wrong_facts: "Wrong facts",
  missing_answer: "Missing answer",
  wrong_tone: "Wrong tone",
  too_vague: "Too vague",
  overcommitted: "Overcommitted",
  missing_context: "Missing context",
  should_not_reply_yet: "Should not reply yet",
  escalate_to_human: "Escalate to human",
};

export function getReviewFeedbackReasonLabel(reason: ReviewFeedbackReason): string {
  return REVIEW_FEEDBACK_REASON_LABELS[reason];
}

export function isReviewFeedbackReason(value: string): value is ReviewFeedbackReason {
  return (REVIEW_FEEDBACK_REASONS as readonly string[]).includes(value);
}

export function parseReviewFeedbackReasons(values?: string[]): ReviewFeedbackReason[] | undefined {
  if (!values) {
    return undefined;
  }
  return values.filter(isReviewFeedbackReason);
}
