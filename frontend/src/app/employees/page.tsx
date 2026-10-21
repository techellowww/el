'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuthStore } from '@/lib/store';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Search,
  Mail,
  Phone,
  Clock,
  Shield,
  X,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface EmployeeItem {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  role: 'ADMIN' | 'EMPLOYEE';
  department: string | null;
  phone: string | null;
  isActive: boolean;
  totalTrackedSeconds: number;
  assignedProjectsCount: number;
  pendingCorrectionsCount: number;
  activeTimer: {
    id: string;
    startTime: string;
    project: { code: string; name: string };
  } | null;
}

const QUICK_REASONS = [
  'Resigned / Left Company',
  'Contract Completed',
  'Duplicate Account',
  'Administrative Cleanup',
  'Test Account Removal',
];

export default function EmployeesPage() {
  const { user } = useAuthStore();
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State: Create / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'EMPLOYEE' | 'ADMIN'>('EMPLOYEE');
  const [formDepartment, setFormDepartment] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete & Deactivate Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [empToDelete, setEmpToDelete] = useState<EmployeeItem | null>(null);
  const [deleteMode, setDeleteMode] = useState<'permanent' | 'deactivate'>('permanent');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadEmployees();
  }, [statusFilter]);

  const loadEmployees = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const url = statusFilter === 'all' ? '/api/admin/employees' : `/api/admin/employees?status=${statusFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingEmp(null);
    setFormName('');
    setFormEmail('');
    setFormEmployeeId('');
    setFormPassword('');
    setFormRole('EMPLOYEE');
    setFormDepartment('Engineering');
    setFormPhone('');
    setFormIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (emp: EmployeeItem) => {
    setEditingEmp(emp);
    setFormName(emp.name);
    setFormEmail(emp.email);
    setFormEmployeeId(emp.employeeId);
    setFormPassword('');
    setFormRole(emp.role);
    setFormDepartment(emp.department || '');
    setFormPhone(emp.phone || '');
    setFormIsActive(emp.isActive);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate password length >= 6 and prevent default saving
    if (!editingEmp) {
      if (!formPassword || formPassword.trim().length < 6) {
        const errorMsg = 'Password is required and must be at least 6 characters long.';
        setFormError(errorMsg);
        showToast(errorMsg, 'error');
        alert(errorMsg);
        return;
      }
    } else {
      if (formPassword && formPassword.trim().length < 6) {
        const errorMsg = 'Password must be at least 6 characters long.';
        setFormError(errorMsg);
        showToast(errorMsg, 'error');
        alert(errorMsg);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (editingEmp) {
        // PATCH
        const res = await fetch(`/api/admin/employees/${editingEmp.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            department: formDepartment,
            phone: formPhone,
            role: formRole,
            isActive: formIsActive,
            ...(formPassword.trim() ? { password: formPassword.trim() } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errorMsg = data.error || 'Failed to update employee';
          setFormError(errorMsg);
          showToast(errorMsg, 'error');
          alert(errorMsg);
          setIsSubmitting(false);
          return;
        }
      } else {
        // POST
        const res = await fetch('/api/admin/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            email: formEmail,
            employeeId: formEmployeeId,
            password: formPassword.trim(),
            role: formRole,
            department: formDepartment,
            phone: formPhone,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errorMsg = data.error || 'Failed to create employee';
          setFormError(errorMsg);
          showToast(errorMsg, 'error');
          alert(errorMsg);
          setIsSubmitting(false);
          return;
        }
      }

      setModalOpen(false);
      loadEmployees();
      showToast(editingEmp ? 'Employee updated successfully' : 'Employee created successfully', 'success');
    } catch {
      const errorMsg = 'Network request failed';
      setFormError(errorMsg);
      showToast(errorMsg, 'error');
      alert(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const openDeleteModal = (emp: EmployeeItem, mode: 'permanent' | 'deactivate' = 'permanent') => {
    setEmpToDelete(emp);
    setDeleteMode(mode);
    setDeleteReason('');
    setDeleteConfirmId('');
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const handleReactivate = async (emp: EmployeeItem) => {
    // Optimistic update
    setEmployees((prev) =>
      prev.map((e) => (e.id === emp.id ? { ...e, isActive: true } : e))
    );

    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Employee ${emp.name} (${emp.employeeId}) reactivated successfully.`, 'success');
        loadEmployees(true);
      } else {
        loadEmployees(true);
        showToast(data.error || 'Failed to reactivate account', 'error');
      }
    } catch {
      loadEmployees(true);
      showToast('Network error while reactivating employee', 'error');
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empToDelete) return;

    if (deleteMode === 'permanent') {
      if (deleteConfirmId.trim().toUpperCase() !== empToDelete.employeeId.toUpperCase()) {
        setDeleteError(`Please type "${empToDelete.employeeId}" to confirm permanent deletion.`);
        return;
      }
    }

    const reason =
      deleteReason.trim() ||
      (deleteMode === 'permanent'
        ? 'Admin requested permanent deletion'
        : 'Admin deactivated employee account');

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const isPermanent = deleteMode === 'permanent';
      const queryParams = new URLSearchParams({
        reason,
        permanent: isPermanent ? 'true' : 'false',
      });

      const res = await fetch(`/api/admin/employees/${empToDelete.id}?${queryParams.toString()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          permanent: isPermanent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to complete deletion request');
        setIsDeleting(false);
        return;
      }

      setDeleteModalOpen(false);
      showToast(
        data.message ||
          (isPermanent
            ? `Employee ${empToDelete.name} (${empToDelete.employeeId}) permanently deleted.`
            : `Employee ${empToDelete.name} deactivated successfully.`),
        'success'
      );
      loadEmployees();
    } catch {
      setDeleteError('Network request failed. Please check connection.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredEmployees = employees.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Users className="w-6 h-6 text-blue-500" />
              Employee Directory & Permissions
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Create accounts, manage departments, grant administrative roles, and inspect active timer statuses.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-600/30 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Add Employee Account
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by name, email, or employee ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium uppercase tracking-wider transition ${
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

        {/* Employees Cards / Grid */}
        {isLoading ? (
          <div className="py-16 text-center text-slate-500">Loading employees...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
            No employees found matching the filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((emp) => (
              <div
                key={emp.id}
                className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                      {emp.employeeId}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          emp.role === 'ADMIN'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {emp.role}
                      </span>
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          emp.isActive ? 'bg-emerald-400' : 'bg-red-500'
                        }`}
                        title={emp.isActive ? 'Active' : 'Deactivated'}
                      />
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white">{emp.name}</h3>
                  <p className="text-xs text-blue-400 font-medium mt-0.5">
                    {emp.department || 'General Department'}
                  </p>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                    {emp.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{emp.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2">
                  {emp.activeTimer ? (
                    <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-between text-xs text-emerald-300">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        Tracking: {emp.activeTimer.project.code}
                      </span>
                      <span className="font-mono text-[10px]">Active Now</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> No timer currently active
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Lifetime Tracked:</span>
                    <span className="font-mono text-white font-medium">
                      {(emp.totalTrackedSeconds / 3600).toFixed(1)} hrs
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => openEditModal(emp)}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center justify-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Edit</span>
                    </button>

                    {emp.id !== user?.id ? (
                      <>
                        {emp.isActive ? (
                          <button
                            onClick={() => openDeleteModal(emp, 'deactivate')}
                            className="py-1.5 px-3 rounded-lg bg-amber-950/30 hover:bg-amber-900/50 border border-amber-800/40 text-xs font-medium text-amber-300 transition"
                            title="Deactivate employee account"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(emp)}
                            className="py-1.5 px-3 rounded-lg bg-emerald-950/30 hover:bg-emerald-900/50 border border-emerald-800/40 text-xs font-medium text-emerald-300 transition flex items-center justify-center gap-1"
                            title="Reactivate employee account"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reactivate</span>
                          </button>
                        )}

                        <button
                          onClick={() => openDeleteModal(emp, 'permanent')}
                          className="py-1.5 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-xs font-semibold text-red-300 hover:text-red-100 transition flex items-center justify-center gap-1.5 shadow-sm shadow-red-950/50"
                          title="Delete employee permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          <span>Delete</span>
                        </button>
                      </>
                    ) : (
                      <span className="py-1 px-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-[11px] font-medium text-slate-400">
                        You (Self)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Create/Edit Employee */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <h3 className="text-base font-bold text-white">
                  {editingEmp ? `Edit Employee: ${editingEmp.employeeId}` : 'Add New Employee'}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Robert Oppenheimer"
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Employee ID (Unique)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingEmp}
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value.toUpperCase())}
                    placeholder="e.g. EMP-105"
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    disabled={!!editingEmp}
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="robert@elapp.local"
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {editingEmp ? 'Reset Password (leave empty to keep current)' : 'Account Password (min. 6 characters)'}
                  </label>
                  <input
                    type="password"
                    required={!editingEmp}
                    minLength={6}
                    placeholder={editingEmp ? 'Leave empty or min. 6 characters' : 'Enter password (min. 6 characters)'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  />
                  {formPassword && formPassword.trim().length > 0 && formPassword.trim().length < 6 && (
                    <p className="mt-1 text-[11px] text-red-400 font-medium">
                      Password must be at least 6 characters long.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Role
                    </label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value as any)}
                      className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                    >
                      <option value="EMPLOYEE">EMPLOYEE</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={formDepartment}
                      onChange={(e) => setFormDepartment(e.target.value)}
                      placeholder="Engineering, Design..."
                      className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Contact (Optional)
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+1 555-0199"
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                {editingEmp && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="isActiveCheckbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
                    />
                    <label htmlFor="isActiveCheckbox" className="text-xs text-slate-300 font-medium">
                      Account is Active
                    </label>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-md shadow-blue-600/30 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : editingEmp ? 'Update Account' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Delete & Deactivate Employee */}
        {deleteModalOpen && empToDelete && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2 rounded-xl ${
                      deleteMode === 'permanent'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {deleteMode === 'permanent' ? (
                      <Trash2 className="w-5 h-5 text-red-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {deleteMode === 'permanent' ? 'Delete Employee Account' : 'Deactivate Employee Account'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Target:{' '}
                      <span className="text-white font-medium">{empToDelete.name}</span>{' '}
                      <span className="font-mono text-slate-300">({empToDelete.employeeId})</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mode Toggle Tabs */}
              <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMode('permanent');
                    setDeleteError(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    deleteMode === 'permanent'
                      ? 'bg-red-600/90 text-white shadow-md shadow-red-900/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Permanent Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMode('deactivate');
                    setDeleteError(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    deleteMode === 'deactivate'
                      ? 'bg-amber-600/90 text-white shadow-md shadow-amber-900/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Deactivate (Soft Delete)</span>
                </button>
              </div>

              {/* Error banner */}
              {deleteError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{deleteError}</span>
                </div>
              )}

              {/* Notice Box */}
              {deleteMode === 'permanent' ? (
                <div className="mb-4 p-3.5 rounded-xl bg-red-950/30 border border-red-800/40 text-xs text-red-300/90 space-y-1.5">
                  <p className="font-semibold text-red-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    Irreversible Permanent Removal
                  </p>
                  <p className="leading-relaxed">
                    This will permanently delete <strong>{empToDelete.name}</strong> from the database, along with all lifetime tracked hours (<strong>{(empToDelete.totalTrackedSeconds / 3600).toFixed(1)} hrs</strong>), project assignments, correction requests, and screenshot records.
                  </p>
                  {empToDelete.activeTimer && (
                    <p className="text-amber-300 font-medium">
                      ⚠️ Note: An active timer is currently running for project {empToDelete.activeTimer.project.code} and will be stopped and removed.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mb-4 p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-300/90 space-y-1.5">
                  <p className="font-semibold text-amber-200 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                    Account Deactivation (Preserves History)
                  </p>
                  <p className="leading-relaxed">
                    This disables login access and stops any active timer immediately. Historical time entries and project logs remain intact for organizational audit trails and reporting.
                  </p>
                </div>
              )}

              <form onSubmit={handleDeleteSubmit} className="space-y-4">
                {/* Quick reason chips */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Quick Audit Reason
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setDeleteReason(reason)}
                        className={`text-[11px] py-1 px-2.5 rounded-lg border transition ${
                          deleteReason === reason
                            ? 'bg-blue-600/30 border-blue-500/60 text-blue-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason Textarea */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Audit Reason (Required for organizational compliance)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Specify the reason for deleting or deactivating this account..."
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                  />
                </div>

                {/* Confirmation input for permanent delete */}
                {deleteMode === 'permanent' && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Confirm by typing the Employee ID{' '}
                      <span className="font-mono font-bold text-red-400 bg-red-950/40 px-1.5 py-0.5 rounded border border-red-800/40">
                        {empToDelete.employeeId}
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={`Type "${empToDelete.employeeId}" to confirm`}
                      value={deleteConfirmId}
                      onChange={(e) => setDeleteConfirmId(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setDeleteModalOpen(false)}
                    className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isDeleting ||
                      (deleteMode === 'permanent' &&
                        deleteConfirmId.trim().toUpperCase() !== empToDelete.employeeId.toUpperCase())
                    }
                    className={`py-2 px-5 rounded-xl text-xs font-semibold text-white shadow-lg transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                      deleteMode === 'permanent'
                        ? 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
                        : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                    }`}
                  >
                    {isDeleting ? (
                      <span>Processing...</span>
                    ) : deleteMode === 'permanent' ? (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Permanently Delete Employee</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Confirm Deactivation</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Action Toast Notification */}
        {toast && (
          <div
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                : 'bg-red-950/90 border-red-800 text-red-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span className="text-xs font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-slate-400 hover:text-white p-0.5 rounded transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
