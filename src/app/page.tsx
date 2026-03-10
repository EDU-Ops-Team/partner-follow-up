"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function phaseBadge(phase: string) {
  const colors: Record<string, string> = {
    scheduling: "bg-yellow-100 text-yellow-800",
    completion: "bg-blue-100 text-blue-800",
    resolved: "bg-green-100 text-green-800",
  };
  return `inline-block px-2 py-1 rounded text-xs font-medium ${colors[phase] ?? "bg-gray-100"}`;
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

export default function Dashboard() {
  const siteList = useQuery(api.sites.list);

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Vendor Follow Up</h1>

      {siteList === undefined ? (
        <div className="text-gray-400 py-8 text-center">Loading...</div>
      ) : (
        <div className="space-y-4">
          {siteList.map((site) => (
            <div key={site._id} className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm">
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">{site.fullAddress ?? site.siteAddress}</h2>
                  <span className={phaseBadge(site.phase)}>{site.phase}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {site.resolved ? "Resolved" : `Next check: ${formatDate(site.nextCheckDate)}`}
                </div>
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* LiDAR */}
                <div className="border border-gray-100 rounded p-3">
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">LiDAR</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <span className={statusDot(site.lidarScheduled)}>
                        {site.lidarJobStatus === "complete"
                          ? "Complete"
                          : site.lidarScheduled
                            ? "Scheduled"
                            : "Not scheduled"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Job Scheduled Date</span>
                      <span className={site.lidarScheduledDatetime ? "text-gray-800" : "text-gray-400 italic"}>
                        {formatDatetime(site.lidarScheduledDatetime) ?? "empty"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Job Status</span>
                      <span className="text-gray-800 capitalize">
                        {site.lidarJobStatus ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inspection */}
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
                      <span className="text-gray-800">
                        {site.inspectionDate ?? "—"}
                        {site.inspectionTime ? ` at ${site.inspectionTime}` : ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Report Due</span>
                      <span className="text-gray-800">
                        {site.reportDueDate ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Report</span>
                      <span className={site.reportReceived ? "text-green-600" : "text-gray-400"}>
                        {site.reportReceived ? (
                          site.reportLink ? (
                            <a href={site.reportLink} target="_blank" rel="noopener noreferrer" className="text-green-600 underline">
                              Received
                            </a>
                          ) : (
                            "Received"
                          )
                        ) : (
                          "Pending"
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tracking */}
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
                      <span className="text-gray-500">Last Outreach</span>
                      <span className="text-gray-800">
                        {site.lastOutreachDate ? formatDate(site.lastOutreachDate) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Reminders</span>
                      <span className="text-gray-800">
                        {site.schedulingReminderCount + site.reportReminderCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {siteList.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-gray-400">
              No sites tracked yet
            </div>
          )}
        </div>
      )}
    </main>
  );
}
