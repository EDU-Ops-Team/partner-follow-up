"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Doc } from "convex/_generated/dataModel";
import { getReviewFeedbackReasonLabel } from "../../../shared/reviewFeedback";

type DraftEmail = Doc<"draftEmails">;

type ReviewQueueItem = {
  dispositionStatus: string;
  draft: DraftEmail;
  classificationType: string;
  from: string | null;
  reviewerName: string | null;
};

type ReviewQueuePayload = {
  pending: ReviewQueueItem[];
  reviewed: ReviewQueueItem[];
  insights: {
    pendingCount: number;
    reviewedCount: number;
    countsByStatus: Record<string, number>;
    topReviewedTypes: Array<{ label: string; count: number }>;
  };
};

type InsightTypeSummary = {
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
  commonFeedbackReasons: Array<{ reason: string; count: number }>;
  readyForGate: boolean;
};

type LearningInsights = {
  totalPending: number;
  totalReviewed: number;
  totalPassed: number;
  overallPassRate: number;
  averageEditDistance: number;
  byType: InsightTypeSummary[];
};

type ReviewedExample = {
  draftId: string;
  classificationType: string;
  status: "approved" | "edited" | "rejected";
  pass: boolean;
  reviewedAt: number;
  subject: string;
  from: string;
  originalBody: string;
  sentBody: string | null;
  editDistance: number | null;
  editCategories: string[];
  feedbackReasons: string[];
  feedbackNote: string | null;
  reviewerName: string | null;
};

