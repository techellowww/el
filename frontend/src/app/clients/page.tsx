"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore, useChatStore } from "@/lib/store";
import {
  Users,
  Plus,
  Mail,
  Phone,
  Check,
  Copy,
  Building,
  UserCheck,
  ExternalLink,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
  Loader2,
  MessageSquare,
} from "lucide-react";

export default function ClientsPage() {
  const { user } = useAuthStore();
  const [clients, setClients] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Client Form State
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [chatLink, setChatLink] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [createdResult, setCreatedResult] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Client Modal State
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editChatLink, setEditChatLink] = useState("");
  const [editUserIds, setEditUserIds] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Delete Client Modal State
  const [clientToDelete, setClientToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";

  const resetCreateForm = () => {
    setName("");
    setCompany("");
    setEmail("");
    setPhone("");
    setNotes("");
    setChatLink("");
    setSelectedUserIds([]);
    setCreatedResult(null);
    setCreateError(null);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    resetCreateForm();
  };

  const handleCloseEditModal = () => {
    setEditingClient(null);
    setEditName("");
    setEditCompany("");
    setEditEmail("");
    setEditPhone("");
    setEditNotes("");
    setEditChatLink("");
    setEditUserIds([]);
    setUpdateError(null);
  };

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error("Failed to fetch clients:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/employees");
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    }
  };

  useEffect(() => {
    fetchClients();
    if (isAdmin) {
      fetchEmployees();
    }
  }, [isAdmin]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          company,
          email,
          phone,
          notes,
          chatLink: chatLink.trim() || undefined,
          assignedUserIds: selectedUserIds,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setCreatedResult(data);
        fetchClients();
      } else {
        setCreateError(data.error || "Failed to create client");
      }
    } catch (err: any) {
      setCreateError(err.message || "Error creating client");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (client: any) => {
    setEditingClient(client);
    setEditName(client.name || "");
    setEditCompany(client.company || "");
    setEditEmail(client.email || "");
    setEditPhone(client.phone || "");
    setEditNotes(client.notes || "");
    setEditChatLink(client.chatLink || "");
    setEditUserIds(
      client.assignments?.map((a: any) => a.user?.id || a.userId).filter(Boolean) || []
    );
    setUpdateError(null);
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setUpdating(true);
    setUpdateError(null);

    try {
      const res = await fetch(`/api/clients/${editingClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          company: editCompany,
          email: editEmail,
          phone: editPhone,
          notes: editNotes,
          chatLink: editChatLink.trim() || undefined,
          assignedUserIds: editUserIds,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setEditingClient(null);
        fetchClients();
      } else {
        setUpdateError(data.error || "Failed to update client");
      }
    } catch (err: any) {
      setUpdateError(err.message || "Error updating client");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/clients/${clientToDelete.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok) {
        const deletedId = clientToDelete.id;
        setClientToDelete(null);
        setClients((prev) => prev.filter((c) => c.id !== deletedId));
        await fetchClients();
      } else {
        setDeleteError(data.error || "Failed to delete client");
      }
    } catch (err: any) {
      setDeleteError(err.message || "Error deleting client");
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const toggleUserAssignment = (userId: string, isEdit: boolean) => {
    if (isEdit) {
      setEditUserIds((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      );
    } else {
      setSelectedUserIds((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      );
    }
  };

  const displayClients = clients.filter(
    (c) => c.company !== "__INTERNAL_GENERAL_TEAM__"
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="page-heading text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            <span>Clients</span>
          </h1>
          <p className="helper-text text-text-secondary mt-1">
            {isAdmin
              ? "All agency clients, assigned team members, and private portal links."
              : "Clients currently assigned to you."}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setCreatedResult(null);
              setName("");
              setCompany("");
              setEmail("");
              setPhone("");
              setNotes("");
              setSelectedUserIds([]);
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text shadow-sm transition cursor-pointer self-start sm:self-auto shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Client</span>
          </button>
        )}
      </div>

      {/* Clients List */}
      {loading ? (
        <div className="p-12 text-center helper-text text-text-secondary">Loading clients...</div>
      ) : displayClients.length === 0 ? (
        <div className="p-12 text-center bg-white border border-border rounded-card body-text text-text-secondary shadow-sm">
          No clients available.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayClients.map((c) => {
            const assignedMembers = c.assignments?.map((a: any) => a.user?.name).filter(Boolean) || [];
            return (
              <div
                key={c.id}
                className="p-4 sm:p-6 rounded-card bg-white border border-border hover:shadow-md transition shadow-sm space-y-3.5 sm:space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="card-title text-text-primary truncate">{c.name}</h3>
                      {c.company && (
                        <p className="helper-text text-primary flex items-center gap-1.5 mt-0.5 truncate">
                          <Building className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{c.company}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="label-text text-text-secondary bg-slate-100 px-2.5 py-1 rounded-full border border-border">
                        {c.projects?.length || 0} Projects
                      </span>

                      {isAdmin && (
                        <div className="flex items-center gap-1 border-l border-border pl-2">
                          <button
                            onClick={() => handleOpenEdit(c)}
                            title="Edit Client"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-100 transition cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setClientToDelete(c);
                              setDeleteError(null);
                            }}
                            title="Delete Client"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-error hover:bg-red-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 helper-text text-text-secondary">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-text-primary truncate">{c.email}</span>
                    </div>
                    {c.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{c.phone}</span>
                      </div>
                    )}
                    {c.chatLink && (
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                        <a
                          href={c.chatLink.startsWith("http") ? c.chatLink : `https://${c.chatLink}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline truncate"
                          title={c.chatLink}
                        >
                          {c.chatLink}
                        </a>
                      </div>
                    )}
                  </div>

                  {c.notes && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-border body-text text-text-primary">
                      <span className="label-text uppercase font-semibold text-text-secondary block mb-0.5">
                        Notes
                      </span>
                      <p className="line-clamp-3">{c.notes}</p>
                    </div>
                  )}
                </div>

                {/* Team Assignment & Chat Action */}
                <div className="pt-2 border-t border-border flex items-center justify-between helper-text gap-2">
                  <div className="flex items-center gap-1.5 text-text-secondary min-w-0 flex-1">
                    <UserCheck className="w-3.5 h-3.5 text-success shrink-0" />
                    <span className="helper-text truncate">
                      {assignedMembers.length > 0
                        ? `Assigned: ${assignedMembers.join(", ")}`
                        : "No specific team assigned"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      useChatStore.getState().setActiveConvId(c.id);
                      useChatStore.getState().setIsOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-primary text-xs font-semibold border border-blue-200 transition cursor-pointer shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Chat</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Client Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) handleCloseCreateModal();
          }}
        >
          <div
            className="w-full max-w-lg bg-white border border-border rounded-card p-6 sm:p-8 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="section-heading text-text-primary flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <span>Add New Client</span>
              </h3>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                className="text-text-secondary hover:text-text-primary p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-green-50 border border-green-200 body-text text-green-900">
                  <p className="card-title text-success mb-1">
                    Client Created Successfully!
                  </p>
                  <p className="body-text text-green-800">
                    ClientHub created a secure hashed private link. Copy and send this private link to your client:
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-border flex items-center justify-between gap-2">
                  <code className="helper-text text-primary font-mono truncate">
                    {typeof window !== "undefined" ? window.location.origin + createdResult.portalUrl : createdResult.portalUrl}
                  </code>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        window.location.origin + createdResult.portalUrl,
                        "new-client-link"
                      )
                    }
                    className="p-2 rounded-lg bg-primary hover:bg-primary-hover text-white shrink-0 cursor-pointer transition shadow-sm"
                  >
                    {copiedId === "new-client-link" ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <a
                    href={createdResult.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-border btn-text text-text-primary flex items-center gap-1.5 transition"
                  >
                    <span>Test Portal View</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover btn-text text-white transition shadow-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateClient} className="space-y-4">
                {createError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-error helper-text flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Client Contact Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rachel Adams"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Horizon Labs"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block label-text text-text-primary font-medium mb-1.5">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="rachel@horizon.com"
                      className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block label-text text-text-primary font-medium mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1-555-0199"
                      className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Key requirements, retainer details, or contact preferences"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Client Chat Link
                  </label>
                  <input
                    type="url"
                    value={chatLink}
                    onChange={(e) => setChatLink(e.target.value)}
                    placeholder="e.g. https://chat.clientdomain.com or Slack/Discord channel link"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                {employees.length > 0 && (
                  <div>
                    <label className="block label-text text-text-primary font-medium mb-1.5">
                      Assign Team Members
                    </label>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 border border-border rounded-xl bg-slate-50">
                      {employees.map((emp) => (
                        <label
                          key={emp.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white text-text-secondary hover:text-text-primary cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(emp.id)}
                            onChange={() => toggleUserAssignment(emp.id, false)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="font-medium text-text-primary">{emp.name}</span>
                          <span className="text-xs text-text-secondary">({emp.email})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={handleCloseCreateModal}
                    className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover btn-text text-white shadow-sm cursor-pointer disabled:opacity-50 transition flex items-center gap-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{submitting ? "Saving..." : "Create Client & Generate Portal"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !updating) handleCloseEditModal();
          }}
        >
          <div
            className="w-full max-w-lg bg-white border border-border rounded-card p-6 sm:p-8 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="section-heading text-text-primary flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" />
                <span>Edit Client</span>
              </h3>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="text-text-secondary hover:text-text-primary p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateClient} className="space-y-4">
              {updateError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-error helper-text flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{updateError}</span>
                </div>
              )}

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Client Contact Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Rachel Adams"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Company Name
                </label>
                <input
                  type="text"
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  placeholder="e.g. Horizon Labs"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="rachel@horizon.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+1-555-0199"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Key requirements, retainer details, or contact preferences"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Client Chat Link
                </label>
                <input
                  type="url"
                  value={editChatLink}
                  onChange={(e) => setEditChatLink(e.target.value)}
                  placeholder="e.g. https://chat.clientdomain.com or Slack/Discord channel link"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {employees.length > 0 && (
                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Assigned Team Members
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 border border-border rounded-xl bg-slate-50">
                    {employees.map((emp) => (
                      <label
                        key={emp.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white text-text-secondary hover:text-text-primary cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={editUserIds.includes(emp.id)}
                          onChange={() => toggleUserAssignment(emp.id, true)}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="font-medium text-text-primary">{emp.name}</span>
                        <span className="text-xs text-text-secondary">({emp.email})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-3">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      const toDel = editingClient;
                      setEditingClient(null);
                      setClientToDelete(toDel);
                      setDeleteError(null);
                    }}
                    className="px-3.5 py-2 rounded-xl text-error hover:bg-red-50 border border-transparent hover:border-red-200 btn-text transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>Delete Client</span>
                  </button>
                )}
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={handleCloseEditModal}
                    className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updating}
                    className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover btn-text text-white shadow-sm cursor-pointer disabled:opacity-50 transition flex items-center gap-2"
                  >
                    {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{updating ? "Saving Changes..." : "Save Changes"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Client Confirmation Modal */}
      {clientToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setClientToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md bg-white border border-border rounded-card p-6 sm:p-8 shadow-xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-error">
              <div className="p-3 bg-red-50 border border-red-200 rounded-full">
                <AlertTriangle className="w-6 h-6 text-error" />
              </div>
              <div>
                <h3 className="section-heading text-text-primary">Delete Client</h3>
                <p className="helper-text text-text-secondary">This action cannot be undone.</p>
              </div>
            </div>

            <p className="body-text text-text-secondary">
              Are you sure you want to permanently delete{" "}
              <strong className="text-text-primary">{clientToDelete.name}</strong>
              {clientToDelete.company ? ` (${clientToDelete.company})` : ""}? All associated
              projects, status updates, invoices, and portal access will be permanently removed.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-error helper-text flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClient}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl bg-error hover:bg-red-700 btn-text text-white shadow-sm cursor-pointer disabled:opacity-50 transition flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{deleting ? "Deleting..." : "Delete Client"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
