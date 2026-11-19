"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore, formatSecondsToTimer } from "@/lib/store";
import { getInitials } from "@/lib/utils";
import {
  Users,
  Plus,
  Mail,
  UserCheck,
  Shield,
  ShieldAlert,
  Clock,
  Building,
  Check,
  Search,
  Edit2,
  Trash2,
  AlertCircle,
  Briefcase,
  Play,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  displayName?: string | null;
  title?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  bio?: string | null;
  department?: string | null;
  employeeId?: string | null;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  isActive: boolean;
  createdAt: string;
  assignedClients: Array<{ id: string; name: string; company?: string | null }>;
  totalTrackedSeconds: number;
  activeTimer?: {
    id: string;
    startedAt: string;
    description?: string | null;
    project?: { id: string; name: string } | null;
  } | null;
}

interface ClientOption {
  id: string;
  name: string;
  company?: string | null;
}

export default function EmployeesPage() {
  const { user } = useAuthStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"ALL" | "ADMIN" | "EMPLOYEE">("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Add / Edit Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "EMPLOYEE">("EMPLOYEE");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete Modal State
  const [empToDelete, setEmpToDelete] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user?.role === "ADMIN";

  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/employees");
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
        setClients(data.clients || []);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to load employees");
      }
    } catch (err: any) {
      console.error("Failed to load employees:", err);
      setError("Network error loading team members.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const resetForm = () => {
    setEditingEmp(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("EMPLOYEE");
    setSelectedClientIds([]);
    setModalError(null);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmp(emp);
    setName(emp.name);
    setEmail(emp.email);
    setPassword("");
    setRole(emp.role);
    setSelectedClientIds(emp.assignedClients.map((c) => c.id));
    setModalError(null);
    setShowModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    try {
      if (editingEmp) {
        // PATCH
        const res = await fetch(`/api/employees/${editingEmp.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            role,
            ...(password ? { password } : {}),
            assignedClientIds: selectedClientIds,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || "Failed to update employee");
          setSubmitting(false);
          return;
        }
      } else {
        // POST
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            password,
            role,
            assignedClientIds: selectedClientIds,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || "Failed to create employee");
          setSubmitting(false);
          return;
        }
      }

      handleCloseModal();
      fetchEmployees();
    } catch (err: any) {
      setModalError(err.message || "Failed to save employee");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    try {
      const res = await fetch(`/api/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !emp.isActive }),
      });
      if (res.ok) {
        fetchEmployees();
      }
    } catch (err) {
      console.error("Failed to toggle employee active status:", err);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!empToDelete) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/employees/${empToDelete.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete employee");
        setDeleting(false);
        return;
      }

      setEmpToDelete(null);
      fetchEmployees();
    } catch (err: any) {
      alert(err.message || "Error deleting employee");
    } finally {
      setDeleting(false);
    }
  };

  const toggleClientSelection = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    );
  };

  // Filtered list
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === "ALL" || emp.role === filterRole;
    const matchesStatus =
      filterStatus === "ALL" ||
      (filterStatus === "ACTIVE" && emp.isActive) ||
      (filterStatus === "INACTIVE" && !emp.isActive);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalTrackedOverall = employees.reduce(
    (acc, curr) => acc + (curr.totalTrackedSeconds || 0),
    0
  );
  const activeTimersCount = employees.filter((e) => e.activeTimer).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="page-heading text-text-primary flex items-center gap-2">
            <UserCheck className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            <span>Team & Employees</span>
          </h1>
          <p className="helper-text text-text-secondary mt-1">
            {isAdmin
              ? "Manage agency team members, assign client portfolio access, and monitor tracked time."
              : "Agency team directory and colleague client assignments."}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text shadow-sm transition cursor-pointer self-start sm:self-auto shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add Team Member</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 helper-text text-error font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-card bg-white border border-border p-3.5 sm:p-5 shadow-sm space-y-1">
          <span className="helper-text text-text-secondary font-medium">Total Team Members</span>
          <div className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
            {employees.length}
          </div>
          <span className="helper-text text-text-secondary">
            {employees.filter((e) => e.role === "ADMIN").length} Admins •{" "}
            {employees.filter((e) => e.role === "EMPLOYEE").length} Staff
          </span>
        </div>

        <div className="rounded-card bg-white border border-border p-3.5 sm:p-5 shadow-sm space-y-1">
          <span className="helper-text text-text-secondary font-medium">Currently Active</span>
          <div className="text-xl sm:text-2xl font-bold text-success flex items-center gap-2">
            <span>{activeTimersCount}</span>
            {activeTimersCount > 0 && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
              </span>
            )}
          </div>
          <span className="helper-text text-text-secondary">Running timers right now</span>
        </div>

        <div className="rounded-card bg-white border border-border p-3.5 sm:p-5 shadow-sm space-y-1">
          <span className="helper-text text-text-secondary font-medium">Agency Time Tracked</span>
          <div className="text-xl sm:text-2xl font-bold text-text-primary font-mono tracking-tight">
            {(totalTrackedOverall / 3600).toFixed(1)} hrs
          </div>
          <span className="helper-text text-text-secondary">Lifetime logged work</span>
        </div>

        <div className="rounded-card bg-white border border-border p-3.5 sm:p-5 shadow-sm space-y-1">
          <span className="helper-text text-text-secondary font-medium">Client Portfolios</span>
          <div className="text-xl sm:text-2xl font-bold text-primary tracking-tight">
            {clients.length}
          </div>
          <span className="helper-text text-text-secondary">Available for staff assignment</span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="rounded-card bg-white border border-border p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-border rounded-xl text-xs text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <div className="flex items-center gap-1 bg-slate-50 border border-border p-1 rounded-xl">
            {(["ALL", "EMPLOYEE", "ADMIN"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filterRole === r
                    ? "bg-white text-text-primary shadow-xs border border-border"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {r === "ALL" ? "All Roles" : r === "ADMIN" ? "Admins" : "Staff"}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-50 border border-border p-1 rounded-xl">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filterStatus === s
                    ? "bg-white text-text-primary shadow-xs border border-border"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {s === "ALL" ? "All Status" : s === "ACTIVE" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Employees Grid */}
      {loading ? (
        <div className="p-12 text-center helper-text text-text-secondary">Loading team members...</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="p-12 text-center bg-white border border-border rounded-card body-text text-text-secondary shadow-sm">
          No team members match your search or filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredEmployees.map((emp) => {
            const initials = getInitials(emp.name);

            return (
              <div
                key={emp.id}
                className="rounded-card bg-white border border-border p-4 sm:p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3.5">
                  {/* Top: Avatar, Name, Role */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-primary-subtle text-primary border border-blue-200 flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
                        {emp.avatarUrl ? (
                          <img src={emp.avatarUrl} alt={emp.displayName || emp.name} className="w-full h-full object-cover" />
                        ) : (
                          initials
                        )}
                      </div>
                      <div>
                        <h3 className="card-title text-text-primary flex items-center gap-1.5">
                          <span>{emp.displayName || emp.name}</span>
                          {emp.id === user?.id && (
                            <span className="text-[9px] sm:text-[10px] bg-slate-100 text-text-secondary px-1.5 py-0.5 rounded border border-border">
                              You
                            </span>
                          )}
                        </h3>
                        {emp.title && (
                          <p className="text-[11px] text-slate-500 font-medium truncate max-w-[180px]">
                            {emp.title}
                          </p>
                        )}
                        <p className="helper-text text-text-secondary flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[150px] sm:max-w-[180px]">{emp.email}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`label-text font-semibold px-2 py-0.5 rounded-full border ${
                          emp.role === "ADMIN"
                            ? "bg-blue-50 text-primary border-blue-200"
                            : "bg-slate-100 text-slate-700 border-border"
                        }`}
                      >
                        {emp.role === "ADMIN" ? "Admin" : "Staff"}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          emp.isActive
                            ? "bg-green-50 text-success border-green-200"
                            : "bg-slate-100 text-slate-500 border-border"
                        }`}
                      >
                        {emp.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  {/* Running Stopwatch Indicator */}
                  {emp.activeTimer ? (
                    <div className="p-3 rounded-xl bg-green-50 border border-green-200 flex items-center justify-between text-xs text-green-900">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                        </span>
                        <span className="font-semibold text-success">Tracking:</span>
                        <span className="font-medium truncate max-w-[150px]">
                          {emp.activeTimer.project?.name || "Active Session"}
                        </span>
                      </div>
                      <Clock className="w-3.5 h-3.5 text-success shrink-0" />
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-border flex items-center justify-between text-xs text-text-secondary">
                      <span>Total Time Logged:</span>
                      <span className="font-mono font-semibold text-text-primary">
                        {(emp.totalTrackedSeconds / 3600).toFixed(1)} hrs
                      </span>
                    </div>
                  )}

                  {/* Assigned Clients */}
                  <div className="space-y-1.5 pt-1">
                    <span className="label-text uppercase font-semibold text-text-secondary block">
                      Assigned Clients ({emp.assignedClients.length})
                    </span>
                    {emp.assignedClients.length === 0 ? (
                      <span className="helper-text text-slate-400 italic block">
                        No clients currently assigned.
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {emp.assignedClients.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-text-primary border border-border text-xs"
                          >
                            <Building className="w-3 h-3 text-primary" />
                            <span>{c.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  {isAdmin ? (
                    <>
                      <button
                        onClick={() => handleToggleActive(emp)}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                          emp.isActive
                            ? "bg-slate-50 text-text-secondary hover:text-text-primary border-border"
                            : "bg-green-50 text-success border-green-200 hover:bg-green-100"
                        }`}
                      >
                        {emp.isActive ? "Deactivate" : "Activate"}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-text-primary border border-border text-xs font-medium transition cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3 text-primary" />
                          <span>Edit & Assign</span>
                        </button>

                        {emp.id !== user?.id && (
                          <button
                            onClick={() => setEmpToDelete(emp)}
                            className="p-1.5 rounded-lg text-text-secondary hover:text-error hover:bg-red-50 transition cursor-pointer"
                            title="Delete team member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="helper-text text-text-secondary">
                      Member since {new Date(emp.createdAt).toLocaleDateString([], { month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) handleCloseModal();
          }}
        >
          <div
            className="w-full max-w-lg bg-white border border-border rounded-card p-6 sm:p-8 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="section-heading text-text-primary flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-primary" />
                <span>{editingEmp ? "Edit Team Member" : "Add New Team Member"}</span>
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-text-secondary hover:text-text-primary p-1 rounded-lg transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 helper-text text-error font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-error shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Work Email Address *
                </label>
                <input
                  type="email"
                  required
                  disabled={!!editingEmp}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sarah@agency.com"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-slate-50 disabled:text-text-secondary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  {editingEmp ? "Reset Password (Leave blank to keep unchanged)" : "Temporary Password *"}
                </label>
                <input
                  type="password"
                  required={!editingEmp}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Agency Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "ADMIN" | "EMPLOYEE")}
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="EMPLOYEE">Staff Employee — Access limited to assigned client portfolio</option>
                  <option value="ADMIN">Agency Admin — Full executive access across all modules</option>
                </select>
              </div>

              {/* Client Portfolio Assignment */}
              <div className="pt-2">
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Assign Client Portfolio Access
                </label>
                <p className="helper-text text-text-secondary mb-2">
                  Staff employees will only be able to view projects and log working hours for assigned clients.
                </p>

                {clients.length === 0 ? (
                  <p className="helper-text text-slate-400 italic">No clients created yet.</p>
                ) : (
                  <div className="max-h-44 overflow-y-auto border border-border rounded-xl p-2.5 space-y-1.5 bg-slate-50">
                    {clients.map((c) => {
                      const isChecked = selectedClientIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white transition cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleClientSelection(c.id)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="text-xs">
                            <span className="font-semibold text-text-primary">{c.name}</span>
                            {c.company && (
                              <span className="text-text-secondary ml-1.5">({c.company})</span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover btn-text text-white shadow-sm cursor-pointer disabled:opacity-50 transition"
                >
                  {submitting ? "Saving..." : editingEmp ? "Save Changes" : "Create Team Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {empToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setEmpToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md bg-white border border-border rounded-card p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="section-heading text-text-primary flex items-center gap-2 text-error">
              <Trash2 className="w-5 h-5 text-error" />
              <span>Remove Team Member?</span>
            </h3>
            <p className="body-text text-text-secondary">
              Are you sure you want to remove <strong>{empToDelete.name}</strong> ({empToDelete.email}) from your agency? Their client assignments and login access will be revoked.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setEmpToDelete(null)}
                className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteEmployee}
                className="px-4 py-2 rounded-xl bg-error hover:bg-red-700 btn-text text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {deleting ? "Removing..." : "Confirm Removal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
