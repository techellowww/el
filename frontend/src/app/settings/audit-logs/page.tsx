'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import {
  History,
  ShieldCheck,
  Filter,
  User,
  Calendar,
  AlertCircle,
  FileCode,
  Search,
  RefreshCw,
  Clock,
  Trash2,
  Edit3,
  PlusCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Layers,
} from 'lucide-react';

interface AuditItem {
  id: string;
  action: string;
  targetEntity: string;
  targetId: string;
  mandatoryReason: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string; employeeId: string; role: string; email?: string } | null;
}

export default function AuditLogsPage() {
  const { user } = useAuthStore();

  // Date range state - defaults to Today's daily activity
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');

  // Filters state
  const [actionFilter, setActionFilter] = useState<'ALL_MUTATIONS' | 'EDITS' | 'DELETES' | 'CREATES' | 'CORRECTIONS' | 'ALL'>('ALL_MUTATIONS');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination & infinite scroll state (50 items per batch)
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Expanded row details modal or accordion
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Quick Date Preset Handler
  const handlePresetChange = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      setStartDate(w.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const m = new Date();
      m.setDate(m.getDate() - 30);
      setStartDate(m.toISOString().slice(0, 10));
      setEndDate(todayStr);
    }
  };

  // Initial fetch on filter change (fetches first 50 records alone)
  const loadInitialLogs = useCallback(async () => {
    setIsLoadingInitial(true);
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: '0',
        adminOnly: 'true',
        action: actionFilter,
      });

      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const initialLogs: AuditItem[] = data.logs || [];
        setLogs(initialLogs);
        setTotalCount(data.totalCount || 0);
        setOffset(initialLogs.length);
        setHasMore(data.hasMore ?? (initialLogs.length === 50));
      } else {
        setLogs([]);
        setTotalCount(0);
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load initial audit logs:', err);
      setLogs([]);
    } finally {
      setIsLoadingInitial(false);
    }
  }, [startDate, endDate, actionFilter, searchQuery]);

  // Load next 50 records on scroll
  const loadNextPage = useCallback(async () => {
    if (isLoadingMore || !hasMore || isLoadingInitial) return;

    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: offset.toString(),
        adminOnly: 'true',
        action: actionFilter,
      });

      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const nextLogs: AuditItem[] = data.logs || [];
        setLogs((prev) => [...prev, ...nextLogs]);
        setOffset((prev) => prev + nextLogs.length);
        setHasMore(data.hasMore ?? (offset + nextLogs.length < (data.totalCount || 0)));
      }
    } catch (err) {
      console.error('Failed to load next audit log page:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, isLoadingInitial, offset, startDate, endDate, actionFilter, searchQuery]);

  // Trigger initial fetch when filters change
  useEffect(() => {
    loadInitialLogs();
  }, [loadInitialLogs]);

  // IntersectionObserver for infinite scroll sentinel
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoadingInitial) {
          loadNextPage();
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoadingInitial, loadNextPage]);

  // Helper for action badges
  const getActionBadge = (action: string) => {
    const isDelete = action.includes('DELETE') || action.includes('DEACTIVATE') || action.includes('CLOSED');
    const isEdit = action.includes('EDIT') || action.includes('UPDATE');
    const isCreate = action.includes('CREATE');
    const isApprove = action.includes('APPROVE');
    const isReject = action.includes('REJECT');

    if (isDelete) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
          <Trash2 className="w-3 h-3 text-red-400" />
          {action}
        </span>
      );
    }
    if (isEdit) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Edit3 className="w-3 h-3 text-amber-400" />
          {action}
        </span>
      );
    }
    if (isCreate) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
          <PlusCircle className="w-3 h-3 text-blue-400" />
          {action}
        </span>
      );
    }
    if (isApprove) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          {action}
        </span>
      );
    }
    if (isReject) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
          <XCircle className="w-3 h-3 text-rose-400" />
          {action}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-blue-500" />
            <span>Admin Audit Logs & Activity Trail</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Audit ledger tracking administrative record modifications (Edits, Deletions, and Updates). Defaulting to today's daily activities.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => loadInitialLogs()}
            disabled={isLoadingInitial}
            className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-2 transition cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isLoadingInitial ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Date Presets & Range Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-3.5 shadow-sm">
        {/* Quick presets row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" /> Date Preset:
            </span>
            {(
              [
                { id: 'today', label: 'Today (Daily Activity)' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'week', label: 'Last 7 Days' },
                { id: 'month', label: 'Last 30 Days' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800/80 hover:bg-slate-800/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin Records Only • 50 Per Scroll</span>
          </div>
        </div>

        {/* Date From & To Pickers + Action Filter + Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/60">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full py-1.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full py-1.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Admin Action Type</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as any)}
              className="w-full py-1.5 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
            >
              <option value="ALL_MUTATIONS">All Admin Modifications (Default)</option>
              <option value="EDITS">Edits & Updates Only</option>
              <option value="DELETES">Deletions & Deactivations</option>
              <option value="CREATES">Creations & Additions</option>
              <option value="CORRECTIONS">Time Correction Decisions</option>
              <option value="ALL">All Actions</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Search Keywords</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Target ID, Reason, Actor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log Table Container */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-900/90">
          <div>
            <span>
              Showing <strong className="text-white">{logs.length}</strong> of{' '}
              <strong className="text-white">{totalCount}</strong> recorded admin events
            </span>
            <span className="text-slate-500 ml-2">
              ({startDate === endDate ? `Date: ${startDate}` : `${startDate} → ${endDate}`})
            </span>
          </div>

          <div className="text-slate-500 text-[11px]">
            Scroll list to automatically stream next 50 records
          </div>
        </div>

        {isLoadingInitial ? (
          <div className="py-24 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-slate-400">Loading admin audit records...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-3 shadow-sm">
              <History className="w-6 h-6 text-slate-500" />
            </div>
            <h4 className="text-base font-bold text-white tracking-tight">No Admin Audit Records Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
              No administrative edits, updates, or deletions were recorded for the selected date window ({startDate === endDate ? startDate : `${startDate} to ${endDate}`}).
            </p>
            {startDate === new Date().toISOString().slice(0, 10) && (
              <p className="text-[11px] text-blue-400 mt-2 font-medium">
                Try selecting "Last 7 Days" or "Last 30 Days" above to review earlier actions.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="p-3.5 font-semibold">Timestamp</th>
                  <th className="p-3.5 font-semibold">Admin Actor</th>
                  <th className="p-3.5 font-semibold">Action Performed</th>
                  <th className="p-3.5 font-semibold">Target Entity</th>
                  <th className="p-3.5 font-semibold">Mandatory Audit Reason</th>
                  <th className="p-3.5 font-semibold text-right">Change Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  let parsedDetails: any = null;
                  if (log.details) {
                    try {
                      parsedDetails = JSON.parse(log.details);
                    } catch {
                      parsedDetails = log.details;
                    }
                  }

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="text-slate-300 hover:bg-slate-800/40 transition">
                        <td className="p-3.5 font-mono text-slate-400 whitespace-nowrap">
                          <div>
                            <span className="text-white font-medium">
                              {new Date(log.createdAt).toLocaleDateString()}
                            </span>
                            <span className="block text-[11px] text-slate-500 font-mono">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          {log.user ? (
                            <div>
                              <span className="font-semibold text-white">{log.user.name}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {log.user.employeeId}
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1 rounded">
                                  {log.user.role}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono text-slate-500 italic">SYSTEM SCHEDULER</span>
                          )}
                        </td>

                        <td className="p-3.5 font-mono whitespace-nowrap">
                          {getActionBadge(log.action)}
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-medium text-slate-200">{log.targetEntity}</span>
                          <span className="block font-mono text-[11px] text-slate-500 truncate max-w-[140px]" title={log.targetId}>
                            #{log.targetId.slice(0, 10)}...
                          </span>
                        </td>

                        <td className="p-3.5 max-w-sm">
                          <p className="text-slate-200 font-medium leading-relaxed">
                            {log.mandatoryReason || <span className="text-slate-500 italic">No reason specified</span>}
                          </p>
                        </td>

                        <td className="p-3.5 text-right whitespace-nowrap">
                          {log.details ? (
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 transition cursor-pointer border border-slate-700/60"
                            >
                              {isExpanded ? 'Hide Details' : 'View Details'}
                            </button>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expandable row for change details */}
                      {isExpanded && log.details && (
                        <tr className="bg-slate-950/70 border-b border-slate-800">
                          <td colSpan={6} className="p-4">
                            <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                                <span className="flex items-center gap-1.5">
                                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                                  Audit Payload & Field Mutations
                                </span>
                                <span className="font-mono text-slate-500 text-[10px]">Log ID: {log.id}</span>
                              </div>
                              <pre className="p-3 bg-slate-950 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto max-h-60 leading-relaxed border border-slate-800/80">
                                {typeof parsedDetails === 'object'
                                  ? JSON.stringify(parsedDetails, null, 2)
                                  : parsedDetails}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Sentinel element for infinite scrolling (triggers next 50 fetch) */}
        <div ref={sentinelRef} className="h-4 w-full" />

        {/* Bottom Pagination Status & Load More Bar */}
        {!isLoadingInitial && logs.length > 0 && (
          <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              <span>
                Displaying <strong>{logs.length}</strong> of <strong>{totalCount}</strong> records
              </span>
              {hasMore && (
                <span className="text-blue-400 ml-2">
                  (Scroll down to automatically fetch next 50)
                </span>
              )}
            </div>

            <div>
              {isLoadingMore ? (
                <div className="flex items-center gap-2 text-blue-400 font-medium">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Fetching next 50 audit records from backend...</span>
                </div>
              ) : hasMore ? (
                <button
                  onClick={() => loadNextPage()}
                  className="py-1.5 px-4 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-xs font-semibold text-blue-300 transition cursor-pointer"
                >
                  Load Next 50 Records
                </button>
              ) : (
                <span className="text-slate-500 text-[11px]">
                  All {totalCount} records loaded for this date window.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
