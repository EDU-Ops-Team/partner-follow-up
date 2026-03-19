"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TASK_STATES, TASK_TYPES, formatTaskStateLabel, formatTaskTypeLabel } from "../../../../shared/taskModel";

type SignalDetail = {
  signal: {
    _id: string;
    taskType?: (typeof TASK_TYPES)[number];
    proposedState?: (typeof TASK_STATES)[number];
    currentState?: (typeof TASK_STATES)[number];
    confidence: number;
    status: "pending" | "approved" | "rejected" | "applied";
    evidenceSnippet?: string;
    siteId?: string;
    reviewNote?: string;
  };
  message: {
    from: string;
    to: string[];
    cc: string[];
    subject: string;
    sentAt: number;
    bodyText: string;
    attachments?: Array<{ name: string; mimeType?: string; url?: string }>;
  } | null;
  siteOptions: Array<{ _id: string; label: string }>;
  siteTasks: Array<{ _id: string; taskType: (typeof TASK_TYPES)[number]; partnerName: string; state: (typeof TASK_STATES)[number] }>;
};

function formatDatetime(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TaskSignalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const signalId = params.id as string;

  const [detail, setDetail] = useState<SignalDetail | null | undefined>(undefined);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedTaskType, setSelectedTaskType] = useState<(typeof TASK_TYPES)[number] | "">("");
  const [selectedState, setSelectedState] = useState<(typeof TASK_STATES)[number] | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/task-signals/${encodeURIComponent(signalId)}`, { cache: "no-store" });
        if (res.status === 404) {
          if (active) setDetail(null);
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const payload = (await res.json()) as SignalDetail;
        if (!active) return;
        setDetail(payload);
        setSelectedSiteId(payload.signal.siteId ?? "");
        setSelectedTaskType(payload.signal.taskType ?? "");
        setSelectedState(payload.signal.proposedState ?? "");
        setNote(payload.signal.reviewNote ?? "");
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load signal");
      }
    })();
    return () => {
      active = false;
    };
  }, [signalId]);

  const reviewer = useMemo(() => {
    const user = session?.user as Record<string, unknown> | undefined;
    return {
      reviewerEmail: typeof user?.email === "string" ? user.email : undefined,
      reviewerName: typeof user?.name === "string" ? user.name : undefined,
    };
  }, [session]);

  async function postAction(path: string, body: object) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Request failed (${res.status})`);
    }
  }

  if (detail === undefined && !error) {
    return <main className="max-w-5xl mx-auto px-4 py-8"><div className="text-gray-400 py-8 text-center">Loading signal...</div></main>;
  }

  if (error) {
    return <main className="max-w-5xl mx-auto px-4 py-8"><div className="text-red-600 py-8 text-center">{error}</div></main>;
  }

  if (detail === null) {
    return <main className="max-w-5xl mx-auto px-4 py-8"><div className="text-gray-400 py-8 text-center">Signal not found.</div></main>;
  }

  const signal = detail!.signal;
  const message = detail!.message;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => router.push("/task-signals")} className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to task signals
        </button>
        <span className="text-xs text-gray-400">Confidence {Math.round(signal.confidence * 100)}%</span>
      </div>

      {message && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{message.subject}</h1>
            <div className="text-sm text-gray-500 mt-1">From {message.from} � {formatDatetime(message.sentAt)}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">To</div>
              <div className="text-gray-800">{message.to.join(", ") || "�"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">CC</div>
              <div className="text-gray-800">{message.cc.join(", ") || "�"}</div>
            </div>
          </div>
          {message.attachments && message.attachments.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Attachments</div>
              <div className="flex flex-wrap gap-2">
                {message.attachments.map((attachment) => (
                  <span key={`${attachment.name}-${attachment.url ?? ""}`} className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium">
                    {attachment.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="rounded border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
            {message.bodyText}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Apply Task Signal</h2>
          <p className="text-sm text-gray-500 mt-1">Review the inferred site, task type, and state transition before updating live task history.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Site</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            >
              <option value="">Select site</option>
              {detail!.siteOptions.map((site) => (
                <option key={site._id} value={site._id}>{site.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Task Type</label>
            <select
              value={selectedTaskType}
              onChange={(e) => setSelectedTaskType(e.target.value as (typeof TASK_TYPES)[number] | "")}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            >
              <option value="">Select task type</option>
              {TASK_TYPES.map((taskType) => (
                <option key={taskType} value={taskType}>{formatTaskTypeLabel(taskType)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Proposed State</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value as (typeof TASK_STATES)[number] | "")}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            >
              <option value="">Select state</option>
              {TASK_STATES.map((state) => (
                <option key={state} value={state}>{formatTaskStateLabel(state)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
          <div>Current inferred state: {signal.currentState ? formatTaskStateLabel(signal.currentState) : "Unknown"}</div>
          {signal.evidenceSnippet && <div className="mt-2 text-xs text-gray-500">Evidence: {signal.evidenceSnippet}</div>}
        </div>

        {detail!.siteTasks.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Current tasks for matched site</div>
            <div className="space-y-2">
              {detail!.siteTasks.map((task) => (
                <div key={task._id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-gray-800">{formatTaskTypeLabel(task.taskType)}</div>
                    <div className="text-xs text-gray-500">{task.partnerName}</div>
                  </div>
                  <span className="text-xs text-gray-600">{formatTaskStateLabel(task.state)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Review note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            placeholder="Add context for edits, rejections, or backward transitions."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                if (!reviewer.reviewerEmail) {
                  throw new Error("Missing reviewer session");
                }
                if (!selectedSiteId || !selectedTaskType || !selectedState) {
                  throw new Error("Choose a site, task type, and state before applying");
                }
                await postAction(`/api/task-signals/${encodeURIComponent(signalId)}/apply`, {
                  ...reviewer,
                  siteId: selectedSiteId,
                  taskType: selectedTaskType,
                  proposedState: selectedState,
                  note: note.trim() || undefined,
                });
                router.push("/task-signals");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to apply signal");
              } finally {
                setSubmitting(false);
              }
            }}
            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Applying..." : "Apply to Task"}
          </button>
          <button
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                if (!reviewer.reviewerEmail) {
                  throw new Error("Missing reviewer session");
                }
                await postAction(`/api/task-signals/${encodeURIComponent(signalId)}/reject`, {
                  ...reviewer,
                  note: note.trim() || undefined,
                });
                router.push("/task-signals");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to reject signal");
              } finally {
                setSubmitting(false);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </div>

        {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </main>
  );
}
