"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { deriveTrackingState, formatTrackingStateLabel, isLidarComplete, type TrackingScope, type TrackingStatus } from "../../shared/siteTracking";
import { formatTaskStateLabel, formatTaskTypeLabel, type TaskState, type TaskType } from "../../shared/taskModel";

type SiteDisposition = "unreviewed" | "confirmed" | "needs_review" | "invalid";

// ── Badges ──


function taskStateBadge(state: TaskState) {
  const colors: Record<TaskState, string> = {
    not_started: "bg-gray-100 text-gray-600",
    requested: "bg-amber-100 text-amber-800",
    scheduled: "bg-sky-100 text-sky-800",
    in_progress: "bg-indigo-100 text-indigo-800",
    in_review: "bg-violet-100 text-violet-800",
    completed: "bg-emerald-100 text-emerald-800",
    blocked: "bg-rose-100 text-rose-800",
    not_needed: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors[state]}`}>
      {formatTaskStateLabel(state)}
    </span>
  );
}

function progressTone(percentComplete: number) {
  if (percentComplete >= 80) return "bg-emerald-500";
  if (percentComplete >= 40) return "bg-sky-500";
  return "bg-amber-500";
}

function ProgressBar({ percentComplete }: { percentComplete: number }) {
  const bounded = Math.max(0, Math.min(100, percentComplete));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
        <span>Progress</span>
        <span>{bounded.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progressTone(bounded)}`}
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
}

function classificationBadge(type: string) {
  const colors: Record<string, string> = {
    vendor_scheduling: "bg-purple-100 text-purple-800",
    vendor_completion: "bg-green-100 text-green-800",
    vendor_question: "bg-orange-100 text-orange-800",
    vendor_invoice: "bg-red-100 text-red-800",
    government_permit: "bg-blue-100 text-blue-800",
    government_zoning: "bg-blue-100 text-blue-800",
    inspection_report: "bg-teal-100 text-teal-800",
    internal_fyi: "bg-gray-100 text-gray-800",
    internal_action_needed: "bg-yellow-100 text-yellow-800",
    auto_reply: "bg-gray-100 text-gray-500",
    unknown: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    vendor_scheduling: "partner scheduling",
    vendor_completion: "partner completion",
    vendor_question: "partner question",
    vendor_invoice: "partner invoice",
    waiting_vendor: "waiting partner",
  };
  const label = labels[type] ?? type.replace(/_/g, " ");
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors[type] ?? "bg-gray-100 text-gray-800"}`}>
      {label}
    </span>
  );
}

const CLASSIFICATION_OPTIONS = [
  "vendor_scheduling",
  "vendor_completion",
  "vendor_question",
  "vendor_invoice",
  "government_permit",
  "government_zoning",
  "inspection_report",
  "internal_fyi",
  "internal_action_needed",
  "auto_reply",
  "unknown",
] as const;

function confidenceBadge(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.9 ? "text-green-600" : confidence >= 0.7 ? "text-yellow-600" : "text-red-500";
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

function methodBadge(method: string) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${method === "rule" ? "bg-gray-100 text-gray-600" : "bg-indigo-100 text-indigo-700"}`}>
      {method}
    </span>
  );
}

function threadStateBadge(state: string) {
  const colors: Record<string, string> = {
    active: "bg-blue-100 text-blue-800",
    waiting_vendor: "bg-yellow-100 text-yellow-800",
    waiting_human: "bg-orange-100 text-orange-800",
    escalated: "bg-red-100 text-red-800",
    resolved: "bg-green-100 text-green-800",
    archived: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors[state] ?? "bg-gray-100"}`}>
      {state === "waiting_vendor" ? "waiting partner" : state.replace(/_/g, " ")}
    </span>
  );
}

function draftStatusBadge(status: string) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    edited: "bg-blue-100 text-blue-800",
    rejected: "bg-red-100 text-red-800",
    auto_sent: "bg-gray-100 text-gray-600",
    expired: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function dispositionBadge(disposition?: SiteDisposition) {
  const value = disposition ?? "unreviewed";
  const colors: Record<SiteDisposition, string> = {
    unreviewed: "bg-gray-100 text-gray-600",
    confirmed: "bg-emerald-100 text-emerald-800",
    needs_review: "bg-amber-100 text-amber-800",
    invalid: "bg-rose-100 text-rose-800",
  };
  const labels: Record<SiteDisposition, string> = {
    unreviewed: "Unreviewed",
    confirmed: "Confirmed",
    needs_review: "Needs review",
    invalid: "Invalid",
  };
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors[value]}`}>
      {labels[value]}
    </span>
  );
}

