"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

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

export default function ReviewDraft() {
  const params = useParams();
  const router = useRouter();
  const draftId = params.id as string;

  const draft = useQuery(api.draftEmails.getById, {
    id: draftId as Id<"draftEmails">,
  });

  // Get the originating classification for context
  const classification = useQuery(
    api.emailClassifications.getById,
    draft?.classificationId ? { id: draft.classificationId } : "skip"
  );

  const { data: session } = useSession();
  const googleId = (session?.user as Record<string, unknown> | undefined)?.googleId as string | undefined;

  const approveMutation = useMutation(api.draftEmails.approve);
  const editAndSendMutation = useMutation(api.draftEmails.editAndSend);
  const rejectMutation = useMutation(api.draftEmails.reject);

  const [editMode, setEditMode] = useState(false);
  const [editedTo, setEditedTo] = useState("");
  const [editedCc, setEditedCc] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (draft === undefined) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-gray-400 py-8 text-center">Loading draft...</div>
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

  const isPending = draft.status === "pending";
  const htmlToText = (html: string) => html.replace(/<[^>]*>/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  function startEdit() {
    setEditedTo(draft!.originalTo);
    setEditedCc(draft!.originalCc ?? "");
    setEditedSubject(draft!.originalSubject);
    setEditedBody(htmlToText(draft!.originalBody));
    setEditMode(true);
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/review")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to queue
          </button>
          {statusBadge(draft.status)}
          {tierBadge(draft.tier)}
        </div>
        <span className="text-xs text-gray-400">
          Created {formatDatetime(draft.createdAt)}
        </span>
      </div>

      {/* Context Panel */}
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

      {/* Draft Content */}
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
              <div><span className="text-gray-500">To:</span> {draft.originalTo}</div>
              {draft.originalCc && <div><span className="text-gray-500">CC:</span> {draft.originalCc}</div>}
              <div><span className="text-gray-500">Subject:</span> {draft.originalSubject}</div>
              <div
                className="mt-3 prose prose-sm max-w-none border-t border-gray-100 pt-3"
                dangerouslySetInnerHTML={{ __html: draft.originalBody }}
              />
            </div>
          )}
        </div>

        {/* Sent version (if reviewed) */}
        {draft.sentBody && (
          <div className="p-4 border-t border-gray-100 bg-green-50">
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">Sent Version</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">To:</span> {draft.sentTo}</div>
              {draft.sentCc && <div><span className="text-gray-500">CC:</span> {draft.sentCc}</div>}
              <div><span className="text-gray-500">Subject:</span> {draft.sentSubject}</div>
              <div
                className="mt-3 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: draft.sentBody }}
              />
            </div>
            {draft.reviewedAt && (
              <div className="mt-3 text-xs text-gray-400">
                Reviewed {formatDatetime(draft.reviewedAt)}
                {draft.editsMade ? " (edited)" : " (approved as-is)"}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            {error && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}
            {!googleId && (
              <div className="mb-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                Sign in to review drafts.
              </div>
            )}
            <div className="flex items-center gap-3">
              {editMode ? (
                <>
                  <button
                    disabled={isSubmitting || !googleId}
                    onClick={async () => {
                      setIsSubmitting(true);
                      setError(null);
                      try {
                        await editAndSendMutation({
                          id: draftId as Id<"draftEmails">,
                          reviewerGoogleId: googleId!,
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
                    disabled={isSubmitting || !googleId}
                    onClick={async () => {
                      setIsSubmitting(true);
                      setError(null);
                      try {
                        await approveMutation({
                          id: draftId as Id<"draftEmails">,
                          reviewerGoogleId: googleId!,
                        });
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
                    disabled={isSubmitting || !googleId}
                    onClick={async () => {
                      setIsSubmitting(true);
                      setError(null);
                      try {
                        await rejectMutation({
                          id: draftId as Id<"draftEmails">,
                          reviewerGoogleId: googleId!,
                        });
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
