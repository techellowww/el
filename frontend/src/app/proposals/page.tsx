"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import {
  FileText,
  Plus,
  Sparkles,
  Send,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Calendar,
  Building,
  Check,
  X,
  Loader2,
  AlertCircle,
  Clock,
  History,
  ShieldCheck,
  DollarSign,
  Trash2,
} from "lucide-react";
import { ConfirmModal } from "@/components/MiniModal";

interface PriceItem {
  name: string;
  description?: string;
  priceCents: number;
}

export default function ProposalsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  const [proposals, setProposals] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Proposal Modal
  const [showModal, setShowModal] = useState(false);
  const [isAiMode, setIsAiMode] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");

  // AI Generator States
  const [projectDescription, setProjectDescription] = useState("");
  const [pricingItems, setPricingItems] = useState<PriceItem[]>([
    { name: "Website Architecture & UX Wireframes", priceCents: 150000 },
    { name: "Full-Stack Development Sprint & CMS", priceCents: 350000 },
    { name: "Staging Testing, QA & Launch Deployment", priceCents: 100000 },
  ]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [generationsRemaining, setGenerationsRemaining] = useState<number | null>(null);

  // Review & Sending States
  const [ownerReviewed, setOwnerReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Deletion States
  const [proposalToDelete, setProposalToDelete] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Bulk Selection States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const resetForm = () => {
    setSelectedClientId("");
    setSelectedProjectId("");
    setTitle("");
    setContentHtml("");
    setProjectDescription("");
    setPricingItems([
      { name: "Website Architecture & UX Wireframes", priceCents: 150000 },
      { name: "Full-Stack Development Sprint & CMS", priceCents: 350000 },
      { name: "Staging Testing, QA & Launch Deployment", priceCents: 100000 },
    ]);
    setErrorMsg(null);
    setAiError(null);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const fetchProposals = async () => {
    try {
      const res = await fetch("/api/proposals");
      if (res.ok) {
        const data = await res.json();
        setProposals(data.proposals || []);
      }
    } catch (err) {
      console.error("Failed to load proposals:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClientsAndProjects = async () => {
    try {
      const [cRes, pRes] = await Promise.all([fetch("/api/clients"), fetch("/api/projects")]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setClients(cData.clients || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setProjects(pData.projects || []);
      }
    } catch (err) {
      console.error("Failed to load metadata:", err);
    }
  };

  useEffect(() => {
    fetchProposals();
    fetchClientsAndProjects();
  }, []);

  const handleAddPriceItem = () => {
    setPricingItems((prev) => [...prev, { name: "", priceCents: 50000 }]);
  };

  const handleRemovePriceItem = (index: number) => {
    setPricingItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handlePriceItemChange = (index: number, field: keyof PriceItem, value: any) => {
    setPricingItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleGenerateAiProposal = async () => {
    if (!selectedClientId) {
      setAiError("Please select a client first.");
      return;
    }
    if (!projectDescription.trim()) {
      setAiError("Please describe the job and project requirements.");
      return;
    }

    setIsGeneratingAi(true);
    setAiError(null);

    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "AI_DRAFT",
          clientId: selectedClientId,
          projectDescription,
          pricingItems,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate AI proposal");
      }

      setContentHtml(data.contentHtml);
      if (data.generationsRemaining !== undefined) {
        setGenerationsRemaining(data.generationsRemaining);
      }
      if (!title) {
        const client = clients.find((c) => c.id === selectedClientId);
        setTitle(`Website Proposal for ${client?.name || "Client"}`);
      }
    } catch (err: any) {
      setAiError(err.message || "Failed to generate AI proposal");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !title.trim()) {
      setErrorMsg("Client and proposal title are required.");
      return;
    }
    if (!contentHtml.trim()) {
      setErrorMsg("Proposal content cannot be empty.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          projectId: selectedProjectId || undefined,
          title: title.trim(),
          contentHtml,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create proposal");

      handleCloseModal();
      setSuccessMsg("Draft proposal created successfully!");
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchProposals();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create proposal");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendProposal = async (proposalId: string) => {
    const verified = confirm(
      "Have you reviewed the proposal narrative and fixed pricing items?\n\nSending will lock this version, compute a SHA-256 hash, and email the client with their private review and signing link."
    );
    if (!verified) return;

    setSendingId(proposalId);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SEND", ownerReviewed: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send proposal");

      setSuccessMsg(`Proposal "${data.proposal.title}" sent to client!`);
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchProposals();
    } catch (err: any) {
      alert(err.message || "Failed to send proposal");
    } finally {
      setSendingId(null);
    }
  };

  const handleConfirmDeleteProposal = async () => {
    if (!proposalToDelete) return;
    setDeletingId(proposalToDelete.id);
    try {
      const res = await fetch(`/api/proposals/${proposalToDelete.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete proposal");

      setSuccessMsg(`Proposal "${proposalToDelete.title}" deleted.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setProposalToDelete(null);
      fetchProposals();
    } catch (err: any) {
      alert(err.message || "Failed to delete proposal");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === proposals.length && proposals.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(proposals.map((p) => p.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete proposals");

      setSuccessMsg(`${data.count || selectedIds.length} proposal(s) deleted successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setSelectedIds([]);
      setShowBulkDeleteModal(false);
      fetchProposals();
    } catch (err: any) {
      alert(err.message || "Failed to delete proposals");
    } finally {
      setBulkDeleting(false);
    }
  };

  const copyPublicLink = (tokenHash: string, id: string) => {
    const url = `${window.location.origin}/proposal/${tokenHash}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-card border border-border">
        <h2 className="text-xl font-bold text-text-primary">Admin Access Required</h2>
        <p className="text-text-secondary mt-2">Only agency administrators can create and manage proposals.</p>
      </div>
    );
  }

  const totalProposals = proposals.length;
  const signedCount = proposals.filter((p) => p.status === "SIGNED").length;
  const sentCount = proposals.filter((p) => p.status === "SENT").length;
  const draftCount = proposals.filter((p) => p.status === "DRAFT").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Proposals</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Draft proposals with AI assistance, bind fixed price tables, lock version hashes, and obtain digital signatures.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>New AI Proposal</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-border shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Total Proposals</span>
          <div className="text-2xl font-bold text-text-primary mt-1">{totalProposals}</div>
          <span className="text-xs text-text-secondary mt-1 block">Created to date</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-border shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-green-600">Signed & Accepted</span>
          <div className="text-2xl font-bold text-green-600 mt-1">{signedCount}</div>
          <span className="text-xs text-text-secondary mt-1 block">Executed contracts</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-border shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Awaiting Reply</span>
          <div className="text-2xl font-bold text-blue-600 mt-1">{sentCount}</div>
          <span className="text-xs text-text-secondary mt-1 block">Sent to clients</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-border shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Drafts</span>
          <div className="text-2xl font-bold text-slate-700 mt-1">{draftCount}</div>
          <span className="text-xs text-text-secondary mt-1 block">Work in progress</span>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="p-3.5 px-4 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-red-600 text-white font-bold text-xs flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-red-900">
              {selectedIds.length} proposal{selectedIds.length === 1 ? "" : "s"} selected
            </span>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-red-700 hover:text-red-900 underline font-medium cursor-pointer ml-1"
            >
              Deselect All
            </button>
          </div>

          <button
            onClick={() => setShowBulkDeleteModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Selected ({selectedIds.length})</span>
          </button>
        </div>
      )}

      {/* Proposals Table */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-card border border-border">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-text-secondary mt-2">Loading agency proposals...</p>
        </div>
      ) : proposals.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-card border border-border text-text-secondary">
          <FileText className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <p className="text-base font-semibold text-text-primary">No proposals found</p>
          <p className="text-xs text-text-secondary mt-1">Use the AI Proposal assistant to generate your first draft in seconds.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-xs overflow-hidden flex flex-col">
          {/* Inbuilt Scroll View Container */}
          <div className="overflow-x-auto overflow-y-auto max-h-[500px] sm:max-h-[560px] xl:max-h-[calc(100vh-360px)] min-h-[280px] overscroll-contain">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-border shadow-2xs">
                <tr className="text-text-secondary font-semibold">
                  <th className="py-3.5 px-3 bg-slate-50 sticky top-0 z-10 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={proposals.length > 0 && selectedIds.length === proposals.length}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                      title="Select all proposals"
                    />
                  </th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Proposal Title</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Client</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Status</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Version</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Sent Date</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {proposals.map((prop) => {
                  const statusColors: Record<string, string> = {
                    DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
                    SENT: "bg-blue-50 text-blue-700 border-blue-200",
                    SIGNED: "bg-green-50 text-green-700 border-green-200",
                    DECLINED: "bg-red-50 text-red-700 border-red-200",
                    EXPIRED: "bg-amber-50 text-amber-700 border-amber-200",
                  };
                  const isSelected = selectedIds.includes(prop.id);

                  return (
                    <tr
                      key={prop.id}
                      className={`transition ${
                        isSelected ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <td className="py-3.5 px-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(prop.id)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-text-primary">
                        {prop.title}
                        {prop.project && (
                          <span className="block text-[11px] text-text-secondary font-normal">{prop.project.name}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="font-medium">{prop.client?.name}</div>
                        <div className="text-[11px] text-text-secondary">{prop.client?.email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            statusColors[prop.status] || "bg-slate-100 text-slate-700 border-slate-300"
                          }`}
                        >
                          {prop.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">v{prop.currentVersionNumber}</td>
                      <td className="py-3.5 px-4 text-text-secondary">
                        {prop.sentAt ? new Date(prop.sentAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {prop.status === "DRAFT" && (
                          <button
                            onClick={() => handleSendProposal(prop.id)}
                            disabled={sendingId === prop.id}
                            className="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition cursor-pointer"
                          >
                            <Send className="w-3 h-3 inline mr-1" />
                            Send
                          </button>
                        )}

                        {prop.tokenHash && (
                          <>
                            <button
                              onClick={() => copyPublicLink(prop.tokenHash, prop.id)}
                              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
                              title="Copy Client Link"
                            >
                              {copiedId === prop.id ? <Check className="w-3 h-3 inline text-green-600" /> : <Copy className="w-3 h-3 inline" />}
                            </button>
                            <a
                              href={`/proposal/${prop.tokenHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition inline-flex items-center"
                              title="Open Public Proposal"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}

                        <button
                          onClick={() => setProposalToDelete(prop)}
                          disabled={deletingId === prop.id}
                          className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-medium transition cursor-pointer"
                          title="Delete Proposal"
                        >
                          <Trash2 className="w-3 h-3 inline" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Inbuilt Scroll View Status Bar */}
          <div className="px-4 py-2.5 bg-slate-50/75 border-t border-border flex items-center justify-between text-[11px] text-text-secondary">
            <span>
              Showing {proposals.length} proposal{proposals.length === 1 ? "" : "s"}
              {selectedIds.length > 0 && (
                <strong className="text-red-700 ml-1.5">• {selectedIds.length} selected</strong>
              )}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Inbuilt Scroll View</span>
          </div>
        </div>
      )}

      {/* New Proposal Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting && !isGeneratingAi) handleCloseModal();
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl space-y-5 my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-text-primary">Create Project Proposal</h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateProposal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Client *</label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Select Client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company ? `(${c.company})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Project (Optional)</label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">None / New Project</option>
                    {projects
                      .filter((p) => !selectedClientId || p.clientId === selectedClientId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Proposal Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Website Redesign & E-Commerce Platform"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setIsAiMode(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    isAiMode ? "bg-white text-primary shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Proposal Generator</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiMode(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    !isAiMode ? "bg-white text-primary shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Manual Editor
                </button>
              </div>

              {/* AI Generator Box */}
              {isAiMode && (
                <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>Describe the Job (AI writes wording; prices come from table)</span>
                    </span>
                    {generationsRemaining !== null && (
                      <span className="text-[11px] font-medium text-blue-700">
                        {generationsRemaining} AI generations left this month
                      </span>
                    )}
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Describe what the client needs: e.g. Full rebranding, Shopify to Next.js migration, responsive layout, Stripe checkout, mobile optimization..."
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    className="w-full p-3 rounded-xl border border-blue-200 bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />

                  {/* Fixed Price Table Items */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-950">Fixed Price Table Items (Section 6 Rule)</span>
                      <button
                        type="button"
                        onClick={handleAddPriceItem}
                        className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                      >
                        + Add Deliverable
                      </button>
                    </div>

                    <div className="space-y-2">
                      {pricingItems.map((item, idx) => (
                        <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 sm:p-0 rounded-xl bg-white sm:bg-transparent border sm:border-0 border-blue-100">
                          <input
                            type="text"
                            placeholder="Deliverable Name"
                            value={item.name}
                            onChange={(e) => handlePriceItemChange(idx, "name", e.target.value)}
                            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-border bg-white text-xs text-text-primary focus:outline-none"
                          />
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 w-28 shrink-0">
                              <span className="text-xs text-slate-400">$</span>
                              <input
                                type="number"
                                placeholder="Price"
                                step="50"
                                value={item.priceCents / 100}
                                onChange={(e) =>
                                  handlePriceItemChange(idx, "priceCents", Math.round(parseFloat(e.target.value || "0") * 100))
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs font-mono text-text-primary focus:outline-none"
                              />
                            </div>
                            {pricingItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemovePriceItem(idx)}
                                className="p-1.5 text-slate-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {aiError && <p className="text-xs text-red-600 font-medium">{aiError}</p>}

                  <button
                    type="button"
                    onClick={handleGenerateAiProposal}
                    disabled={isGeneratingAi}
                    className="w-full py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isGeneratingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{isGeneratingAi ? "Generating Proposal Narrative..." : "Draft Narrative with AI"}</span>
                  </button>
                </div>
              )}

              {/* Proposal Document Preview / Editor */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-text-secondary">Proposal Content (HTML / Rich Text)</label>
                <textarea
                  rows={8}
                  value={contentHtml}
                  onChange={(e) => setContentHtml(e.target.value)}
                  placeholder="<h2>Scope of Work</h2><p>Describe deliverables and timeline...</p>"
                  className="w-full p-3 rounded-xl border border-border font-mono text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Owner Review Checkbox (Section 6) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-border flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="ownerReviewCheck"
                  checked={ownerReviewed}
                  onChange={(e) => setOwnerReviewed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <label htmlFor="ownerReviewCheck" className="text-xs text-text-primary leading-relaxed cursor-pointer">
                  <strong>Agency Owner Verification:</strong> I have reviewed this proposal narrative and confirmed the price table items match our agency guidelines.
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Draft Proposal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm Delete Proposal Modal */}
      <ConfirmModal
        open={!!proposalToDelete}
        variant="error"
        title="Delete Proposal"
        message={`Are you sure you want to delete proposal "${proposalToDelete?.title}"? All versions and associated records will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete Proposal"
        cancelLabel="Cancel"
        loading={!!deletingId}
        onConfirm={handleConfirmDeleteProposal}
        onCancel={() => {
          if (!deletingId) setProposalToDelete(null);
        }}
      />
      {/* Confirm Bulk Delete Modal */}
      <ConfirmModal
        open={showBulkDeleteModal}
        variant="error"
        title={`Delete ${selectedIds.length} Proposals`}
        message={`Are you sure you want to delete ${selectedIds.length} selected proposal(s)? All versions and associated records will be permanently removed. This action cannot be undone.`}
        confirmLabel={`Delete ${selectedIds.length} Proposal${selectedIds.length === 1 ? "" : "s"}`}
        cancelLabel="Cancel"
        loading={bulkDeleting}
        onConfirm={handleBulkDelete}
        onCancel={() => {
          if (!bulkDeleting) setShowBulkDeleteModal(false);
        }}
      />
    </div>
  );
}

