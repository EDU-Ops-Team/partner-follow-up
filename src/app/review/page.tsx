"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Doc } from "convex/_generated/dataModel";

type DraftEmail = Doc<"draftEmails">;

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
      {status}
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

export default function ReviewQueue() {
  const [drafts, setDrafts] = useState<DraftEmail[] | null>(null);
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [draftsRes, insightsRes] = await Promise.all([
          fetch("/api/review/drafts?limit=200", { cache: "no-store" }),
          fetch("/api/review/insights", { cache: "no-store" }),
        ]);
        if (!draftsRes.ok) throw new Error(`Draft request failed (${draftsRes.status})`);
        if (!insightsRes.ok) throw new Error(`Insights request failed (${insightsRes.status})`);

        const draftsData = (await draftsRes.json()) as { drafts: DraftEmail[] };
        const insightsData = (await insightsRes.json()) as { insights: LearningInsights };

        if (!active) return;
        setDrafts(draftsData.drafts);
        setInsights(insightsData.insights);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load review data");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const pendingCount = useMemo(
    () => (drafts ?? []).filter((draft) => draft.status === "pending").length,
    [drafts]
  );

  if ((drafts === null || insights === null) && !error) {
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

  const currentInsights = insights!;

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pendingCount} draft{pendingCount !== 1 ? "s" : ""} pending review
          </p>
        </div>
      </div>

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
                    <th className="px-4 py-3 text-left font-medium">Gate</th>
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
                                <span className="text-gray-400"> × {entry.count}</span>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        {(drafts ?? []).length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center text-gray-400">
            No drafts yet. Drafts will appear here once the agent starts processing emails.
          </div>
        ) : (
          <div className="space-y-3">
            {(drafts ?? []).map((draft) => (
              <Link
                key={draft._id}
                href={`/review/${draft._id}`}
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {statusBadge(draft.status)}
                    {tierBadge(draft.tier)}
                  </div>
                  <span className="text-xs text-gray-400">{timeAgo(draft.createdAt)}</span>
                </div>
                <div className="text-sm font-medium text-gray-800 mb-1">
                  {draft.originalSubject}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>To: {draft.originalTo || "-"}</span>
                  {draft.originalCc && <span>CC: {draft.originalCc}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-2 line-clamp-2">
                  {draft.originalBody.replace(/<[^>]*>/g, "").slice(0, 200)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
