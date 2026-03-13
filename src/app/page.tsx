"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type Tab = "sites" | "inbound" | "threads";

function phaseBadge(phase: string) {
  const colors: Record<string, string> = {
    scheduling: "bg-yellow-100 text-yellow-800",
    completion: "bg-blue-100 text-blue-800",
    resolved: "bg-green-100 text-green-800",
  };
  return `inline-block px-2 py-1 rounded text-xs font-medium ${colors[phase] ?? "bg-gray-100"}`;
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
  const label = type.replace(/_/g, " ");
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
      {state.replace(/_/g, " ")}
    </span>
  );
}

function formatDatetime(ms?: number) {
  if (!ms) return null;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(ms?: number) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
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

// ── Sites Tab ──

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
        <div key={site._id} className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{site.fullAddress ?? site.siteAddress}</h2>
              <span className={phaseBadge(site.phase)}>{site.phase}</span>
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
                  <span className={statusDot(site.lidarScheduled)}>
                    {site.lidarJobStatus === "complete" ? "Complete" : site.lidarScheduled ? "Scheduled" : "Not scheduled"}
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
                  <span className="text-gray-800 capitalize">{site.lidarJobStatus ?? "—"}</span>
                </div>
              </div>
            </div>
            <div className="border border-gray-100 rounded p-3">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Building Inspection</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={statusDot(site.inspectionScheduled)}>
                    {site.inspectionScheduled ? "Scheduled" : "Not scheduled"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Inspection Date</span>
                  <span className="text-gray-800">{site.inspectionDate ?? "—"}{site.inspectionTime ? ` at ${site.inspectionTime}` : ""}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Report Due</span>
                  <span className="text-gray-800">{site.reportDueDate ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Report</span>
                  <span className={site.reportReceived ? "text-green-600" : "text-gray-400"}>
                    {site.reportReceived ? (
                      site.reportLink ? (
                        <a href={site.reportLink} target="_blank" rel="noopener noreferrer" className="text-green-600 underline">Received</a>
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
                  <span className="text-gray-500">Responsible Party</span>
                  <span className="text-gray-800">{site.responsiblePartyName ?? "—"}</span>
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
        </div>
      ))}
    </div>
  );
}

// ── Inbound Feed Tab ──

function InboundFeed() {
  const classifications = useQuery(api.emailClassifications.list, { limit: 100 });

  if (classifications === undefined) {
    return <div className="text-gray-400 py-8 text-center">Loading classifications...</div>;
  }

  if (classifications.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-gray-400">
        No classified emails yet. The agent will begin classifying once it has access to edu.ops@trilogy.com.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {classifications.map((c) => (
        <div key={c._id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{extractSenderName(c.from)}</span>
              {classificationBadge(c.classificationType)}
              {methodBadge(c.classificationMethod)}
              {confidenceBadge(c.confidence)}
            </div>
            <span className="text-xs text-gray-400">{timeAgo(c.receivedAt)}</span>
          </div>
          <div className="text-sm font-medium text-gray-800 mb-1">{c.subject}</div>
          <div className="text-xs text-gray-500 line-clamp-2">{c.bodyPreview}</div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>Status: {c.status}</span>
            {c.matchedSiteIds.length > 0 && (
              <span>{c.matchedSiteIds.length} site{c.matchedSiteIds.length > 1 ? "s" : ""} matched</span>
            )}
            {c.matchedVendorId && <span>Vendor matched</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Threads Tab ──

function ThreadsView() {
  const threads = useQuery(api.emailThreads.list, {});

  if (threads === undefined) {
    return <div className="text-gray-400 py-8 text-center">Loading threads...</div>;
  }

  if (threads.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-gray-400">
        No email threads tracked yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((t) => (
        <div key={t._id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate max-w-md">{t.subject}</span>
              {threadStateBadge(t.state)}
            </div>
            <span className="text-xs text-gray-400">{timeAgo(t.lastMessageAt)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{t.messageCount} message{t.messageCount !== 1 ? "s" : ""}</span>
            <span>{t.participants.length} participant{t.participants.length !== 1 ? "s" : ""}</span>
            {t.linkedSiteIds.length > 0 && (
              <span>{t.linkedSiteIds.length} site{t.linkedSiteIds.length > 1 ? "s" : ""}</span>
            )}
            {t.timerDeadline && (
              <span className={t.timerDeadline < Date.now() ? "text-red-500 font-medium" : ""}>
                Timer: {formatDatetime(t.timerDeadline)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ──

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("inbound");

  const tabs: { key: Tab; label: string }[] = [
    { key: "inbound", label: "Inbound Feed" },
    { key: "threads", label: "Threads" },
    { key: "sites", label: "Sites" },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sites" && <SitesView />}
      {tab === "inbound" && <InboundFeed />}
      {tab === "threads" && <ThreadsView />}
    </main>
  );
}
