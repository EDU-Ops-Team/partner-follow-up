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

export default function Dashboard() {
  const siteList = useQuery(api.sites.list);

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Vendor Follow Up</h1>

      {siteList === undefined ? (
        <div className="text-gray-400 py-8 text-center">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Phase</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">LiDAR</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Inspection</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Report</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible Party</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Outreach</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Next Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {siteList.map((site) => (
                <tr key={site._id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{site.siteAddress}</td>
                  <td className="px-4 py-2">
                    <span className={phaseBadge(site.phase)}>{site.phase}</span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {site.lidarScheduled ? (
                      <span className="text-green-600">{site.lidarJobStatus === "complete" ? "Complete" : "Scheduled"}</span>
                    ) : (
                      <span className="text-red-500">Not scheduled</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {site.inspectionScheduled ? (
                      <span className="text-green-600">{site.inspectionDate ?? "Scheduled"}</span>
                    ) : (
                      <span className="text-red-500">Not scheduled</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {site.reportReceived ? (
                      <span className="text-green-600">Received</span>
                    ) : (
                      <span className="text-gray-400">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">{site.responsiblePartyName}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {site.lastOutreachDate ? new Date(site.lastOutreachDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {site.resolved ? "Resolved" : new Date(site.nextCheckDate).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {siteList.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No sites tracked yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
