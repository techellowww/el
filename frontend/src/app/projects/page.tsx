'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuthStore, useTimerStore } from '@/lib/store';
import { requestScreenStream, isScreenStreamActive, captureAndUploadActivityScreenshot } from '@/lib/screenshotCapture';
import {
  FolderKanban,
  Plus,
  CheckCircle2,
  Clock,
  Users,
  Search,
  Calendar,
  AlertCircle,
  X,
  Edit2,
  Trash2,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Shield,
  Play,
  Square,
  Moon,
} from 'lucide-react';
import { OutsideHoursDurationModal } from '@/components/OutsideHoursDurationModal';

interface ProjectItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'COMPLETED';
  startDate: string | null;
  closureDate: string | null;
  createdAt: string;
  creator?: { name: string; employeeId?: string };
  assignments?: Array<{ user: { id: string; name: string; employeeId: string; department: string | null } }>;
  totalTrackedSeconds?: number;
}

interface EmployeeOption {
  id: string;
  name: string;
  employeeId: string;
  department: string | null;
}

const QUICK_PROJECT_REASONS = [
  'Set to Inactive',
  'Project On Hold',
  'Duplicate Project',
  'Administrative Cleanup',
  'Project Cancelled',
];

export default function ProjectsPage() {
  const { user } = useAuthStore();
  const { activeTimer, schedule, isOutsideHours, startTimer, stopTimer, screenshotSetting } = useTimerStore();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [outsideModalProject, setOutsideModalProject] = useState<ProjectItem | null>(null);

  // Modal State: Create / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAssignedIds, setFormAssignedIds] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete & Deactivate Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectItem | null>(null);
  const [deleteMode, setDeleteMode] = useState<'permanent' | 'deactivate'>('permanent');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmCode, setDeleteConfirmCode] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleConfirmOutsideStart = async (durationMinutes: number, notes?: string) => {
    if (!outsideModalProject) return;

    if (screenshotSetting?.enabled && !isScreenStreamActive()) {
      const stream = await requestScreenStream();
      if (!stream) {
        showToast('Screen sharing is required to track overtime. Please select "Entire Screen".', 'error');
        throw new Error('Screen sharing is required to track overtime. Please select "Entire Screen".');
      }
    }

    const ok = await startTimer(outsideModalProject.id, notes, durationMinutes);
    if (ok) {
      showToast(`Started timer on ${outsideModalProject.code} (${durationMinutes}m limit)`, 'success');
      setOutsideModalProject(null);

      // Immediately take live milestone 0 screenshot of workstation
      const currentActive = useTimerStore.getState().activeTimer;
      if (currentActive && user && isScreenStreamActive()) {
        const intervalMinutes = Math.max(1, screenshotSetting?.intervalMinutes || 10);
        captureAndUploadActivityScreenshot({
          userId: user.id,
          userName: user.name,
          employeeId: user.employeeId,
          timeEntryId: currentActive.id,
          projectCode: currentActive.project.code,
          projectName: currentActive.project.name,
          elapsedSeconds: 0,
          intervalMinutes,
          intervalIndex: 0,
        }).catch(console.error);
      }
    } else {
      showToast('Failed to start timer on project', 'error');
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    loadProjects();
    if (isAdmin) {
      loadEmployees();
    }
  }, [isAdmin, statusFilter]);

  const loadProjects = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const url = statusFilter === 'ALL' ? '/api/projects' : `/api/projects?status=${statusFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/admin/employees?status=active');
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error('Failed to load employee list:', err);
    }
  };

  const openCreateModal = () => {
    setEditingProject(null);
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormAssignedIds([]);
    setFormStatus('ACTIVE');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (project: ProjectItem) => {
    setEditingProject(project);
    setFormCode(project.code);
    setFormName(project.name);
    setFormDescription(project.description || '');
    setFormAssignedIds(project.assignments?.map((a) => a.user.id) || []);
    setFormStatus(project.status === 'COMPLETED' ? 'INACTIVE' : project.status);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (editingProject) {
        // PATCH
        const res = await fetch(`/api/projects/${editingProject.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            description: formDescription,
            status: formStatus,
            assignedUserIds: formAssignedIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || 'Failed to update project');
          setIsSubmitting(false);
          return;
        }
      } else {
        // POST
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formCode,
            name: formName,
            description: formDescription,
            assignedUserIds: formAssignedIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || 'Failed to create project');
          setIsSubmitting(false);
          return;
        }
      }

      setModalOpen(false);
      loadProjects();
    } catch {
      setFormError('Network request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAssignee = (empId: string) => {
    setFormAssignedIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const isAllEmployeesSelected = employees.length > 0 && formAssignedIds.length === employees.length;

  const handleSelectAllEmployees = () => {
    if (isAllEmployeesSelected) {
      setFormAssignedIds([]);
    } else {
      setFormAssignedIds(employees.map((e) => e.id));
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const openDeleteModal = (project: ProjectItem, mode: 'permanent' | 'deactivate' = 'permanent') => {
    setProjectToDelete(project);
    setDeleteMode(mode);
    setDeleteReason('');
    setDeleteConfirmCode('');
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const handleToggleActive = async (project: ProjectItem, makeActive: boolean) => {
    const targetStatus = makeActive ? 'ACTIVE' : 'INACTIVE';
    // 1. Optimistic update to guarantee immediate feedback without any layout flicker
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? {
              ...p,
              status: targetStatus,
              closureDate: makeActive ? null : new Date().toISOString(),
            }
          : p
      )
    );

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `Project ${project.code} ${makeActive ? 'activated' : 'deactivated'} successfully.`,
          'success'
        );
        // Silent reload in background to ensure data parity without flashing loading UI
        loadProjects(true);
      } else {
        // Rollback on failure
        loadProjects(true);
        showToast(data.error || 'Failed to update project status.', 'error');
      }
    } catch {
      loadProjects(true);
      showToast('Network error while updating project status.', 'error');
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToDelete) return;

    if (deleteMode === 'permanent') {
      if (deleteConfirmCode.trim().toUpperCase() !== projectToDelete.code.toUpperCase()) {
        setDeleteError(`Please type "${projectToDelete.code}" to confirm permanent deletion.`);
        return;
      }
    }

    const reason =
      deleteReason.trim() ||
      (deleteMode === 'permanent'
        ? 'Admin permanently deleted project'
        : 'Admin deactivated project');

    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (deleteMode === 'deactivate') {
        const res = await fetch(`/api/projects/${projectToDelete.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'INACTIVE',
            reason,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setDeleteError(data.error || 'Failed to deactivate project');
          setIsDeleting(false);
          return;
        }

        setDeleteModalOpen(false);
        showToast(`Project ${projectToDelete.code} set to Inactive.`, 'success');
        loadProjects();
        return;
      }

      const queryParams = new URLSearchParams({
        reason,
        permanent: 'true',
      });

      const res = await fetch(`/api/projects/${projectToDelete.id}?${queryParams.toString()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          permanent: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to complete project request');
        setIsDeleting(false);
        return;
      }

      setDeleteModalOpen(false);
      showToast(
        data.message || `Project ${projectToDelete.code} permanently deleted.`,
        'success'
      );
      loadProjects();
    } catch {
      setDeleteError('Network request failed. Please check connection.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  // Calculate quick summary metrics
  const totalProjectsCount = projects.length;
  const activeProjectsCount = projects.filter((p) => p.status === 'ACTIVE').length;
  const inactiveProjectsCount = projects.filter((p) => p.status !== 'ACTIVE').length;
  const totalTrackedHours = (
    projects.reduce((acc, p) => acc + (p.totalTrackedSeconds || 0), 0) / 3600
  ).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Page Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <FolderKanban className="w-6 h-6 text-blue-500" />
            <span>{isAdmin ? 'Project Management' : 'Assigned Projects'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {isAdmin
              ? 'Organize projects, assign team members, and toggle active tracking permissions.'
              : 'Enterprise projects you are currently authorized to log time against.'}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/25 transition cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        )}
      </div>

      {/* Quick Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-blue-600/10 border-blue-500/40 shadow-sm shadow-blue-500/10'
              : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Projects</span>
            <FolderKanban className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono">{totalProjectsCount}</div>
        </button>

        <button
          onClick={() => setStatusFilter('ACTIVE')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'ACTIVE'
              ? 'bg-emerald-600/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
              : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
            <span>Active</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <div className="text-2xl font-bold text-emerald-300 mt-2 font-mono">{activeProjectsCount}</div>
        </button>

        <button
          onClick={() => setStatusFilter('INACTIVE')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'INACTIVE'
              ? 'bg-slate-800/60 border-slate-600/50 shadow-sm'
              : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Inactive</span>
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
          </div>
          <div className="text-2xl font-bold text-slate-300 mt-2 font-mono">{inactiveProjectsCount}</div>
        </button>

        <div className="p-4 rounded-2xl border bg-slate-900/60 border-slate-800/80 text-left">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Logged</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono">
            {totalTrackedHours} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
        </div>
      </div>

      {/* Search and Status Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-2 sm:p-2.5 rounded-2xl border border-slate-800/80">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search projects by code or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`py-1.5 px-3.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                statusFilter === s
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800/80 hover:bg-slate-800/50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Project Cards Grid with Rock-Solid Dimensions */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-500 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs">Loading projects directory...</span>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-16 text-center text-slate-400 bg-slate-900/30 rounded-2xl border border-slate-800/80 p-8">
          <FolderKanban className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-white">No projects found</p>
          <p className="text-xs text-slate-500 mt-1">Try adjusting your search query or filter options.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
          {filteredProjects.map((p) => {
            const isActive = p.status === 'ACTIVE';
            return (
              <div
                key={p.id}
                className={`p-5 rounded-2xl bg-slate-900/80 border flex flex-col justify-between hover:border-slate-700/80 transition-all duration-150 min-h-[300px] ${
                  isActive
                    ? 'border-slate-800/90 shadow-sm'
                    : 'border-slate-800/50 bg-slate-900/50 opacity-90 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-500/20">
                      {p.code}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800/80 text-slate-400 border border-slate-700/60'
                      }`}
                    >
                      {isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white tracking-tight line-clamp-1">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2 h-8 leading-relaxed">
                    {p.description || 'No description provided for this project.'}
                  </p>
                </div>

                {/* Fixed Metadata Rows - Equal heights in both Active and Inactive states */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 h-5">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" /> Created
                    </span>
                    <span className="font-medium text-slate-300">{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 h-5">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" /> Status Detail
                    </span>
                    <span
                      className={`font-medium truncate max-w-[170px] ${
                        isActive ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {isActive
                        ? 'Tracking Enabled'
                        : p.closureDate
                        ? `Inactive (${new Date(p.closureDate).toLocaleDateString()})`
                        : 'Inactive'}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center justify-between text-xs text-slate-400 h-5">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-500" /> Assigned
                      </span>
                      <span className="font-medium text-slate-300">{p.assignments?.length || 0} members</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-400 h-5">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" /> {isAdmin ? 'Total Tracked' : 'My Tracked Time'}
                    </span>
                    <span className="font-mono text-white font-semibold">
                      {((p.totalTrackedSeconds || 0) / 3600).toFixed(1)} hrs
                    </span>
                  </div>

                  {isAdmin ? (
                    <div className="mt-3.5 pt-3 border-t border-slate-800/60 flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(p)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition flex items-center justify-center gap-1.5 border border-slate-700/50 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Manage</span>
                      </button>

                      {isActive ? (
                        <button
                          onClick={() => handleToggleActive(p, false)}
                          className="w-24 py-1.5 px-2.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/50 text-xs font-semibold text-amber-300 transition text-center shrink-0 cursor-pointer"
                          title="Set Inactive"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleActive(p, true)}
                          className="w-24 py-1.5 px-2.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/50 text-xs font-semibold text-emerald-300 transition flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                          title="Set Active"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Activate</span>
                        </button>
                      )}

                      <button
                        onClick={() => openDeleteModal(p, 'permanent')}
                        className="py-1.5 px-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-xs font-semibold text-red-300 hover:text-red-100 transition flex items-center justify-center gap-1.5 shadow-sm shadow-red-950/50 cursor-pointer shrink-0"
                        title="Delete Project Permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        <span>Delete</span>
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3.5 pt-3 border-t border-slate-800/60">
                      {isActive ? (
                        activeTimer?.projectId === p.id ? (
                          <div className="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-xl bg-blue-950/60 border border-blue-500/30">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                              Tracking Live
                            </span>
                            <button
                              onClick={() => stopTimer()}
                              className="py-1 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition flex items-center gap-1 cursor-pointer shadow-sm shadow-red-950/50"
                            >
                              <Square className="w-3 h-3 fill-white" />
                              <span>Stop</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={async () => {
                              if (isOutsideHours) {
                                setOutsideModalProject(p);
                                return;
                              }

                              if (screenshotSetting?.enabled && !isScreenStreamActive()) {
                                const stream = await requestScreenStream();
                                if (!stream) {
                                  showToast('Screen sharing is required to track time. Please select "Entire Screen".', 'error');
                                  return;
                                }
                              }

                              const ok = await startTimer(p.id);
                              if (ok) {
                                showToast(`Started timer on ${p.code} (${p.name})`, 'success');

                                // Immediately take live milestone 0 screenshot of workstation
                                const currentActive = useTimerStore.getState().activeTimer;
                                if (currentActive && user && isScreenStreamActive()) {
                                  const intervalMinutes = Math.max(1, screenshotSetting?.intervalMinutes || 10);
                                  captureAndUploadActivityScreenshot({
                                    userId: user.id,
                                    userName: user.name,
                                    employeeId: user.employeeId,
                                    timeEntryId: currentActive.id,
                                    projectCode: currentActive.project.code,
                                    projectName: currentActive.project.name,
                                    elapsedSeconds: 0,
                                    intervalMinutes,
                                    intervalIndex: 0,
                                  }).catch(console.error);
                                }
                              } else {
                                showToast('Failed to start timer on project', 'error');
                              }
                            }}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-semibold text-white transition flex items-center justify-center gap-2 shadow-sm cursor-pointer ${
                              isOutsideHours
                                ? 'bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 shadow-amber-950/40'
                                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                            }`}
                          >
                            {isOutsideHours ? (
                              <>
                                <Moon className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
                                <span>Start Overtime Session</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-white" />
                                <span>Select & Start Timer</span>
                              </>
                            )}
                          </button>
                        )
                      ) : (
                        <div className="w-full py-2 px-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-500 font-medium">
                          Inactive Project — Tracking Disabled
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

        {/* Modal for Create/Edit Project */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <h3 className="text-lg font-bold text-white">
                  {editingProject ? `Edit Project: ${editingProject.code}` : 'Create New Project'}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800/60 flex items-center gap-2 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1">
                    Project Code (Unique Identifier)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingProject}
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PRJ-MOBILE-01"
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Mobile API Integration"
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Details about scope and deliverables..."
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                  />
                </div>

                {editingProject && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1">
                      Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                      className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                      Assigned Employees ({formAssignedIds.length} / {employees.length} selected)
                    </label>
                    {employees.length > 0 && (
                      <button
                        type="button"
                        id="btn-select-all-employees"
                        data-testid="btn-select-all-employees"
                        onClick={handleSelectAllEmployees}
                        className="text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-lg border border-blue-500/30 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                            isAllEmployeesSelected
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'border-slate-600'
                          }`}
                        >
                          {isAllEmployeesSelected ? '✓' : ''}
                        </span>
                        <span>{isAllEmployeesSelected ? 'Deselect All' : 'Select All'}</span>
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800">
                    {employees.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-500">
                        No active employees found.
                      </div>
                    ) : (
                      employees.map((emp) => {
                        const isSelected = formAssignedIds.includes(emp.id);
                        return (
                          <div
                            key={emp.id}
                            onClick={() => toggleAssignee(emp.id)}
                            className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition ${
                              isSelected
                                ? 'bg-blue-600/20 border border-blue-500/40 text-blue-200'
                                : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            <div>
                              <span className="font-semibold text-white">{emp.name}</span>
                              <span className="block text-[10px] text-slate-400 font-mono">
                                {emp.employeeId} • {emp.department || 'General'}
                              </span>
                            </div>
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'border-slate-700'
                              }`}
                            >
                              {isSelected ? '✓' : ''}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  {editingProject ? (
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpen(false);
                        openDeleteModal(editingProject, 'permanent');
                      }}
                      className="py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete Project</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-600/30 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving...' : editingProject ? 'Save Changes' : 'Create Project'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Delete & Deactivate Project */}
        {deleteModalOpen && projectToDelete && (
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
                      {deleteMode === 'permanent' ? 'Delete Project' : 'Deactivate Project'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Target:{' '}
                      <span className="text-white font-medium">{projectToDelete.name}</span>{' '}
                      <span className="font-mono text-slate-300">({projectToDelete.code})</span>
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
                  <span>Deactivate (Set Inactive)</span>
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
                    This will permanently delete project <strong>{projectToDelete.name}</strong> ({projectToDelete.code}) from the database, along with all recorded employee time logs
                    {projectToDelete.totalTrackedSeconds !== undefined && (
                      <> (<strong>{(projectToDelete.totalTrackedSeconds / 3600).toFixed(1)} hrs</strong>)</>
                    )}
                    , member assignments ({projectToDelete.assignments?.length || 0} members), and correction requests.
                  </p>
                </div>
              ) : (
                <div className="mb-4 p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-300/90 space-y-1.5">
                  <p className="font-semibold text-amber-200 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                    Project Deactivation (Set Inactive)
                  </p>
                  <p className="leading-relaxed">
                    This marks the project as Inactive and stops any running timers immediately. Employees cannot track time on an inactive project. Historical time logs and project assignments are preserved.
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
                    {QUICK_PROJECT_REASONS.map((reason) => (
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
                    placeholder="Specify the reason for deleting or closing this project..."
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                  />
                </div>

                {/* Confirmation input for permanent delete */}
                {deleteMode === 'permanent' && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Confirm by typing the Project Code{' '}
                      <span className="font-mono font-bold text-red-400 bg-red-950/40 px-1.5 py-0.5 rounded border border-red-800/40">
                        {projectToDelete.code}
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={`Type "${projectToDelete.code}" to confirm`}
                      value={deleteConfirmCode}
                      onChange={(e) => setDeleteConfirmCode(e.target.value)}
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
                        deleteConfirmCode.trim().toUpperCase() !== projectToDelete.code.toUpperCase())
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
                        <span>Permanently Delete Project</span>
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

        {/* Outside Hours Duration Limit Modal */}
        <OutsideHoursDurationModal
          isOpen={!!outsideModalProject}
          onClose={() => setOutsideModalProject(null)}
          onConfirm={handleConfirmOutsideStart}
          projectName={outsideModalProject?.name}
          projectCode={outsideModalProject?.code}
          schedule={schedule}
        />

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
  );
}
