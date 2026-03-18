"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { deriveTrackingState, formatTrackingStateLabel, isLidarComplete, type TrackingScope, type TrackingStatus } from "../../shared/siteTracking";

// ── Badges ──

function phaseBadge(phase: string) {
  const colors: Record<string, string> = {
    scheduling: "bg-yellow-100 text-yellow-800",
    completion: "bg-blue-100 text-blue-800",
    resolved: "bg-green-100 text-green-800",
  };
  return `inline-block px-2 py-1 rounded text-xs font-medium ${colors[phase] ?? "bg-gray-100"}`;
}

function trackingBadge(status: TrackingStatus, scope: TrackingScope) {
  const colors: Record<TrackingStatus, string> = {
    scheduling: "bg-gray-100 text-gray-700",
    scheduled: "bg-sky-100 text-sky-800",
    complete: "bg-emerald-100 text-emerald-800",
    resolved: "bg-green-100 text-green-800",
  };
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
      {formatTrackingStateLabel(status, scope)}
    </span>
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
} }) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg hover:shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{site.fullAddress ?? site.siteAddress}</h2>
            <span className={phaseBadge(site.phase)}>{site.phase}</span>
            {trackingBadge(trackingState.trackingStatus, trackingState.trackingScope)}
            <span className="text-gray-400 text-sm">{expanded ? "\u25B2" : "\u25BC"}</span>
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
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Tracking</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Tracking Status</span>
                <span className="text-gray-800">{formatTrackingStateLabel(trackingState.trackingStatus, trackingState.trackingScope)}</span>
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
                <span className="text-gray-500">Reminders</span>
                <span className="text-gray-800">{site.schedulingReminderCount + site.reportReminderCount}</span>
              </div>
            </div>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-5">
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/inbound?limit=100", { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const payload = (await res.json()) as { classifications: Doc<"emailClassifications">[] };
        if (active) setClassifications(payload.classifications);
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
        <div key={c._id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{extractSenderName(c.from)}</span>
              {classificationBadge(c.classificationType)}
              {methodBadge(c.classificationMethod)}
              {confidenceBadge(c.confidence)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{timeAgo(c.receivedAt)}</span>
              <button
                onClick={async () => {
                  const res = await fetch(`/api/dashboard/inbound/${encodeURIComponent(String(c._id))}/archive`, { method: "POST" });
                  if (res.ok) {
                    setClassifications((prev) => (prev ?? []).filter((item) => item._id !== c._id));
                  }
                }}
                className="text-xs px-2 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Archive"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="text-sm font-medium text-gray-800 mb-1">{c.subject}</div>
          <div className="text-xs text-gray-500 line-clamp-2">{c.bodyPreview}</div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>Status: {c.status}</span>
            {c.matchedVendorId && <span>Partner matched</span>}
          </div>
        </div>
      ))}
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


