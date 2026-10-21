'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell, formatSecondsToTimer } from '@/components/AppShell';
import { useAuthStore } from '@/lib/store';
import {
  Clock,
  Filter,
  Download,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  FileSpreadsheet,
  X,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface TimeLog {
  id: string;
  userId: string;
  projectId: string;
  startTime: string;
  endTime: string | null;
  duration: number;
  status: string;
  classification: string;
  isOutsideHours: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  notes: string | null;
  source: string;
  user: { id: string; name: string; employeeId: string; department: string | null };
  project: { id: string; code: string; name: string };
  corrections?: Array<{ id: string; status: string; reason: string }>;
}

function TimeLogsContent() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const initialOutsideFilter = searchParams.get('filter') === 'outside';

  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [selectedUserId, setSelectedUserId] = useState('ALL');
  const [outsideFilter, setOutsideFilter] = useState<'ALL' | 'true' | 'false'>(
    initialOutsideFilter ? 'true' : 'ALL'
  );

  // Reference lists for dropdowns
  const [projectsList, setProjectsList] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [employeesList, setEmployeesList] = useState<Array<{ id: string; name: string; employeeId: string }>>([]);

  // Correction Modal State
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [selectedLogForCorrection, setSelectedLogForCorrection] = useState<TimeLog | null>(null);
  const [proposedStart, setProposedStart] = useState('');
  const [proposedEnd, setProposedEnd] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Admin Direct Edit / Manual Create Modal State
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminEditingLog, setAdminEditingLog] = useState<TimeLog | null>(null);
  const [adminTargetUserId, setAdminTargetUserId] = useState('');
  const [adminTargetProjectId, setAdminTargetProjectId] = useState('');
  const [adminStartTime, setAdminStartTime] = useState('');
  const [adminEndTime, setAdminEndTime] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [adminReason, setAdminReason] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    loadDropdowns();
  }, [user]);

  useEffect(() => {
    loadLogs();
  }, [startDate, endDate, selectedProjectId, selectedUserId, outsideFilter]);

  const loadDropdowns = async () => {
    try {
      const isAdm = user?.role === 'ADMIN';
      const [pRes, eRes] = await Promise.all([
        fetch('/api/projects'),
        isAdm ? fetch('/api/admin/employees') : Promise.resolve(null),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setProjectsList(pData.projects || []);
      }

      if (eRes && eRes.ok) {
        const eData = await eRes.json();
        setEmployeesList(eData.employees || []);
      }
    } catch (err) {
      console.error('Failed loading filters:', err);
    }
  };

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedProjectId !== 'ALL') params.append('projectId', selectedProjectId);
      if (selectedUserId !== 'ALL') params.append('userId', selectedUserId);
      if (outsideFilter !== 'ALL') params.append('isOutsideHours', outsideFilter);
      params.append('limit', '100');

      const res = await fetch(`/api/time-entries?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.entries || []);
        setTotalCount(data.totalCount || 0);
      }
    } catch (err) {
      console.error('Failed loading time entries:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to convert Date to local datetime-local input string YYYY-MM-DDTHH:mm
  const toLocalDatetimeString = (dateInput: Date | string | number): string => {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Correction Handler
  const openCorrectionModal = (log: TimeLog) => {
    setSelectedLogForCorrection(log);
    // Format to local datetime-local input string YYYY-MM-DDTHH:mm
    const sDate = new Date(log.startTime);
    const eDate = log.endTime ? new Date(log.endTime) : new Date();
    setProposedStart(toLocalDatetimeString(sDate));
    setProposedEnd(toLocalDatetimeString(eDate));
    setCorrectionReason('');
    setCorrectionError(null);
    setCorrectionModalOpen(true);
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLogForCorrection) return;
    setCorrectionError(null);

    try {
      const res = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeEntryId: selectedLogForCorrection.id,
          proposedStartTime: new Date(proposedStart).toISOString(),
          proposedEndTime: new Date(proposedEnd).toISOString(),
          reason: correctionReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCorrectionError(data.error || 'Failed to submit correction');
        return;
      }

      setCorrectionModalOpen(false);
      loadLogs();
      alert('Correction request submitted! An administrator will review your proposed changes.');
    } catch {
      setCorrectionError('Network error');
    }
  };

  // Admin Direct Edit / Create
  const openAdminEdit = (log?: TimeLog) => {
    if (log) {
      setAdminEditingLog(log);
      setAdminTargetUserId(log.userId);
      setAdminTargetProjectId(log.projectId);
      setAdminStartTime(toLocalDatetimeString(log.startTime));
      setAdminEndTime(log.endTime ? toLocalDatetimeString(log.endTime) : '');
      setAdminNotes(log.notes || '');
      setAdminReason('');
    } else {
      setAdminEditingLog(null);
      setAdminTargetUserId(employeesList[0]?.id || '');
      setAdminTargetProjectId(projectsList[0]?.id || '');
      const now = new Date();
      setAdminStartTime(toLocalDatetimeString(new Date(now.getTime() - 3600000)));
      setAdminEndTime(toLocalDatetimeString(now));
      setAdminNotes('');
      setAdminReason('');
    }
    setAdminError(null);
    setAdminModalOpen(true);
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);

    if (!adminReason || adminReason.trim().length < 5) {
      setAdminError('A mandatory reason (at least 5 characters) is required for audit logs.');
      return;
    }

    try {
      if (adminEditingLog) {
        // PATCH
        const res = await fetch(`/api/time-entries/${adminEditingLog.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startTime: new Date(adminStartTime).toISOString(),
            endTime: adminEndTime ? new Date(adminEndTime).toISOString() : null,
            projectId: adminTargetProjectId,
            notes: adminNotes,
            mandatoryReason: adminReason,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAdminError(data.error || 'Failed to update time record');
          return;
        }
      } else {
        // POST
        const res = await fetch('/api/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: adminTargetUserId,
            projectId: adminTargetProjectId,
            startTime: new Date(adminStartTime).toISOString(),
            endTime: new Date(adminEndTime).toISOString(),
            notes: adminNotes,
            mandatoryReason: adminReason,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAdminError(data.error || 'Failed to create manual entry');
          return;
        }
      }

      setAdminModalOpen(false);
      loadLogs();
    } catch {
      setAdminError('Network error');
    }
  };

  const handleExport = (format: 'csv' | 'excel') => {
    const params = new URLSearchParams();
    params.append('format', format);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (selectedProjectId !== 'ALL') params.append('projectId', selectedProjectId);
    if (selectedUserId !== 'ALL') params.append('userId', selectedUserId);
    window.open(`/api/reports/export?${params.toString()}`, '_blank');
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Clock className="w-6 h-6 text-blue-500" />
              {isAdmin ? 'All Organization Time Records' : 'My Personal Time Logs'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isAdmin
                ? 'Search, audit, and manage working hours across all company employees and projects.'
                : 'Accurate record of your working sessions, durations, and correction history.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleExport('csv')}
              className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" /> CSV
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Excel
            </button>
            {isAdmin && (
              <button
                onClick={() => openAdminEdit()}
                className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Manual Entry
              </button>
            )}
          </div>
        </div>

        {/* Outside-Hours Notice Banner */}
        {outsideFilter === 'true' && (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-center justify-between gap-3 text-amber-200 text-sm">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                Filtering by <strong>Outside-Office-Hours work</strong>. These sessions occurred outside standard office opening/closing boundaries and are highlighted for administrative review.
              </span>
            </div>
            <button
              onClick={() => setOutsideFilter('ALL')}
              className="px-2.5 py-1 text-xs rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-100 shrink-0"
            >
              Reset Filter
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filters:</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            />
          </div>

          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="py-1.5 px-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
          >
            <option value="ALL">All Projects</option>
            {projectsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>

          {isAdmin && (
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            >
              <option value="ALL">All Employees</option>
              {employeesList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.employeeId})
                </option>
              ))}
            </select>
          )}

          <select
            value={outsideFilter}
            onChange={(e) => setOutsideFilter(e.target.value as 'ALL' | 'true' | 'false')}
            className="py-1.5 px-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
          >
            <option value="ALL">All Hours Types</option>
            <option value="false">Regular Office Hours Only</option>
            <option value="true">Outside Office Hours Only</option>
          </select>

          {(startDate || endDate || selectedProjectId !== 'ALL' || selectedUserId !== 'ALL' || outsideFilter !== 'ALL') && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSelectedProjectId('ALL');
                setSelectedUserId('ALL');
                setOutsideFilter('ALL');
              }}
              className="text-xs text-slate-400 hover:text-white underline ml-auto"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Logs Table */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Showing <strong>{logs.length}</strong> of <strong>{totalCount}</strong> records
            </span>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-500">Loading time records...</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              No time records found for the selected filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    {isAdmin && <th className="p-3.5 font-medium">Employee</th>}
                    <th className="p-3.5 font-medium">Project</th>
                    <th className="p-3.5 font-medium">Start Time</th>
                    <th className="p-3.5 font-medium">End Time</th>
                    <th className="p-3.5 font-medium">Duration</th>
                    <th className="p-3.5 font-medium">Classification</th>
                    <th className="p-3.5 font-medium">Status & Notes</th>
                    <th className="p-3.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.map((log) => {
                    const hasPendingCorrection = log.corrections?.some((c) => c.status === 'PENDING');
                    return (
                      <tr key={log.id} className="text-slate-300 hover:bg-slate-800/30 transition">
                        {isAdmin && (
                          <td className="p-3.5">
                            <span className="font-semibold text-white">{log.user.name}</span>
                            <span className="block text-[10px] text-slate-500 font-mono">
                              {log.user.employeeId}
                            </span>
                          </td>
                        )}
                        <td className="p-3.5">
                          <span className="font-medium text-white">{log.project.code}</span>
                          <span className="block text-xs text-slate-400 truncate max-w-[200px]">
                            {log.project.name}
                          </span>
                        </td>
                        <td className="p-3.5 text-xs font-mono text-slate-300">
                          {new Date(log.startTime).toLocaleString()}
                        </td>
                        <td className="p-3.5 text-xs font-mono text-slate-300">
                          {log.endTime ? (
                            new Date(log.endTime).toLocaleString()
                          ) : (
                            <span className="text-emerald-400 animate-pulse font-bold">RUNNING</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-white">
                          {formatSecondsToTimer(log.duration)}
                        </td>
                        <td className="p-3.5">
                          {log.isOutsideHours ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Outside Hours
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Regular
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-400">
                              {log.status}
                            </span>
                            {hasPendingCorrection && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300">
                                Correction Pending
                              </span>
                            )}
                          </div>
                          {log.notes && (
                            <p className="text-xs text-slate-400 mt-1 max-w-xs truncate" title={log.notes}>
                              {log.notes}
                            </p>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isAdmin ? (
                              <button
                                onClick={() => openCorrectionModal(log)}
                                className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
                              >
                                Request Correction
                              </button>
                            ) : (
                              <button
                                onClick={() => openAdminEdit(log)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                                title="Edit Record (with Mandatory Reason)"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Correction Request Modal */}
        {correctionModalOpen && selectedLogForCorrection && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <h3 className="text-base font-bold text-white">Submit Time Correction</h3>
                <button
                  onClick={() => setCorrectionModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {correctionError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{correctionError}</span>
                </div>
              )}

              <form onSubmit={handleSubmitCorrection} className="space-y-4">
                <div className="p-3 bg-slate-950 rounded-xl text-xs space-y-1 text-slate-300">
                  <p><strong>Project:</strong> {selectedLogForCorrection.project.code} — {selectedLogForCorrection.project.name}</p>
                  <p><strong>Original Duration:</strong> {formatSecondsToTimer(selectedLogForCorrection.duration)}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Proposed Start Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={proposedStart}
                    onChange={(e) => setProposedStart(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Proposed End Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={proposedEnd}
                    onChange={(e) => setProposedEnd(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Mandatory Correction Reason
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Provide an explanation for the requested adjustment..."
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectionModalOpen(false)}
                    className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-md shadow-blue-600/30"
                  >
                    Submit for Approval
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Admin Direct Edit / Manual Create Modal */}
        {adminModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <h3 className="text-base font-bold text-white">
                  {adminEditingLog ? 'Admin Edit Time Entry' : 'Manual Time Record Creation'}
                </h3>
                <button
                  onClick={() => setAdminModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {adminError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{adminError}</span>
                </div>
              )}

              <form onSubmit={handleAdminSubmit} className="space-y-4">
                {!adminEditingLog && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Employee
                    </label>
                    <select
                      value={adminTargetUserId}
                      onChange={(e) => setAdminTargetUserId(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                    >
                      {employeesList.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.employeeId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Project
                  </label>
                  <select
                    value={adminTargetProjectId}
                    onChange={(e) => setAdminTargetProjectId(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  >
                    {projectsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Start Time
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={adminStartTime}
                      onChange={(e) => setAdminStartTime(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      End Time
                    </label>
                    <input
                      type="datetime-local"
                      value={adminEndTime}
                      onChange={(e) => setAdminEndTime(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Work Notes
                  </label>
                  <input
                    type="text"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Task details..."
                    className="w-full py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-amber-300 mb-1">
                    Mandatory Audit Reason (Strictly Enforced)
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="State reason for administrative time entry change (logged in permanent audit trail)..."
                    value={adminReason}
                    onChange={(e) => setAdminReason(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-950 border border-amber-600/40 rounded-xl text-xs text-white placeholder-slate-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAdminModalOpen(false)}
                    className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-md shadow-blue-600/30"
                  >
                    Save & Generate Audit Log
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

export default function TimeLogsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">
          Loading Time Records...
        </div>
      }
    >
      <TimeLogsContent />
    </Suspense>
  );
}
