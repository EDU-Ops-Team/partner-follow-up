"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Doc } from "convex/_generated/dataModel";

type DraftEmail = Doc<"draftEmails">;

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

export default function ReviewQueue() {
  const [drafts, setDrafts] = useState<DraftEmail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/review/drafts?limit=200", { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as { drafts: DraftEmail[] };
        if (active) setDrafts(data.drafts);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load drafts");
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

  if (drafts === null && !error) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-gray-400 py-8 text-center">Loading drafts...</div>
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

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pendingCount} draft{pendingCount !== 1 ? "s" : ""} pending review
          </p>
        </div>
      </div>

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
    </main>
  );
}
