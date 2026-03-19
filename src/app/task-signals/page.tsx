"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatTaskStateLabel, formatTaskTypeLabel } from "../../../shared/taskModel";

type SignalListItem = {
  signal: {
    _id: string;
    taskType?: "sir" | "lidar_scan" | "building_inspection";
    proposedState?: "not_started" | "requested" | "scheduled" | "in_progress" | "in_review" | "completed" | "blocked" | "not_needed";
    confidence: number;
    status: "pending" | "approved" | "rejected" | "applied";
    createdAt: number;
    evidenceSnippet?: string;
    siteId?: string;
  };
  message: {
    from: string;
    subject: string;
    sentAt: number;
  };
  site: {
    _id: string;
    fullAddress?: string;
    siteAddress: string;
  } | null;
};

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusBadge(status: SignalListItem["signal"]["status"]) {
  const colors: Record<SignalListItem["signal"]["status"], string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-blue-100 text-blue-800",
    rejected: "bg-red-100 text-red-800",
    applied: "bg-green-100 text-green-800",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status]}`}>{status}</span>;
}

function confidenceBadge(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.85 ? "text-green-600" : confidence >= 0.65 ? "text-yellow-600" : "text-red-500";
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

export default function TaskSignalsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: "admin" | "reviewer" } | undefined)?.role;
  const isAdmin = role === "admin";

  const [signals, setSignals] = useState<SignalListItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/task-signals?status=pending&limit=200", { cache: "no-store" });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const payload = (await res.json()) as { signals: SignalListItem[] };
    setSignals(payload.signals);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load signals");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function runExtraction() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/trigger-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "signals" }),
      });
      const payload = (await res.json()) as { error?: string; result?: { created?: number; skipped?: number; messageCount?: number } };
      if (!res.ok) {
        throw new Error(payload.error ?? `Request failed (${res.status})`);
      }
      setMessage(`Signal extraction ran. ${payload.result?.created ?? 0} signal(s) created from ${payload.result?.messageCount ?? 0} archived message(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract signals");
    } finally {
      setRunning(false);
    }
  }

  if (signals === null && !error) {
    return <main className="max-w-7xl mx-auto px-4 py-8"><div className="text-gray-400 py-8 text-center">Loading task signals...</div></main>;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Task Signals</h1>
          <p className="text-sm text-gray-500 mt-1">Review Google Groups backfill signals before they update live task history.</p>
        </div>
        {isAdmin && (
          <button
            onClick={runExtraction}
            disabled={running}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? "Extracting..." : "Extract Signals"}
          </button>
        )}
      </div>

      {message && <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {(signals ?? []).length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center text-gray-400">
          No pending task signals yet.
        </div>
      ) : (
        <div className="space-y-3">
          {(signals ?? []).map((item) => (
            <Link
              key={item.signal._id}
              href={`/task-signals/${item.signal._id}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm hover:border-gray-300 transition-all"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(item.signal.status)}
                  {item.signal.taskType && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                      {formatTaskTypeLabel(item.signal.taskType)}
                    </span>
                  )}
                  {item.signal.proposedState && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {formatTaskStateLabel(item.signal.proposedState)}
                    </span>
                  )}
                  {confidenceBadge(item.signal.confidence)}
                </div>
                <span className="text-xs text-gray-400">{timeAgo(item.signal.createdAt)}</span>
              </div>
              <div className="text-sm font-medium text-gray-900">{item.message.subject}</div>
              <div className="text-xs text-gray-500 mt-1">From {item.message.from}</div>
              <div className="text-xs text-gray-500 mt-1">
                {item.site ? `Matched site: ${item.site.fullAddress ?? item.site.siteAddress}` : "Needs site review"}
              </div>
              {item.signal.evidenceSnippet && (
                <div className="mt-2 text-xs text-gray-500 line-clamp-3">{item.signal.evidenceSnippet}</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
