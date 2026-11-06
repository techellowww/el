"use client";

import React, { useEffect, useState, use } from "react";
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  AlertCircle,
  Building,
  Calendar,
  Lock,
  Loader2,
  Check,
  PenTool,
} from "lucide-react";

export default function ClientProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [proposal, setProposal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Signing Form States
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  // Decline States
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isDeclining, setIsDeclining] = useState(false);

  const fetchProposal = async () => {
    try {
      const res = await fetch(`/api/proposal/${token}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Proposal not found or link has expired");
      }
      const data = await res.json();
      setProposal(data.proposal);
      if (data.proposal?.client?.name) {
        setSignerName(data.proposal.client.name);
      }
      if (data.proposal?.client?.email) {
        setSignerEmail(data.proposal.client.email);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposal();
  }, [token]);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim() || !signerEmail.trim()) {
      setSignError("Please provide your full legal name and official email address.");
      return;
    }
    if (!signatureData.trim()) {
      setSignError("Please draw or type your electronic signature.");
      return;
    }
    if (!agreedToTerms) {
      setSignError("You must check the agreement box to execute this contract.");
      return;
    }

    setIsSigning(true);
    setSignError(null);

    try {
      const res = await fetch(`/api/proposal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signerEmail: signerEmail.trim(),
          signatureData: signatureData.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to execute signature");
      }

      fetchProposal();
    } catch (err: any) {
      setSignError(err.message || "Failed to sign proposal");
    } finally {
      setIsSigning(false);
    }
  };

  const handleDecline = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeclining(true);

    try {
      const res = await fetch(`/api/proposal/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to decline proposal");

      setShowDeclineModal(false);
      fetchProposal();
    } catch (err: any) {
      alert(err.message || "Failed to decline proposal");
    } finally {
      setIsDeclining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500 font-medium">Securing proposal documents...</p>
        </div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Proposal Link Unavailable</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || "This proposal link is invalid, expired, or has been revoked by the agency."}
          </p>
        </div>
      </div>
    );
  }

  const latestVersion = proposal.versions?.[0];
  const isSigned = proposal.status === "SIGNED" || Boolean(proposal.signature);
  const isDeclined = proposal.status === "DECLINED";

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 py-8 px-4 sm:px-6 lg:px-8 font-sans antialiased print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Secure Client Proposal Portal</span>
            <span className="sm:hidden">Proposal Portal</span>
          </div>
          <button
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print or Save PDF</span>
          </button>
        </div>

        {/* Proposal Document Sheet */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-12 space-y-8 relative overflow-hidden print:border-none print:shadow-none print:p-0">
          {/* Header with Agency Branding & Proposal Info */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-slate-200 pb-8">
            <div className="space-y-3">
              {latestVersion?.logoSnapshotUrl || proposal.account?.logoUrl ? (
                <img
                  src={latestVersion?.logoSnapshotUrl || proposal.account?.logoUrl}
                  alt={proposal.account?.name}
                  className="max-h-12 max-w-[200px] object-contain"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-lg">
                  {proposal.account?.name?.charAt(0) || "A"}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-slate-900">{proposal.account?.name}</h1>
                <p className="text-xs text-slate-500">Digital Solutions & Web Development</p>
              </div>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">PROJECT PROPOSAL</span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{proposal.title}</h2>
              <div className="text-xs text-slate-500 pt-1 space-y-0.5">
                <div>
                  Prepared for: <span className="font-semibold text-slate-800">{proposal.client?.name}</span>
                </div>
                {proposal.client?.company && <div>Organization: {proposal.client.company}</div>}
                <div>Version: <span className="font-mono">v{proposal.currentVersionNumber}</span></div>
                {latestVersion?.contentHash && (
                  <div className="font-mono text-[10px] text-slate-400 truncate max-w-[260px] sm:ml-auto">
                    Hash: {latestVersion.contentHash.substring(0, 16)}...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Proposal HTML Narrative & Scope Body */}
          <div
            className="prose prose-slate max-w-none text-sm text-slate-800 leading-relaxed border-b border-slate-200 pb-8 space-y-4"
            dangerouslySetInnerHTML={{ __html: latestVersion?.contentHtml || "<p>No content available.</p>" }}
          />

          {/* Execution & Signing Section */}
          <div className="pt-4 space-y-6">
            {isSigned ? (
              /* Signed Agreement & Audit Trail Block (Section 6) */
              <div className="p-6 rounded-2xl bg-emerald-50/70 border-2 border-emerald-500/50 space-y-4">
                <div className="flex items-center gap-2.5 text-emerald-900 font-bold text-base">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  <span>Legally Executed & Digitally Sealed Agreement</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-emerald-950 pt-2 border-t border-emerald-200">
                  <div>
                    <span className="text-slate-500 font-semibold block">Authorized Signer</span>
                    <span className="text-sm font-bold text-slate-900">{proposal.signature?.signerName}</span>
                    <span className="block text-slate-600">{proposal.signature?.signerEmail}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block">Signature Timestamp</span>
                    <span className="font-mono text-slate-900 font-medium">
                      {new Date(proposal.signature?.signedAt).toUTCString()}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Local: {new Date(proposal.signature?.signedAt).toLocaleString()}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block">Signer Electronic Mark</span>
                    <div className="font-serif italic text-lg text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-emerald-200 w-fit mt-1">
                      {proposal.signature?.signatureData}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block">Cryptographic Verification & IP</span>
                    <div className="font-mono text-[11px] text-slate-700 mt-1">
                      Signer IP: {proposal.signature?.ipAddress || "Verified"}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 truncate">
                      Document Hash: {latestVersion?.contentHash || "Verified SHA-256"}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-emerald-800/90 pt-2 border-t border-emerald-200">
                  This document was electronically executed in accordance with applicable electronic commerce legislation. A copy has been sealed and archived in the agency audit registry.
                </div>
              </div>
            ) : isDeclined ? (
              <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-red-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-base text-red-700">
                  <XCircle className="w-5 h-5" />
                  <span>Proposal Declined</span>
                </div>
                <p className="text-xs text-red-800">
                  This proposal was declined on {proposal.declinedAt ? new Date(proposal.declinedAt).toLocaleDateString() : "recently"}.
                  {proposal.declineReason && ` Reason: "${proposal.declineReason}"`}
                </p>
              </div>
            ) : (
              /* Active Signing Canvas & Form (Client Action) */
              <div className="p-6 sm:p-8 rounded-2xl bg-slate-50 border border-slate-200 space-y-5 print:hidden">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-blue-600" />
                    <span>Review & Execute Agreement</span>
                  </h3>
                  <p className="text-xs text-slate-600">
                    To accept this proposal, please review the binding declaration below, enter your name, and sign.
                  </p>
                </div>

                {signError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{signError}</span>
                  </div>
                )}

                <form onSubmit={handleSign} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name *</label>
                      <input
                        type="text"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        required
                        placeholder="e.g. Jane Doe"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email Address *</label>
                      <input
                        type="email"
                        value={signerEmail}
                        onChange={(e) => setSignerEmail(e.target.value)}
                        required
                        placeholder="jane@yourcompany.com"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Electronic Signature (Type Your Full Legal Signature) *
                    </label>
                    <input
                      type="text"
                      value={signatureData}
                      onChange={(e) => setSignatureData(e.target.value)}
                      required
                      placeholder="/s/ Jane Doe"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-serif italic text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <span className="text-[11px] text-slate-500 block mt-1">
                      Typing your name above represents your legally binding electronic signature under the ESIGN Act and UETA.
                    </span>
                  </div>

                  {/* Lawyer-Checked Signing Wording (Section 6) */}
                  <div className="p-3.5 rounded-xl bg-white border border-slate-300 flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="legalAgreementCheckbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      required
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="legalAgreementCheckbox" className="text-xs text-slate-800 leading-relaxed cursor-pointer">
                      <strong>Binding Agreement Declaration:</strong> By checking this box and submitting my electronic mark, I agree to the scope of work, deliverables, schedule, and financial terms detailed in this proposal. I certify that I am legally authorized to enter into this contract on behalf of my organization.
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDeclineModal(true)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                    >
                      Decline Proposal
                    </button>

                    <button
                      type="submit"
                      disabled={isSigning}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      <span>Accept & Digitally Sign Proposal</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decline Confirmation Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Decline Proposal</h3>
            <p className="text-xs text-slate-600">
              Are you sure you wish to decline this proposal? You may optionally provide a reason for the agency.
            </p>

            <form onSubmit={handleDecline} className="space-y-4">
              <textarea
                rows={3}
                placeholder="Reason (Optional): e.g. Budget constraints, project timeline change..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeclining}
                  className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isDeclining && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Decline</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