function tierBadge(tier: number) {
  if (tier === 1) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Tier 1</span>;
  if (tier === 2) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Tier 2</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Tier {tier}</span>;
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    edited: "bg-blue-100 text-blue-800",
    rejected: "bg-red-100 text-red-800",
    auto_sent: "bg-purple-100 text-purple-800",
    expired: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function classificationLabel(type: string): string {
  const labels: Record<string, string> = {
    vendor_scheduling: "partner scheduling",
    vendor_completion: "partner completion",
    vendor_question: "partner question",
    vendor_invoice: "partner invoice",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDatetime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function summaryCard(label: string, value: string, subtext: string) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-sm text-gray-500">{subtext}</div>
    </div>
  );
}

function DraftCard({ item, reviewed = false }: { item: ReviewQueueItem; reviewed?: boolean }) {
  const reviewedAt = item.draft.reviewedAt ?? item.draft.createdAt;

  return (
    <Link
      href={`/review/${item.draft._id}`}
      className={`block rounded-lg border p-4 transition-all hover:shadow-sm ${
        reviewed
          ? "border-gray-200 bg-gray-50 hover:border-gray-300"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {statusBadge(item.draft.status)}
          {tierBadge(item.draft.tier)}
          <span className="text-xs text-gray-500">{classificationLabel(item.classificationType)}</span>
        </div>
        <span className="text-xs text-gray-400">{timeAgo(reviewed ? reviewedAt : item.draft.createdAt)}</span>
      </div>
      <div className="text-sm font-medium text-gray-800 mb-1">{item.draft.originalSubject}</div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span>To: {item.draft.originalTo || "-"}</span>
        {item.draft.originalCc && <span>CC: {item.draft.originalCc}</span>}
        {item.from && <span>From: {item.from}</span>}
        {reviewed && item.reviewerName && <span>Reviewed by {item.reviewerName}</span>}
      </div>
      <div className="text-xs text-gray-400 mt-2 line-clamp-2">
        {item.draft.originalBody.replace(/<[^>]*>/g, "").slice(0, 200)}
      </div>
      {reviewed && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
          {item.draft.editDistance !== undefined && item.draft.editDistance !== null && (
            <span>Edit distance {item.draft.editDistance.toFixed(3)}</span>
          )}
          {item.draft.feedbackReasons && item.draft.feedbackReasons.length > 0 && (
            <span>{item.draft.feedbackReasons.length} review reason{item.draft.feedbackReasons.length === 1 ? "" : "s"}</span>
          )}
          <span>{formatDatetime(reviewedAt)}</span>
        </div>
      )}
    </Link>
  );
}

export default function ReviewQueue() {
  const [queue, setQueue] = useState<ReviewQueuePayload | null>(null);
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [examples, setExamples] = useState<ReviewedExample[] | null>(null);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [queueRes, insightsRes] = await Promise.all([
          fetch("/api/review/drafts?limit=200", { cache: "no-store" }),
          fetch("/api/review/insights", { cache: "no-store" }),
        ]);
        if (!queueRes.ok) throw new Error(`Draft request failed (${queueRes.status})`);
        if (!insightsRes.ok) throw new Error(`Insights request failed (${insightsRes.status})`);

        const queueData = (await queueRes.json()) as ReviewQueuePayload;
        const insightsData = (await insightsRes.json()) as { insights: LearningInsights };

        if (!active) return;
        setQueue(queueData);
        setInsights(insightsData.insights);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load review data");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedType) {
      setExamples(null);
      setExamplesError(null);
      setExamplesLoading(false);
      return;
    }

    let active = true;
    setExamplesLoading(true);
    setExamplesError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/review/insights/examples?type=${encodeURIComponent(selectedType)}&limit=8`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`Examples request failed (${res.status})`);

        const data = (await res.json()) as { examples: ReviewedExample[] };
        if (!active) return;
        setExamples(data.examples);
      } catch (err) {
        if (active) {
          setExamplesError(err instanceof Error ? err.message : "Failed to load examples");
          setExamples([]);
        }
      } finally {
        if (active) setExamplesLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedType]);

  const reviewedGroups = useMemo(() => {
    const reviewed = queue?.reviewed ?? [];
    const statuses = Array.from(new Set(reviewed.map((item) => item.dispositionStatus))).sort((a, b) =>
      a.localeCompare(b)
    );

    return statuses
      .map((status) => ({
        status,
        items: reviewed.filter((item) => item.dispositionStatus === status),
      }))
      .filter((group) => group.items.length > 0);
  }, [queue]);

  if ((queue === null || insights === null) && !error) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-gray-400 py-8 text-center">Loading review data...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-red-600 py-8 text-center">{error}</div>
      </main>
    );
  }

  const currentQueue = queue!;
  const currentInsights = insights!;
  const approvedCount = currentQueue.insights.countsByStatus.approved ?? 0;
  const editedCount = currentQueue.insights.countsByStatus.edited ?? 0;
  const rejectedCount = currentQueue.insights.countsByStatus.rejected ?? 0;

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            {currentQueue.insights.pendingCount} draft{currentQueue.insights.pendingCount !== 1 ? "s" : ""} pending review
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Queue Overview</h2>
          <p className="text-sm text-gray-500 mt-1">
            Pending drafts are first. Reviewed drafts are grouped below by final disposition for quick drill-down.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {summaryCard("Pending", String(currentQueue.insights.pendingCount), "Drafts waiting for action")}
          {summaryCard("Approved", String(approvedCount), "Sent without material edits")}
          {summaryCard("Edited", String(editedCount), "Reviewer changed before send")}
          {summaryCard("Rejected", String(rejectedCount), "Stopped before send")}
        </div>
        {currentQueue.insights.topReviewedTypes.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Most Reviewed Types</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {currentQueue.insights.topReviewedTypes.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                  <span>{classificationLabel(item.label)}</span>
                  <span className="font-semibold text-gray-900">{item.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {currentQueue.pending.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-gray-400">
            No drafts pending review.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Pending Review</h2>
              <span className="text-xs text-gray-500">{currentQueue.pending.length}</span>
            </div>
            <div className="space-y-3">
              {currentQueue.pending.map((item) => (
                <DraftCard key={item.draft._id} item={item} />
              ))}
            </div>
          </>
        )}

        {reviewedGroups.map((group) => (
          <details key={group.status} className="rounded-lg border border-gray-200 bg-white" open={false}>
            <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {statusBadge(group.status)}
                <span className="text-sm font-semibold text-gray-900 capitalize">{group.status.replace(/_/g, " ")}</span>
                <span className="text-xs text-gray-500">{group.items.length}</span>
              </div>
              <span className="text-xs text-gray-400">Expand</span>
            </summary>
            <div className="border-t border-gray-100 p-4 space-y-3">
              {group.items.map((item) => (
                <DraftCard key={item.draft._id} item={item} reviewed />
              ))}
            </div>
          </details>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Learning Insights</h2>
          <p className="text-sm text-gray-500 mt-1">
            Passes use the current gate rule: 98% similarity or better (`editDistance &lt;= 0.02`).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {summaryCard("Reviewed", String(currentInsights.totalReviewed), "Human-reviewed drafts collected")}
          {summaryCard("Pass Rate", pct(currentInsights.overallPassRate), `${currentInsights.totalPassed} passing reviews`)}
          {summaryCard("Pending", String(currentInsights.totalPending), "Drafts still waiting in queue")}
          {summaryCard("Avg Edit Distance", currentInsights.averageEditDistance.toFixed(3), "Lower is better")}
        </div>

        {currentInsights.byType.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-gray-400">
            No reviewed drafts yet. Insights will populate after the first review actions.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Reviewed</th>
                    <th className="px-4 py-3 text-left font-medium">Pass Rate</th>
                    <th className="px-4 py-3 text-left font-medium">As-Is</th>
                    <th className="px-4 py-3 text-left font-medium">Edited</th>
                    <th className="px-4 py-3 text-left font-medium">Rejected</th>
                    <th className="px-4 py-3 text-left font-medium">Avg Distance</th>
                    <th className="px-4 py-3 text-left font-medium">Top Edit Patterns</th>
                    <th className="px-4 py-3 text-left font-medium">Top Review Reasons</th>
                    <th className="px-4 py-3 text-left font-medium">Gate</th>
                    <th className="px-4 py-3 text-left font-medium">Examples</th>
                  </tr>
                </thead>
                <tbody>
                  {currentInsights.byType.map((item) => (
                    <tr key={item.classificationType} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3 font-medium text-gray-900">{classificationLabel(item.classificationType)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.reviewedCount}
                        <div className="text-xs text-gray-400 mt-1">{item.pendingCount} pending</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{pct(item.passRate)}</td>
                      <td className="px-4 py-3 text-gray-700">{item.approvedAsIsCount}</td>
                      <td className="px-4 py-3 text-gray-700">{item.editedCount}</td>
                      <td className="px-4 py-3 text-gray-700">{item.rejectedCount}</td>
                      <td className="px-4 py-3 text-gray-700">{item.averageEditDistance.toFixed(3)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.commonEditCategories.length === 0 ? (
                          <span className="text-gray-400">No recurring edits yet</span>
                        ) : (
                          <div className="space-y-1">
                            {item.commonEditCategories.map((entry) => (
                              <div key={entry.category} className="text-xs">
                                <span className="font-medium text-gray-800">{entry.category}</span>
                                <span className="text-gray-400"> x {entry.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.commonFeedbackReasons.length === 0 ? (
                          <span className="text-gray-400">No structured reasons yet</span>
                        ) : (
                          <div className="space-y-1">
                            {item.commonFeedbackReasons.map((entry) => (
                              <div key={entry.reason} className="text-xs">
                                <span className="font-medium text-gray-800">
                                  {getReviewFeedbackReasonLabel(entry.reason as Parameters<typeof getReviewFeedbackReasonLabel>[0])}
                                </span>
                                <span className="text-gray-400"> x {entry.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.readyForGate ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                          {item.readyForGate ? "20+ reviews" : "Need 20 reviews"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            setSelectedType((current) =>
                              current === item.classificationType ? null : item.classificationType
                            )
                          }
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                            selectedType === item.classificationType
                              ? "bg-gray-900 text-white border-gray-900"
                              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          {selectedType === item.classificationType ? "Hide" : "View"} examples
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedType && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Reviewed examples for {classificationLabel(selectedType)}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Recent reviewed drafts behind this metric. Use these to spot recurring edits before changing prompts or policy.
                </p>
              </div>
              <button
                onClick={() => setSelectedType(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            {examplesLoading ? (
              <div className="text-sm text-gray-400 py-6 text-center">Loading examples...</div>
            ) : examplesError ? (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {examplesError}
              </div>
            ) : examples && examples.length > 0 ? (
              <div className="space-y-3">
                {examples.map((example) => (
                  <div key={example.draftId} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(example.status)}
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              example.pass
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {example.pass ? "Pass" : "Needs work"}
                          </span>
                          {example.editDistance !== null && (
                            <span className="text-xs text-gray-500">
                              Edit distance {example.editDistance.toFixed(3)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-medium text-gray-900">{example.subject}</div>
                        <div className="text-xs text-gray-500">
                          From {example.from} - Reviewed {formatDatetime(example.reviewedAt)}
                          {example.reviewerName ? ` - ${example.reviewerName}` : ""}
                        </div>
                      </div>
                      <Link
                        href={`/review/${example.draftId}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                      >
                        Open draft
                      </Link>
                    </div>

                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="rounded border border-gray-100 bg-gray-50 p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
                          Agent Draft
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">
                          {htmlToText(example.originalBody).slice(0, 600) || "No draft body"}
                        </div>
                      </div>
                      <div className="rounded border border-gray-100 bg-green-50 p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
                          Sent Version
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">
                          {example.sentBody ? htmlToText(example.sentBody).slice(0, 600) : "No sent version"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {example.editCategories.length === 0 ? (
                        <span className="text-xs text-gray-400">No edit categories recorded</span>
                      ) : (
                        example.editCategories.map((category) => (
                          <span
                            key={category}
                            className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium"
                          >
                            {category}
                          </span>
                        ))
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {example.feedbackReasons.length === 0 ? (
                        <span className="text-xs text-gray-400">No structured review reasons recorded</span>
                      ) : (
                        example.feedbackReasons.map((reason) => (
                          <span
                            key={reason}
                            className="px-2 py-1 rounded bg-amber-50 text-amber-800 text-xs font-medium"
                          >
                            {getReviewFeedbackReasonLabel(reason as Parameters<typeof getReviewFeedbackReasonLabel>[0])}
                          </span>
                        ))
                      )}
                    </div>
                    {example.feedbackNote && (
                      <div className="mt-3 rounded border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900 whitespace-pre-wrap">
                        {example.feedbackNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-6 text-center">
                No reviewed examples found for this type yet.
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

