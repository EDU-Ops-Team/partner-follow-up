"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Doc, Id } from "convex/_generated/dataModel";

type Draft = Doc<"draftEmails">;
type Classification = Doc<"emailClassifications"> | null;

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

function formatDatetime(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function ReviewDraft() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const draftId = params.id as Id<"draftEmails">;

  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  const [classification, setClassification] = useState<Classification>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedTo, setEditedTo] = useState("");
  const [editedCc, setEditedCc] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/review/drafts/${encodeURIComponent(String(draftId))}`, { cache: "no-store" });
        if (res.status === 404) {
          if (active) setDraft(null);
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as { draft: Draft; classification: Classification };
        if (!active) return;
        setDraft(data.draft);
        setClassification(data.classification);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load draft");
      }
    })();
    return () => {
      active = false;
    };
  }, [draftId]);

  const isPending = useMemo(() => draft?.status === "pending", [draft]);

  function reviewerPayload() {
    const user = session?.user as Record<string, unknown> | undefined;
    return {
      reviewerGoogleId: typeof user?.googleId === "string" ? user.googleId : undefined,
      reviewerEmail: typeof user?.email === "string" ? user.email : undefined,
    };
  }

  if (draft === undefined && !error) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-gray-400 py-8 text-center">Loading draft...</div>
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

  if (draft === null) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-gray-400 py-8 text-center">Draft not found.</div>
      </main>
    );
  }

  const currentDraft = draft!;
  function startEdit() {
    setEditedTo(currentDraft.originalTo);
    setEditedCc(currentDraft.originalCc ?? "");
    setEditedSubject(currentDraft.originalSubject);
    setEditedBody(htmlToText(currentDraft.originalBody));
    setEditMode(true);
  }

  async function postAction(path: string, body?: object) {
    const res = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Request failed (${res.status})`);
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/review")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to queue
          </button>
          {statusBadge(currentDraft.status)}
          {tierBadge(currentDraft.tier)}
        </div>
        <span className="text-xs text-gray-400">
          Created {formatDatetime(currentDraft.createdAt)}
        </span>
      </div>

      {classification && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Original Email</h3>
          <div className="text-sm space-y-1">
            <div><span className="text-gray-500">From:</span> {classification.from}</div>
            <div><span className="text-gray-500">Subject:</span> {classification.subject}</div>
            <div><span className="text-gray-500">Type:</span> <span className="font-medium">{classification.classificationType.replace(/_/g, " ")}</span></div>
            {classification.confidence && (
              <div><span className="text-gray-500">Confidence:</span> {Math.round(classification.confidence * 100)}%</div>
            )}
          </div>
          {classification.bodyPreview && (
            <div className="mt-3 text-xs text-gray-600 bg-white border border-gray-100 rounded p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {classification.bodyPreview}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
            {editMode ? "Edit Draft" : "Agent Draft"}
          </h3>
          {editMode ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input
                  type="text"
                  value={editedTo}
                  onChange={(e) => setEditedTo(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">CC</label>
                <input
                  type="text"
                  value={editedCc}
                  onChange={(e) => setEditedCc(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Subject</label>
                <input
                  type="text"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Body</label>
                <textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  rows={12}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">To:</span> {currentDraft.originalTo}</div>
              {currentDraft.originalCc && <div><span className="text-gray-500">CC:</span> {currentDraft.originalCc}</div>}
              <div><span className="text-gray-500">Subject:</span> {currentDraft.originalSubject}</div>
              <div className="mt-3 border-t border-gray-100 pt-3 whitespace-pre-wrap">
                {htmlToText(currentDraft.originalBody)}
              </div>
            </div>
          )}
        </div>

        {currentDraft.sentBody && (
          <div className="p-4 border-t border-gray-100 bg-green-50">
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">Sent Version</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">To:</span> {currentDraft.sentTo}</div>
              {currentDraft.sentCc && <div><span className="text-gray-500">CC:</span> {currentDraft.sentCc}</div>}
              <div><span className="text-gray-500">Subject:</span> {currentDraft.sentSubject}</div>
              <div className="mt-3 whitespace-pre-wrap">{htmlToText(currentDraft.sentBody)}</div>
            </div>
            {currentDraft.reviewedAt && (
              <div className="mt-3 text-xs text-gray-400">
                Reviewed {formatDatetime(currentDraft.reviewedAt)}
                {currentDraft.editsMade ? " (edited)" : " (approved as-is)"}
              </div>
            )}
          </div>
        )}

        {isPending && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            {error && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}
            <div className="flex items-center gap-3">
              {editMode ? (
                <>
                  <button
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      setError(null);
                      try {
                        await postAction(`/api/review/drafts/${encodeURIComponent(String(draftId))}/edit-send`, {
                          ...reviewerPayload(),
                          to: editedTo,
                          cc: editedCc || undefined,
                          subject: editedSubject,
                          body: editedBody,
                        });
                        router.push("/review");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to send");
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting ? "Sending..." : "Send Edited Version"}
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel Edit
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      setError(null);
                      try {
                        await postAction(`/api/review/drafts/${encodeURIComponent(String(draftId))}/approve`, reviewerPayload());
                        router.push("/review");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to approve");
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting ? "Sending..." : "Approve & Send"}
                  </button>
                  <button
                    onClick={startEdit}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      setError(null);
                      try {
                        await postAction(`/api/review/drafts/${encodeURIComponent(String(draftId))}/reject`, reviewerPayload());
                        router.push("/review");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to reject");
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
