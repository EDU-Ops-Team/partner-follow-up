"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Doc, Id } from "convex/_generated/dataModel";

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
  const styles =
    method === "rule"
      ? "bg-gray-100 text-gray-600"
      : method === "reviewed"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-indigo-100 text-indigo-700";

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${styles}`}>
      {method}
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

function extractSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.split("@")[0];
}

type SiteSummary = {
  _id: Id<"sites">;
  fullAddress?: string;
  siteAddress: string;
};

type InboundDetailPayload = {
  classification: Doc<"emailClassifications">;
  sites: SiteSummary[];
};

export default function InboundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [data, setData] = useState<InboundDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [correctedClassificationType, setCorrectedClassificationType] = useState("unknown");
  const [correctedSiteId, setCorrectedSiteId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    params.then(({ id }) => setClassificationId(id));
  }, [params]);

  useEffect(() => {
    if (!classificationId) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/inbound/${encodeURIComponent(classificationId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const payload = (await res.json()) as InboundDetailPayload;
        if (!active) return;
        setData(payload);
        setCorrectedClassificationType(payload.classification.classificationType);
        setCorrectedSiteId(payload.classification.matchedSiteIds[0] ? String(payload.classification.matchedSiteIds[0]) : "");
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load inbound email");
      }
    })();
    return () => {
      active = false;
    };
  }, [classificationId]);

  async function applyFeedback() {
    if (!classificationId) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/inbound/${encodeURIComponent(classificationId)}/feedback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctedClassificationType,
          correctedSiteId: correctedSiteId || undefined,
          note: note || undefined,
        }),
      });
      const payload = (await res.json()) as { error?: string; removedFromUnmatched?: boolean };
      if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status})`);
      setMessage(payload.removedFromUnmatched ? "Feedback applied and email linked to a site." : "Feedback applied.");
      const refresh = await fetch(`/api/dashboard/inbound/${encodeURIComponent(classificationId)}`, { cache: "no-store" });
      if (refresh.ok) {
        const refreshed = (await refresh.json()) as InboundDetailPayload;
        setData(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply feedback");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!classificationId) return;
    setArchiving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/inbound/${encodeURIComponent(classificationId)}/archive`, {
        method: "POST",
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status})`);
      setMessage("Inbound email archived.");
      if (data) {
        setData({
          ...data,
          classification: {
            ...data.classification,
            status: "archived",
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive email");
    } finally {
      setArchiving(false);
    }
  }

  if (!data && !error) {
    return <main className="max-w-4xl mx-auto px-4 py-8"><div className="text-gray-400 py-8 text-center">Loading inbound email...</div></main>;
  }

  if (error && !data) {
    return <main className="max-w-4xl mx-auto px-4 py-8"><div className="text-red-600 py-8 text-center">{error}</div></main>;
  }

  const classification = data!.classification;
  const linkedSites = data!.sites.filter((site) => classification.matchedSiteIds.some((id) => String(id) === String(site._id)));

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700">Dashboard</Link>
            <span>/</span>
            <span>Inbound Review</span>
          </div>
          <h1 className="mt-2 text-xl font-bold text-gray-900">Inbound Email Review</h1>
          <p className="mt-1 text-sm text-gray-500">Review, correct, link, or archive this inbound message.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Back to Dashboard
          </Link>
          <button
            onClick={archive}
            disabled={archiving}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {archiving ? "Archiving..." : "Archive"}
          </button>
        </div>
      </div>

      {message && <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{extractSenderName(classification.from)}</span>
              {classificationBadge(classification.classificationType)}
              {methodBadge(classification.classificationMethod)}
              {confidenceBadge(classification.confidence)}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-gray-900">{classification.subject}</h2>
            <div className="mt-1 text-sm text-gray-500">Received {timeAgo(classification.receivedAt)} from {classification.from}</div>
          </div>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {classification.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">To</div>
            <div className="mt-1 text-gray-700">{classification.to.join(", ") || "-"}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">CC</div>
            <div className="mt-1 text-gray-700">{classification.cc.join(", ") || "-"}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Linked Sites</div>
            <div className="mt-1 text-gray-700">
              {linkedSites.length > 0 ? linkedSites.map((site) => site.fullAddress ?? site.siteAddress).join(", ") : "None yet"}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Body Preview</div>
          <div className="mt-2 rounded-md bg-gray-50 border border-gray-100 px-3 py-3 text-sm text-gray-700 whitespace-pre-wrap">
            {classification.bodyPreview}
          </div>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Disposition</h2>
          <p className="mt-1 text-sm text-gray-500">Correct the label, associate the site, and save the feedback into the learning loop.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Correct Label</span>
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
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Associate Site</span>
            <select
              value={correctedSiteId}
              onChange={(e) => setCorrectedSiteId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Leave unmatched</option>
              {data!.sites.map((site) => (
                <option key={site._id} value={String(site._id)}>
                  {site.fullAddress ?? site.siteAddress}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm text-gray-700">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Feedback Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Why is this label or site association correct?"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={applyFeedback}
            disabled={saving}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {saving ? "Applying..." : "Apply Feedback"}
          </button>
        </div>
      </section>
    </main>
  );
}
