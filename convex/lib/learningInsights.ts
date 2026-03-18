export interface LearningInsightRecord {
  classificationType: string;
  status: "pending" | "approved" | "edited" | "rejected" | "auto_sent" | "expired";
  editsMade?: boolean;
  editDistance?: number;
  editCategories?: string[];
}

export interface LearningInsightTypeSummary {
  classificationType: string;
  reviewedCount: number;
  pendingCount: number;
  passCount: number;
  approvedAsIsCount: number;
  editedCount: number;
  rejectedCount: number;
  passRate: number;
  averageEditDistance: number;
  commonEditCategories: Array<{ category: string; count: number }>;
  readyForGate: boolean;
}

export interface LearningInsightsSummary {
  totalPending: number;
  totalReviewed: number;
  totalPassed: number;
  overallPassRate: number;
  averageEditDistance: number;
  byType: LearningInsightTypeSummary[];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isReviewed(status: LearningInsightRecord["status"]): boolean {
  return status === "approved" || status === "edited" || status === "rejected";
}

function isPass(record: LearningInsightRecord): boolean {
  if (!isReviewed(record.status) || record.status === "rejected") {
    return false;
  }
  return (record.editDistance ?? (record.editsMade ? 1 : 0)) <= 0.02;
}

export function aggregateLearningInsights(
  records: LearningInsightRecord[]
): LearningInsightsSummary {
  const buckets = new Map<string, LearningInsightTypeSummary>();

  for (const record of records) {
    const key = record.classificationType || "unknown";
    const bucket = buckets.get(key) ?? {
      classificationType: key,
      reviewedCount: 0,
      pendingCount: 0,
      passCount: 0,
      approvedAsIsCount: 0,
      editedCount: 0,
      rejectedCount: 0,
      passRate: 0,
      averageEditDistance: 0,
      commonEditCategories: [],
      readyForGate: false,
    };

    if (record.status === "pending") {
      bucket.pendingCount += 1;
    }

    if (isReviewed(record.status)) {
      bucket.reviewedCount += 1;
      if (record.status === "approved" && !record.editsMade) {
        bucket.approvedAsIsCount += 1;
      }
      if (record.status === "edited") {
        bucket.editedCount += 1;
      }
      if (record.status === "rejected") {
        bucket.rejectedCount += 1;
      }
      if (isPass(record)) {
        bucket.passCount += 1;
      }
    }

    const categories = record.editCategories ?? [];
    if (categories.length > 0) {
      const counts = new Map(bucket.commonEditCategories.map((entry) => [entry.category, entry.count]));
      for (const category of categories) {
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
      bucket.commonEditCategories = Array.from(counts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
        .slice(0, 3);
    }

    const reviewedForDistance = records.filter(
      (item) => item.classificationType === key && isReviewed(item.status) && item.status !== "rejected"
    );
    const totalDistance = reviewedForDistance.reduce((sum, item) => sum + (item.editDistance ?? 0), 0);
    bucket.averageEditDistance = reviewedForDistance.length > 0
      ? round(totalDistance / reviewedForDistance.length)
      : 0;
    bucket.passRate = bucket.reviewedCount > 0
      ? round(bucket.passCount / bucket.reviewedCount)
      : 0;
    bucket.readyForGate = bucket.reviewedCount >= 20;

    buckets.set(key, bucket);
  }

  const byType = Array.from(buckets.values())
    .sort((a, b) => b.reviewedCount - a.reviewedCount || b.pendingCount - a.pendingCount);

  const totalPending = byType.reduce((sum, item) => sum + item.pendingCount, 0);
  const totalReviewed = byType.reduce((sum, item) => sum + item.reviewedCount, 0);
  const totalPassed = byType.reduce((sum, item) => sum + item.passCount, 0);
  const reviewedWithDistance = records.filter(
    (item) => isReviewed(item.status) && item.status !== "rejected"
  );
  const averageEditDistance = reviewedWithDistance.length > 0
    ? round(reviewedWithDistance.reduce((sum, item) => sum + (item.editDistance ?? 0), 0) / reviewedWithDistance.length)
    : 0;

  return {
    totalPending,
    totalReviewed,
    totalPassed,
    overallPassRate: totalReviewed > 0 ? round(totalPassed / totalReviewed) : 0,
    averageEditDistance,
    byType,
  };
}
