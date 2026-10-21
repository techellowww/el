'use client';

import React, { useEffect, useState } from 'react';
import { AppShell, formatSecondsToTimer } from '@/components/AppShell';
import { useAuthStore } from '@/lib/store';
import {
  CheckSquare,
  Check,
  X,
  Clock,
  User,
  FolderKanban,
  AlertCircle,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';

interface CorrectionRequest {
  id: string;
  timeEntryId: string;
  userId: string;
  originalStartTime: string;
  originalEndTime: string | null;
  originalDuration: number;
  proposedStartTime: string;
  proposedEndTime: string;
  proposedDuration: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedById: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; employeeId: string; department: string | null };
  reviewer: { id: string; name: string } | null;
  timeEntry: {
    project: { id: string; code: string; name: string };
  };
}

export default function CorrectionsPage() {
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Review Dialog State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<CorrectionRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const url = statusFilter === 'ALL' ? '/api/corrections' : `/api/corrections?status=${statusFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error('Failed to load correction requests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openReviewModal = (req: CorrectionRequest, action: 'APPROVED' | 'REJECTED') => {
    setSelectedRequest(req);
    setReviewAction(action);
    setReviewComment('');
    setReviewError(null);
    setReviewModalOpen(true);
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setIsSubmitting(true);
    setReviewError(null);

    try {
      const res = await fetch(`/api/corrections/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: reviewAction,
          reviewComment,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setReviewError(data.error || 'Failed to process correction review');
        setIsSubmitting(false);
        return;
      }

      setReviewModalOpen(false);
      loadRequests();
    } catch {
      setReviewError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <CheckSquare className="w-6 h-6 text-blue-500" />
              {isAdmin ? 'Time Correction Approvals' : 'My Time Correction Requests'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isAdmin
                ? 'Review, approve, or reject proposed time adjustments submitted by employees.'
                : 'Track the review status of your submitted time adjustment requests.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="py-16 text-center text-slate-500">Loading correction requests...</div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
            No correction requests found for this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-slate-700 transition"
              >
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {req.timeEntry.project.code}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {req.timeEntry.project.name}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        req.status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : req.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-300 border border-red-500/30'
                      }`}
                    >
                      {req.status}
                    </span>
                    {isAdmin && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        {req.user.name} ({req.user.employeeId})
                      </span>
                    )}
                  </div>

                  {/* Before vs After Time Box */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                        Original Recorded Time
                      </span>
                      <p className="text-slate-300 font-mono mt-0.5">
                        {new Date(req.originalStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &nbsp;→&nbsp;{' '}
                        {req.originalEndTime
                          ? new Date(req.originalEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Ongoing'}
                      </p>
                      <span className="text-slate-400 font-mono font-medium">
                        Duration: {formatSecondsToTimer(req.originalDuration)}
                      </span>
                    </div>

                    <div className="border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-3">
                      <span className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold block flex items-center gap-1">
                        Proposed Corrected Time <ArrowRight className="w-3 h-3" />
                      </span>
                      <p className="text-white font-mono mt-0.5 font-medium">
                        {new Date(req.proposedStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &nbsp;→&nbsp;{' '}
                        {new Date(req.proposedEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <span className="text-blue-300 font-mono font-bold">
                        Duration: {formatSecondsToTimer(req.proposedDuration)}
                      </span>
                    </div>
                  </div>

                  {/* Mandatory Reason */}
                  <div className="text-xs text-slate-300 flex items-start gap-1.5">
                    <MessageSquare className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-400">Employee Reason:</strong> {req.reason}
                    </span>
                  </div>

                  {/* Review comment if already decided */}
                  {req.reviewedAt && (
                    <div className="text-xs text-slate-400 border-t border-slate-800 pt-2 flex items-center gap-2">
                      <span>Decided by {req.reviewer?.name || 'Administrator'} on {new Date(req.reviewedAt).toLocaleDateString()}</span>
                      {req.reviewComment && <span>• Note: "{req.reviewComment}"</span>}
                    </div>
                  )}
                </div>

                {/* Admin Actions */}
                {isAdmin && req.status === 'PENDING' && (
                  <div className="flex sm:flex-col items-center gap-2 shrink-0">
                    <button
                      id={`approve-btn-${req.id}`}
                      data-testid="approve-btn"
                      onClick={() => openReviewModal(req, 'APPROVED')}
                      className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
                    >
                      <Check className="w-4 h-4" /> Approve
                    </button>
                    <button
                      id={`reject-btn-${req.id}`}
                      data-testid="reject-btn"
                      onClick={() => openReviewModal(req, 'REJECTED')}
                      className="w-full py-2 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-red-600/20 transition"
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Review Confirmation Modal */}
        {reviewModalOpen && selectedRequest && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <h3 className="text-base font-bold text-white">
                  {reviewAction === 'APPROVED' ? 'Approve Correction Request' : 'Reject Correction Request'}
                </h3>
                <button
                  onClick={() => setReviewModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {reviewError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{reviewError}</span>
                </div>
              )}

              <form onSubmit={handleReviewSubmit} className="space-y-4">
                <p className="text-xs text-slate-300">
                  {reviewAction === 'APPROVED'
                    ? 'Approving will automatically update the underlying time entry to the proposed start and end timestamps and recalculate report totals.'
                    : 'Rejecting will preserve the original time entry intact.'}
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Review Comment / Reason (Optional)
                  </label>
                  <textarea
                    id="review-comment-textarea"
                    data-testid="review-comment-textarea"
                    rows={3}
                    placeholder="Provide a decision note..."
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    id="cancel-review-btn"
                    data-testid="cancel-review-btn"
                    type="button"
                    onClick={() => setReviewModalOpen(false)}
                    className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-review-btn"
                    data-testid="confirm-review-btn"
                    type="submit"
                    disabled={isSubmitting}
                    className={`py-2 px-4 rounded-xl text-xs font-semibold text-white shadow-md transition disabled:opacity-50 ${
                      reviewAction === 'APPROVED'
                        ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                        : 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
                    }`}
                  >
                    {isSubmitting ? 'Processing...' : `Confirm ${reviewAction === 'APPROVED' ? 'Approval' : 'Rejection'}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