// ── Helpers ──

function formatDatetime(ms?: number) {
  if (!ms) return null;
  return new Date(ms).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatDate(ms?: number) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}
function freshnessBadge(ms?: number) {
  if (!ms) {
    return <span className="text-xs text-gray-400">Not pulled yet</span>;
  }

  const ageMinutes = Math.floor((Date.now() - ms) / 60000);
  const tone = ageMinutes <= 45
    ? "text-green-600"
    : ageMinutes <= 180
      ? "text-yellow-600"
      : "text-red-500";

  return <span className={`text-xs font-medium ${tone}`}>{timeAgo(ms)}</span>;
}

function statusDot(ok: boolean) {
  return ok ? "text-green-600" : "text-red-500";
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

function extractSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.split("@")[0];
}

// ── Site Card Expansion ──

function SiteExpansion({ siteId }: { siteId: Id<"sites"> }) {
  const [data, setData] = useState<{
    classifications: Doc<"emailClassifications">[];
    threads: Doc<"emailThreads">[];
    drafts: Doc<"draftEmails">[];
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/site-activity/${encodeURIComponent(String(siteId))}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const payload = (await res.json()) as {
          classifications: Doc<"emailClassifications">[];
          threads: Doc<"emailThreads">[];
          drafts: Doc<"draftEmails">[];
        };
        if (active) setData(payload);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load activity");
      }
    })();
    return () => {
      active = false;
    };
  }, [siteId]);

  const classifications = data?.classifications ?? [];
  const threads = data?.threads ?? [];
  const drafts = data?.drafts ?? [];

  const loading = data === null && !error;
  if (loading) {
    return <div className="text-gray-400 text-sm py-3">Loading activity...</div>;
  }

  if (error) {
    return <div className="text-red-600 text-sm py-3">{error}</div>;
  }

  const hasContent = classifications.length > 0 || threads.length > 0 || drafts.length > 0;
  if (!hasContent) {
    return <div className="text-gray-400 text-sm py-3">No linked activity yet</div>;
  }

  // Build unified timeline
  type TimelineItem =
    | { kind: "message"; time: number; data: typeof classifications[number] }
    | { kind: "thread"; time: number; data: typeof threads[number] }
    | { kind: "draft"; time: number; data: typeof drafts[number] };

  const items: TimelineItem[] = [
    ...classifications.map((c) => ({ kind: "message" as const, time: c.receivedAt, data: c })),
    ...threads.map((t) => ({ kind: "thread" as const, time: t.lastMessageAt, data: t })),
    ...drafts.map((d) => ({ kind: "draft" as const, time: d.createdAt, data: d })),
  ].sort((a, b) => b.time - a.time);

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-2">
      <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Activity Timeline</h3>
      {items.map((item, i) => {
        if (item.kind === "message") {
          const c = item.data;
          return (
            <div key={`msg-${c._id}`} className="flex items-start gap-3 py-2 px-3 bg-gray-50 rounded text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{extractSenderName(c.from)}</span>
                  {classificationBadge(c.classificationType)}
                  {confidenceBadge(c.confidence)}
                  <span className="text-xs text-gray-400 ml-auto">{timeAgo(c.receivedAt)}</span>
                </div>
                <div className="text-gray-700 mt-0.5">{c.subject}</div>
                <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">{c.bodyPreview}</div>
              </div>
            </div>
          );
        }
        if (item.kind === "thread") {
          const t = item.data;
          return (
            <div key={`thread-${t._id}`} className="flex items-start gap-3 py-2 px-3 bg-gray-50 rounded text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{t.subject}</span>
                  {threadStateBadge(t.state)}
                  <span className="text-xs text-gray-400 ml-auto">{timeAgo(t.lastMessageAt)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {t.messageCount} message{t.messageCount !== 1 ? "s" : ""} &middot; {t.participants.length} participant{t.participants.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          );
        }
        // draft
        const d = item.data;
        return (
          <div key={`draft-${d._id}`} className="flex items-start gap-3 py-2 px-3 bg-yellow-50 rounded text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-2 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">Draft reply</span>
                {draftStatusBadge(d.status)}
                <span className="text-xs text-gray-400 ml-auto">{timeAgo(d.createdAt)}</span>
              </div>
              <div className="text-gray-700 mt-0.5">To: {d.originalTo}</div>
              <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">{d.originalSubject}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Site Card ──

function SiteCard({ site }: { site: {
  _id: Id<"sites">;
  siteAddress: string;
  fullAddress?: string;
  phase: string;
  resolved: boolean;
  nextCheckDate: number;
  lidarScheduled: boolean;
  lidarScheduledDatetime?: number;
  lidarJobStatus?: string;
  inspectionScheduled: boolean;
  inspectionDate?: string;
  inspectionTime?: string;
  reportDueDate?: string;
  reportReceived: boolean;
  reportLink?: string;
  responsiblePartyName?: string;
  inspectionContactName?: string;
  triggerDate: number;
  schedulingReminderCount: number;
  reportReminderCount: number;
  trackingStatus?: TrackingStatus;
  trackingScope?: TrackingScope;
  trackingUpdatedAt?: number;
  lidarLastCheckedAt?: number;
  inspectionLastCheckedAt?: number;
  recordDisposition?: SiteDisposition;
  recordDispositionNote?: string;
  recordDispositionBy?: string;
  recordDispositionAt?: number;
  tasks: Array<{
    _id: Id<"tasks">;
    taskType: TaskType;
    partnerKey: string;
    partnerName: string;
    state: TaskState;
    stateUpdatedAt: number;
    deliverableUrl?: string;
    scopeChanged?: boolean;
  }>;
  progress: {
    percentComplete: number;
    activeTaskCount: number;
    completedTaskCount: number;
    blockedTaskCount: number;
    scopeChanged: boolean;
  };
} }) {
  const { data: session } = useSession();
  const canDisposition = Boolean((session?.user as { email?: string } | undefined)?.email);
  const [expanded, setExpanded] = useState(false);
  const [disposition, setDisposition] = useState<SiteDisposition>(site.recordDisposition ?? "unreviewed");
  const [note, setNote] = useState(site.recordDispositionNote ?? "");
  const [savingDisposition, setSavingDisposition] = useState(false);
  const [dispositionMessage, setDispositionMessage] = useState<string | null>(null);
  const [dispositionError, setDispositionError] = useState<string | null>(null);
  const trackingState = site.trackingStatus && site.trackingScope
    ? { trackingStatus: site.trackingStatus, trackingScope: site.trackingScope }
    : deriveTrackingState({
        resolved: site.resolved,
        lidarScheduled: site.lidarScheduled,
        inspectionScheduled: site.inspectionScheduled,
        lidarJobStatus: site.lidarJobStatus,
        reportReceived: site.reportReceived,
      });
  const lidarComplete = isLidarComplete(site.lidarJobStatus);

  async function saveDisposition() {
    setSavingDisposition(true);
    setDispositionMessage(null);
    setDispositionError(null);
    try {
      const res = await fetch(`/api/dashboard/sites/${encodeURIComponent(String(site._id))}/disposition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition, note }),
      });
      const payload = await res.json() as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? `Request failed (${res.status})`);
      }
      setDispositionMessage("Disposition saved.");
    } catch (err) {
      setDispositionError(err instanceof Error ? err.message : "Failed to save disposition");
    } finally {
      setSavingDisposition(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg hover:shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-5"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold">{site.fullAddress ?? site.siteAddress}</h2>
              {site.progress.scopeChanged && (
                <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                  Scope changed
                </span>
              )}
              <span className="text-gray-400 text-sm">{expanded ? "\u25B2" : "\u25BC"}</span>
            </div>
            <ProgressBar percentComplete={site.progress.percentComplete} />
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                <span>{site.progress.completedTaskCount}/{site.progress.activeTaskCount} tasks complete</span>
                {site.progress.blockedTaskCount > 0 && <span>{site.progress.blockedTaskCount} blocked</span>}
                <span>{formatTrackingStateLabel(trackingState.trackingStatus, trackingState.trackingScope)}</span>
                {dispositionBadge(site.recordDisposition)}
              </div>
          </div>
          <div className="text-sm text-gray-500">
            {site.resolved ? "Resolved" : `Next check: ${formatDate(site.nextCheckDate)}`}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-gray-100 rounded p-3">
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">LiDAR</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={statusDot(site.lidarScheduled || lidarComplete)}>
                  {lidarComplete ? "Complete" : site.lidarScheduled ? "Scheduled" : "Not scheduled"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Scheduled Date</span>
                <span className={site.lidarScheduledDatetime ? "text-gray-800" : "text-gray-400 italic"}>
                  {formatDatetime(site.lidarScheduledDatetime) ?? "empty"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Job Status</span>
                <span className="text-gray-800 capitalize">{site.lidarJobStatus ?? "\u2014"}</span>
              </div>
            </div>
          </div>
          <div className="border border-gray-100 rounded p-3">
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Building Inspection</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={statusDot(site.inspectionScheduled || site.reportReceived)}>
                  {site.reportReceived ? "Complete" : site.inspectionScheduled ? "Scheduled" : "Not scheduled"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Inspection Date</span>
                <span className="text-gray-800">{site.inspectionDate ?? "\u2014"}{site.inspectionTime ? ` at ${site.inspectionTime}` : ""}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Report Due</span>
                <span className="text-gray-800">{site.reportDueDate ?? "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Report</span>
                <span className={site.reportReceived ? "text-green-600" : "text-gray-400"}>
                  {site.reportReceived ? (
                    site.reportLink ? (
                      <a href={site.reportLink} target="_blank" rel="noopener noreferrer" className="text-green-600 underline" onClick={(e) => e.stopPropagation()}>Received</a>
                    ) : "Received"
                  ) : "Pending"}
                </span>
              </div>
            </div>
          </div>
          <div className="border border-gray-100 rounded p-3">
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Tasks</h3>
            <div className="space-y-2 text-sm">
              {site.tasks.map((task) => (
                <div key={task._id} className="rounded border border-gray-100 px-2 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-800">{formatTaskTypeLabel(task.taskType)}</div>
                      <div className="text-xs text-gray-500">{task.partnerName}</div>
                    </div>
                    {taskStateBadge(task.state)}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    Updated {timeAgo(task.stateUpdatedAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-gray-100 rounded p-3 md:col-span-3">
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Tracking</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tracking Status</span>
                  <span className="text-gray-800">{formatTrackingStateLabel(trackingState.trackingStatus, trackingState.trackingScope)}</span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-gray-500">Tracking Pulled</span>
                <span className="text-right text-gray-800">
                  {site.trackingUpdatedAt ? formatDatetime(site.trackingUpdatedAt) : "\u2014"}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-gray-500">LiDAR Source</span>
                <span className="text-right text-gray-800">
                  {site.lidarLastCheckedAt ? formatDatetime(site.lidarLastCheckedAt) : "\u2014"} {freshnessBadge(site.lidarLastCheckedAt)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-gray-500">Inspection Source</span>
                <span className="text-right text-gray-800">
                  {site.inspectionLastCheckedAt ? formatDatetime(site.inspectionLastCheckedAt) : "\u2014"} {freshnessBadge(site.inspectionLastCheckedAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Responsible Party</span>
                <span className="text-gray-800">{site.responsiblePartyName ?? "\u2014"}</span>
              </div>
              {site.inspectionContactName && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Inspection Contact</span>
                  <span className="text-gray-800">{site.inspectionContactName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Triggered</span>
                <span className="text-gray-800">{formatDate(site.triggerDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Record Review</span>
                <span className="text-gray-800">{dispositionBadge(site.recordDisposition)}</span>
              </div>
              {site.recordDispositionAt && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Reviewed</span>
                  <span className="text-right text-gray-800">
                    {formatDatetime(site.recordDispositionAt)}{site.recordDispositionBy ? ` by ${site.recordDispositionBy}` : ""}
                  </span>
                </div>
              )}
              {site.recordDispositionNote && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Review Note</span>
                  <span className="text-right text-gray-800">{site.recordDispositionNote}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Reminders</span>
                <span className="text-gray-800">{site.schedulingReminderCount + site.reportReminderCount}</span>
              </div>
            </div>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-5">
          {canDisposition && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Record Disposition</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Mark whether this site record looks correctly created from the email thread.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["unreviewed", "confirmed", "needs_review", "invalid"] as SiteDisposition[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setDisposition(option);
                        setDispositionMessage(null);
                        setDispositionError(null);
                      }}
                      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        disposition === option
                          ? "bg-gray-900 text-white"
                          : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {option === "needs_review" ? "Needs review" : option.charAt(0).toUpperCase() + option.slice(1)}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Optional note about why this record is correct, suspect, or invalid."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveDisposition}
                    disabled={savingDisposition}
                    className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
                  >
                    {savingDisposition ? "Saving..." : "Save Disposition"}
                  </button>
                  {dispositionMessage && <span className="text-sm text-green-700">{dispositionMessage}</span>}
                  {dispositionError && <span className="text-sm text-red-600">{dispositionError}</span>}
                </div>
              </div>
            </div>
          )}
          <SiteExpansion siteId={site._id} />
        </div>
      )}
    </div>
  );
}

// ── Sites View ──

function SitesView() {
  const siteList = useQuery(api.sites.list);

  if (siteList === undefined) {
    return <div className="text-gray-400 py-8 text-center">Loading sites...</div>;
  }

  if (siteList.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-gray-400">
        No sites tracked yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {siteList.map((site) => (
        <SiteCard key={site._id} site={site} />
      ))}
    </div>
  );
}

// ── Inbound Feed (unmatched only) ──

function InboundFeed() {
  const [classifications, setClassifications] = useState<Doc<"emailClassifications">[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const siteList = useQuery(api.sites.list);

  async function load() {
    const res = await fetch("/api/dashboard/inbound?limit=100", { cache: "no-store" });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const payload = (await res.json()) as { classifications: Doc<"emailClassifications">[] };
    setClassifications(payload.classifications);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load inbound");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (classifications === null && !error) {
    return <div className="text-gray-400 py-8 text-center">Loading inbound...</div>;
  }

  if (error) {
    return <div className="text-red-600 py-8 text-center">{error}</div>;
  }

  if ((classifications ?? []).length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-gray-400">
        No unmatched inbound emails
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(classifications ?? []).map((c) => (
        <InboundCard
          key={c._id}
          classification={c}
          sites={siteList ?? []}
          onRefresh={load}
          onDismiss={() => setClassifications((prev) => (prev ?? []).filter((item) => item._id !== c._id))}
        />
      ))}
    </div>
  );
}

function InboundCard({
  classification,
  sites,
  onRefresh,
  onDismiss,
}: {
  classification: Doc<"emailClassifications">;
  sites: Array<{
    _id: Id<"sites">;
    fullAddress?: string;
    siteAddress: string;
  }>;
  onRefresh: () => Promise<void>;
  onDismiss: () => void;
}) {
  const [correctedClassificationType, setCorrectedClassificationType] = useState(classification.classificationType);
  const [correctedSiteId, setCorrectedSiteId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyFeedback() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/inbound/${encodeURIComponent(String(classification._id))}/feedback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctedClassificationType,
          correctedSiteId: correctedSiteId || undefined,
          note: note || undefined,
        }),
      });

      const payload = await res.json() as { error?: string; removedFromUnmatched?: boolean };
      if (!res.ok) {
        throw new Error(payload.error ?? `Request failed (${res.status})`);
      }

      if (payload.removedFromUnmatched) {
        onDismiss();
      } else {
        await onRefresh();
      }

      setMessage(payload.removedFromUnmatched ? "Feedback applied and email linked to a site." : "Feedback applied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply feedback");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{extractSenderName(classification.from)}</span>
          {classificationBadge(classification.classificationType)}
          {methodBadge(classification.classificationMethod)}
          {confidenceBadge(classification.confidence)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{timeAgo(classification.receivedAt)}</span>
          <button
            onClick={async () => {
              const res = await fetch(`/api/dashboard/inbound/${encodeURIComponent(String(classification._id))}/archive`, { method: "POST" });
              if (res.ok) {
                onDismiss();
              }
            }}
            className="text-xs px-2 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Archive"
          >
            Dismiss
          </button>
        </div>
      </div>
      <div className="text-sm font-medium text-gray-800 mb-1">{classification.subject}</div>
      <div className="text-xs text-gray-500 line-clamp-2">{classification.bodyPreview}</div>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        <span>Status: {classification.status}</span>
        {classification.matchedVendorId && <span>Partner matched</span>}
      </div>

      <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inbound Feedback</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-medium text-gray-500">Correct Label</span>
            <select
              value={correctedClassificationType}
              onChange={(e) => setCorrectedClassificationType(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {CLASSIFICATION_OPTIONS.map((option) => (
                <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-medium text-gray-500">Associate Site</span>
            <select
              value={correctedSiteId}
              onChange={(e) => setCorrectedSiteId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Leave unmatched</option>
              {sites.map((site) => (
                <option key={site._id} value={String(site._id)}>
                  {site.fullAddress ?? site.siteAddress}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm text-gray-700">
          <span className="mb-1 block text-xs font-medium text-gray-500">Feedback Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Why was this label or site association corrected?"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={applyFeedback}
            disabled={saving}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {saving ? "Applying..." : "Apply Feedback"}
          </button>
          {message && <span className="text-sm text-green-700">{message}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function AdminTrackingControls() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: "admin" | "reviewer" } | undefined)?.role;
  const isAdmin = role === "admin";
  const [running, setRunning] = useState<"scheduling" | "completion" | "tracking" | "tasks" | "site_feedback" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) {
    return null;
  }

  async function trigger(type: "scheduling" | "completion" | "tracking" | "tasks" | "site_feedback") {
    setRunning(type);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/trigger-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type }),
      });

      const payload = (await res.json()) as {
        error?: string;
        result?: {
          processed?: number;
          success?: boolean;
          errors?: string[];
          scheduling?: { processed?: number; errors?: string[] };
          completion?: { processed?: number; errors?: string[] };
          siteCount?: number;
          tasksCreated?: number;
          tasksUpdated?: number;
          reviewed?: number;
          confirmed?: number;
          needsReview?: number;
          invalidDeleted?: number;
        };
      };

      if (!res.ok) {
        throw new Error(payload.error ?? `Request failed (${res.status})`);
      }

      if (type === "tracking" && payload.result?.scheduling && payload.result?.completion) {
        setMessage(
          `Tracking refresh ran. Scheduling processed ${payload.result.scheduling.processed ?? 0}; completion processed ${payload.result.completion.processed ?? 0}.`
        );
      } else if (type === "tasks") {
        setMessage(
          `Task backfill ran. ${payload.result?.tasksCreated ?? 0} task(s) created across ${payload.result?.siteCount ?? 0} site(s); ${payload.result?.tasksUpdated ?? 0} task(s) synced.`
        );
      } else if (type === "site_feedback") {
        setMessage(
          `Site feedback applied. Reviewed ${payload.result?.reviewed ?? 0}; confirmed ${payload.result?.confirmed ?? 0}; needs review ${payload.result?.needsReview ?? 0}; removed ${payload.result?.invalidDeleted ?? 0} invalid site(s).`
        );
      } else {
        setMessage(
          `${type.charAt(0).toUpperCase() + type.slice(1)} check ran. Processed ${payload.result?.processed ?? 0} site(s).`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger check");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-blue-900">Admin Tracking Controls</h2>
          <p className="text-sm text-blue-700">
            Run the site tracking refresh on demand instead of waiting for the next cron window.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => trigger("scheduling")}
            disabled={running !== null}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running === "scheduling" ? "Running..." : "Run Scheduling"}
          </button>
          <button
            onClick={() => trigger("completion")}
            disabled={running !== null}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running === "completion" ? "Running..." : "Run Completion"}
          </button>
          <button
            onClick={() => trigger("tracking")}
            disabled={running !== null}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running === "tracking" ? "Running..." : "Run Both"}
          </button>
          <button
            onClick={() => trigger("tasks")}
            disabled={running !== null}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running === "tasks" ? "Running..." : "Backfill Tasks"}
          </button>
          <button
            onClick={() => trigger("site_feedback")}
            disabled={running !== null}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running === "site_feedback" ? "Applying..." : "Apply Site Feedback"}
          </button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ── Main Dashboard ──

export default function Dashboard() {
  const [showInbound, setShowInbound] = useState(false);

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Sites</h1>
        <p className="text-sm text-gray-500 mt-1">Click a site to see linked messages and activity</p>
      </div>

      <AdminTrackingControls />

      <SitesView />

      <div className="mt-10">
        <button
          onClick={() => setShowInbound(!showInbound)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 mb-4"
        >
          <span>{showInbound ? "\u25B2" : "\u25BC"}</span>
          Unmatched Inbound
        </button>
        {showInbound && <InboundFeed />}
      </div>
    </main>
  );
}



