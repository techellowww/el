"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import {
  FileText,
  Plus,
  Send,
  CheckCircle2,
  Ban,
  Copy,
  ExternalLink,
  DollarSign,
  Calendar,
  Building,
  Clock,
  Trash2,
  X,
  Loader2,
  Check,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { ConfirmModal } from "@/components/MiniModal";

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  timeEntryId?: string;
}

export default function InvoicesPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  const [invoices, setInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [clientFilter, setClientFilter] = useState("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Invoice Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "Website Development Sprint", quantity: 1, unitPriceCents: 150000 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Time Entries for selected project (to pull unbilled time)
  const [unbilledEntries, setUnbilledEntries] = useState<any[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Action Loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<any | null>(null);

  // Bulk Selection States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchInvoices = async () => {
    try {
      const res = await fetch("/api/invoices");
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error("Failed to load invoices:", err);
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
    fetchInvoices();
    fetchClientsAndProjects();
  }, []);

  // Fetch unbilled time entries when project changes in modal
  useEffect(() => {
    if (!selectedProjectId) {
      setUnbilledEntries([]);
      return;
    }
    setLoadingEntries(true);
    fetch(`/api/time?projectId=${selectedProjectId}&allDates=true`)
      .then((r) => r.json())
      .then((data) => {
        const entries = (data.entries || []).filter((e: any) => !e.isLocked && !e.invoiceId);
        setUnbilledEntries(entries);
      })
      .catch(() => setUnbilledEntries([]))
      .finally(() => setLoadingEntries(false));
  }, [selectedProjectId]);

  const handlePullTimeEntries = () => {
    if (unbilledEntries.length === 0) return;
    const project = projects.find((p) => p.id === selectedProjectId);
    const hourlyRateCents = project?.hourlyRateCents || 8500; // default $85/hr

    const newItems: InvoiceItem[] = unbilledEntries.map((e) => {
      const hours = Math.round(((e.durationSeconds || 0) / 3600) * 100) / 100;
      return {
        description: `${e.description || "Project work"} (${new Date(e.startedAt).toLocaleDateString()})`,
        quantity: Math.max(0.1, hours),
        unitPriceCents: hourlyRateCents,
        timeEntryId: e.id,
      };
    });

    setItems((prev) => [...prev.filter((i) => !i.timeEntryId), ...newItems]);
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPriceCents: 5000 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity || 1) * (item.unitPriceCents || 0), 0);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      setCreateError("Please select a client.");
      return;
    }
    if (items.length === 0 || items.some((i) => !i.description.trim())) {
      setCreateError("All line items must have a valid description.");
      return;
    }

    setSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          projectId: selectedProjectId || undefined,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create invoice");
      }

      setShowCreateModal(false);
      setSelectedClientId("");
      setSelectedProjectId("");
      setDueDate("");
      setNotes("");
      setItems([{ description: "Website Development Sprint", quantity: 1, unitPriceCents: 150000 }]);
      fetchInvoices();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendInvoice = async (invoiceId: string) => {
    if (!confirm("Send this invoice to the client? This will assign a sequential invoice number and lock all associated time entries.")) {
      return;
    }

    setActionLoadingId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SEND" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invoice");

      setActionSuccessMsg(`Invoice ${data.invoice.invoiceNumberDisplay} sent to client successfully!`);
      setTimeout(() => setActionSuccessMsg(null), 5000);
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to send invoice");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    if (!confirm("Mark this invoice as PAID? This will record payment and send a confirmation receipt.")) {
      return;
    }

    setActionLoadingId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PAY", paymentMethod: "MANUAL" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record payment");

      setActionSuccessMsg("Invoice marked as PAID and payment confirmed.");
      setTimeout(() => setActionSuccessMsg(null), 5000);
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleVoidInvoice = async (invoiceId: string) => {
    const reason = prompt("Enter a reason for voiding this invoice (this will unlock time entries):");
    if (reason === null) return;

    setActionLoadingId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "VOID", voidReason: reason }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to void invoice");

      setActionSuccessMsg("Invoice voided successfully. Time entries unlocked.");
      setTimeout(() => setActionSuccessMsg(null), 5000);
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to void invoice");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    setActionLoadingId(invoiceToDelete.id);
    try {
      const res = await fetch(`/api/invoices/${invoiceToDelete.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete invoice");

      setActionSuccessMsg(`Invoice ${invoiceToDelete.invoiceNumberDisplay || "DRAFT"} deleted successfully.`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
      setInvoiceToDelete(null);
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to delete invoice");
    } finally {
      setActionLoadingId(null);
    }
  };

  const copyPublicLink = (tokenHash: string, id: string) => {
    const url = `${window.location.origin}/invoice/${tokenHash}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter !== "ALL" && inv.status !== statusFilter) return false;
    if (clientFilter !== "ALL" && inv.clientId !== clientFilter) return false;
    return true;
  });

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredInvoices.length && filteredInvoices.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredInvoices.map((inv) => inv.id));
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
      const res = await fetch("/api/invoices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete invoices");

      setActionSuccessMsg(`${data.count || selectedIds.length} invoice(s) deleted successfully.`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
      setSelectedIds([]);
      setShowBulkDeleteModal(false);
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to delete invoices");
    } finally {
      setBulkDeleting(false);
    }
  };

  const totalInvoicedCents = invoices
    .filter((i) => i.status !== "VOID")
    .reduce((sum, i) => sum + (i.totalCents || 0), 0);

  const totalPaidCents = invoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + (i.totalCents || 0), 0);

  const totalUnpaidCents = invoices
    .filter((i) => i.status === "SENT")
    .reduce((sum, i) => sum + (i.totalCents || 0), 0);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-card border border-border">
        <h2 className="text-xl font-bold text-text-primary">Admin Access Required</h2>
        <p className="text-text-secondary mt-2">Only agency administrators can view and manage invoices.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header with Title and Create Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Invoices</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Generate invoices from time entries or fixed deliverables, issue sequential numbers, and track payments.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Invoice</span>
        </button>
      </div>

      {actionSuccessMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-border shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Total Invoiced</span>
          <div className="text-2xl font-bold text-text-primary mt-1 font-mono">
            ${(totalInvoicedCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-xs text-text-secondary mt-1 block">All active invoices</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-border shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-green-600">Total Collected</span>
          <div className="text-2xl font-bold text-green-600 mt-1 font-mono">
            ${(totalPaidCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-xs text-text-secondary mt-1 block">Paid in full</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-border shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">Pending & Unpaid</span>
          <div className="text-2xl font-bold text-amber-600 mt-1 font-mono">
            ${(totalUnpaidCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-xs text-text-secondary mt-1 block">Awaiting client payment</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-xl bg-white border border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {["ALL", "DRAFT", "SENT", "PAID", "VOID"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                statusFilter === status
                  ? "bg-primary text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {clients.length > 0 && (
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-white text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="p-3.5 px-4 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-red-600 text-white font-bold text-xs flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-red-900">
              {selectedIds.length} invoice{selectedIds.length === 1 ? "" : "s"} selected
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

      {/* Invoices List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-card border border-border">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-text-secondary mt-2">Loading agency invoices...</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-card border border-border text-text-secondary">
          <FileText className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <p className="text-base font-semibold text-text-primary">No invoices found</p>
          <p className="text-xs text-text-secondary mt-1">Create an invoice from deliverables or time entries to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-xs overflow-hidden flex flex-col">
          {/* Inbuilt Scroll View Container */}
          <div className="overflow-x-auto overflow-y-auto max-h-[480px] sm:max-h-[540px] xl:max-h-[calc(100vh-420px)] min-h-[280px] overscroll-contain">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-border shadow-2xs">
                <tr className="text-text-secondary font-semibold">
                  <th className="py-3.5 px-3 bg-slate-50 sticky top-0 z-10 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredInvoices.length > 0 && selectedIds.length === filteredInvoices.length}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                      title="Select all invoices"
                    />
                  </th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Invoice #</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Client &amp; Project</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Amount</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Status</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10">Due Date</th>
                  <th className="py-3.5 px-4 bg-slate-50 sticky top-0 z-10 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.map((inv) => {
                  const statusColors: Record<string, string> = {
                    DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
                    SENT: "bg-blue-50 text-blue-700 border-blue-200",
                    PAID: "bg-green-50 text-green-700 border-green-200",
                    VOID: "bg-red-50 text-red-700 border-red-200",
                  };
                  const isSelected = selectedIds.includes(inv.id);

                  return (
                    <tr
                      key={inv.id}
                      className={`transition ${
                        isSelected ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <td className="py-3.5 px-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(inv.id)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-text-primary">
                        {inv.invoiceNumberDisplay || "DRAFT (Unassigned)"}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-text-primary">{inv.client?.name}</div>
                        <div className="text-[11px] text-text-secondary">{inv.project?.name || "General Account"}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-text-primary text-sm">
                        ${(inv.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            statusColors[inv.status] || "bg-slate-100 text-slate-700 border-slate-300"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-text-secondary">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "Upon Receipt"}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {inv.status === "DRAFT" && (
                          <button
                            onClick={() => handleSendInvoice(inv.id)}
                            disabled={actionLoadingId === inv.id}
                            className="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition cursor-pointer"
                          >
                            <Send className="w-3 h-3 inline mr-1" />
                            Send
                          </button>
                        )}

                        {inv.status === "SENT" && (
                          <button
                            onClick={() => handleMarkAsPaid(inv.id)}
                            disabled={actionLoadingId === inv.id}
                            className="px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3 inline mr-1" />
                            Mark Paid
                          </button>
                        )}

                        {inv.status !== "VOID" && inv.status !== "PAID" && (
                          <button
                            onClick={() => handleVoidInvoice(inv.id)}
                            disabled={actionLoadingId === inv.id}
                            className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-medium transition cursor-pointer"
                            title="Void Invoice"
                          >
                            <Ban className="w-3 h-3 inline" />
                          </button>
                        )}

                        {inv.tokenHash && (
                          <>
                            <button
                              onClick={() => copyPublicLink(inv.tokenHash, inv.id)}
                              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
                              title="Copy Client Link"
                            >
                              {copiedId === inv.id ? <Check className="w-3 h-3 inline text-green-600" /> : <Copy className="w-3 h-3 inline" />}
                            </button>
                            <a
                              href={`/invoice/${inv.tokenHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition inline-flex items-center"
                              title="Open Public Invoice"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}

                        <button
                          onClick={() => setInvoiceToDelete(inv)}
                          disabled={actionLoadingId === inv.id}
                          className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-medium transition cursor-pointer"
                          title="Delete Invoice"
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
              Showing {filteredInvoices.length} invoice{filteredInvoices.length === 1 ? "" : "s"}
              {selectedIds.length > 0 && (
                <strong className="text-red-700 ml-1.5">• {selectedIds.length} selected</strong>
              )}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Inbuilt Scroll View</span>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-text-primary">Create New Invoice</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateInvoice} className="space-y-4">
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
                    <option value="">None / General Invoice</option>
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

              {selectedProjectId && unbilledEntries.length > 0 && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs text-blue-900">
                  <span>
                    <strong>{unbilledEntries.length} unbilled time entries</strong> found for this project.
                  </span>
                  <button
                    type="button"
                    onClick={handlePullTimeEntries}
                    className="px-3 py-1 rounded-lg bg-primary text-white font-semibold hover:bg-primary-hover transition cursor-pointer"
                  >
                    Pull Time Entries
                  </button>
                </div>
              )}

              {/* Line Items Builder */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Line Items</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="space-y-2.5">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 sm:p-0 rounded-xl bg-slate-50 sm:bg-transparent border sm:border-0 border-border">
                      <input
                        type="text"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                        required
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-border bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 w-24 shrink-0">
                          <span className="text-[10px] text-text-secondary">Qty:</span>
                          <input
                            type="number"
                            placeholder="Qty"
                            step="0.1"
                            min="0.1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, "quantity", parseFloat(e.target.value) || 1)}
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs text-center text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <div className="flex items-center gap-1 w-28 shrink-0">
                          <span className="text-xs text-slate-400">$</span>
                          <input
                            type="number"
                            placeholder="Price"
                            step="1"
                            value={item.unitPriceCents / 100}
                            onChange={(e) =>
                              handleItemChange(idx, "unitPriceCents", Math.round(parseFloat(e.target.value || "0") * 100))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-xs font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2 text-sm font-mono font-bold text-text-primary">
                  <span>Subtotal: ${(calculateSubtotal() / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Notes / Payment Terms</label>
                  <input
                    type="text"
                    placeholder="e.g. Net 15, wire details, bank instructions"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                  <span>Save Draft Invoice</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm Delete Invoice Modal */}
      <ConfirmModal
        open={!!invoiceToDelete}
        variant="error"
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice ${invoiceToDelete?.invoiceNumberDisplay || "DRAFT"} (${invoiceToDelete?.client?.name || ""})? Any locked time entries linked to this invoice will be unlocked and returned to unbilled hours. This action cannot be undone.`}
        confirmLabel="Delete Invoice"
        cancelLabel="Cancel"
        loading={actionLoadingId === invoiceToDelete?.id}
        onConfirm={handleConfirmDeleteInvoice}
        onCancel={() => {
          if (!actionLoadingId) setInvoiceToDelete(null);
        }}
      />
      {/* Confirm Bulk Delete Modal */}
      <ConfirmModal
        open={showBulkDeleteModal}
        variant="error"
        title={`Delete ${selectedIds.length} Invoices`}
        message={`Are you sure you want to delete ${selectedIds.length} selected invoice(s)? Any locked time entries linked to these invoices will be unlocked and returned to unbilled hours. This action cannot be undone.`}
        confirmLabel={`Delete ${selectedIds.length} Invoice${selectedIds.length === 1 ? "" : "s"}`}
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

