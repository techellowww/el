"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  MapPin,
  Users,
  Video,
  CheckCircle2,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Building,
  FolderKanban,
} from "lucide-react";

export default function CalendarPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  const [events, setEvents] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Event Modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("11:00");
  const [locationUrl, setLocationUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");

  // Attendees
  const [inviteClient, setInviteClient] = useState(true);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetForm = () => {
    const today = new Date().toISOString().split("T")[0];
    setTitle("");
    setDescription("");
    setStartDate(today);
    setStartTime("10:00");
    setEndDate(today);
    setEndTime("11:00");
    setLocationUrl("");
    setClientId("");
    setProjectId("");
    setInviteClient(true);
    setSelectedEmployeeIds([]);
    setErrorMsg(null);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [cRes, pRes, eRes] = await Promise.all([
        fetch("/api/clients"),
        fetch("/api/projects"),
        fetch("/api/employees"),
      ]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setClients(cData.clients || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setProjects(pData.projects || []);
      }
      if (eRes.ok) {
        const eData = await eRes.json();
        setEmployees(eData.employees || []);
      }
    } catch (err) {
      console.error("Failed to load metadata:", err);
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchMetadata();
  }, []);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate || !endDate) {
      setErrorMsg("Title, start date, and end date are required.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const startIso = new Date(`${startDate}T${startTime}:00`).toISOString();
      const endIso = new Date(`${endDate}T${endTime}:00`).toISOString();

      // Build attendees list only for selected participants
      const attendees: any[] = [];
      const seenEmails = new Set<string>();

      // Add selected client (email retrieved from Client module)
      if (clientId && inviteClient) {
        const client = clients.find((c) => c.id === clientId);
        if (client) {
          const normEmail = client.email ? client.email.trim().toLowerCase() : "";
          if (normEmail) seenEmails.add(normEmail);
          attendees.push({
            clientId: client.id,
            email: normEmail || undefined,
            name: client.name,
            isClient: true,
          });
        }
      }

      // Add selected employees (email retrieved from Employee module)
      for (const empId of selectedEmployeeIds) {
        const emp = employees.find((e) => e.id === empId);
        if (emp) {
          const normEmail = emp.email ? emp.email.trim().toLowerCase() : "";
          if (!normEmail || !seenEmails.has(normEmail)) {
            if (normEmail) seenEmails.add(normEmail);
            attendees.push({
              userId: emp.id,
              email: normEmail || undefined,
              name: emp.name,
              isClient: false,
            });
          }
        }
      }

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          startTime: startIso,
          endTime: endIso,
          locationUrl: locationUrl.trim() || undefined,
          clientId: clientId || undefined,
          projectId: projectId || undefined,
          attendees,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create event");

      handleCloseModal();
      
      const sentCount = data.invitationResults?.sent?.length ?? 0;
      const failedCount = data.invitationResults?.failed?.length ?? 0;

      if (failedCount > 0 && sentCount === 0) {
        setErrorMsg(
          `Event scheduled, but email invitations failed to send to ${data.invitationResults.failed.map((f: any) => f.email).join(', ')}. Please verify SMTP settings in Settings.`
        );
      } else if (failedCount > 0 && sentCount > 0) {
        setSuccessMsg(
          `Event scheduled! Invitations sent to ${sentCount} participant(s). Delivery failed for: ${data.invitationResults.failed.map((f: any) => f.email).join(', ')}.`
        );
        setTimeout(() => setSuccessMsg(null), 6000);
      } else if (sentCount > 0) {
        setSuccessMsg(`Event scheduled and email invitations sent to ${sentCount} participant(s)!`);
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        setSuccessMsg("Event scheduled successfully!");
        setTimeout(() => setSuccessMsg(null), 5000);
      }
      fetchEvents();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to schedule event");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchEvents();
      }
    } catch (err) {
      console.error("Delete event error:", err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Calendar</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Manage agency meetings, client reviews, and deadlines. Automatically sends .ics calendar invites to attendees.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Meeting / Event</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Events Agenda & Schedule List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-card border border-border">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-text-secondary mt-2">Loading calendar events...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-card border border-border text-text-secondary">
          <CalendarIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <p className="text-base font-semibold text-text-primary">No upcoming events</p>
          <p className="text-xs text-text-secondary mt-1">Schedule a meeting or deadline to dispatch .ics calendar invites.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary">Upcoming Meetings & Deadlines</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map((event) => {
              const start = new Date(event.startTime);
              const end = new Date(event.endTime);
              const isPast = end < new Date();

              return (
                <div
                  key={event.id}
                  className={`p-5 rounded-2xl bg-white border border-border shadow-xs space-y-3 relative overflow-hidden transition ${
                    isPast ? "opacity-75" : "hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {event.client?.name || "Agency Internal"}
                      </span>
                      <h3 className="text-base font-bold text-text-primary pt-0.5">{event.title}</h3>
                      {event.project && (
                        <p className="text-xs text-text-secondary flex items-center gap-1">
                          <FolderKanban className="w-3.5 h-3.5 text-primary" />
                          <span>{event.project.name}</span>
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                      title="Remove event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {event.description && <p className="text-xs text-slate-600 leading-relaxed">{event.description}</p>}

                  <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span>
                        {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} •{" "}
                        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                        {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {event.locationUrl && (
                      <a
                        href={event.locationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join Meeting</span>
                      </a>
                    )}
                  </div>

                  {/* Attendees Chips */}
                  {event.attendees && event.attendees.length > 0 && (
                    <div className="pt-2 border-t border-border/60 flex items-center gap-1.5 flex-wrap">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {event.attendees.map((att: any) => (
                        <span
                          key={att.id}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            att.isClient
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {att.name || att.email}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Event Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-text-primary">Schedule Meeting / Event</h3>
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

            <form onSubmit={handleCreateEvent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Discovery Call / Sprint Demo / Final Handover"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Client</label>
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">None / Internal Event</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">None</option>
                    {projects
                      .filter((p) => !clientId || p.clientId === clientId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Start Date & Time *</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate) setEndDate(e.target.value);
                    }}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-primary mb-1.5"
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">End Date & Time *</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-primary mb-1.5"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Meeting URL / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Google Meet, Zoom, or Office Address"
                  value={locationUrl}
                  onChange={(e) => setLocationUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Agenda and notes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Attendee Invites */}
              <div className="p-3 rounded-xl bg-slate-50 border border-border space-y-2">
                <span className="text-xs font-bold text-text-primary block">Invite Attendees (.ics Calendar Email)</span>
                {clientId && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteClient}
                      onChange={(e) => setInviteClient(e.target.checked)}
                      className="rounded border-slate-300 text-primary"
                    />
                    <span>Email .ics invite to Client</span>
                  </label>
                )}

                {employees.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500 block">Team Members:</span>
                    <div className="flex flex-wrap gap-2">
                      {employees.map((emp) => (
                        <label key={emp.id} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedEmployeeIds.includes(emp.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEmployeeIds((prev) => [...prev, emp.id]);
                              } else {
                                setSelectedEmployeeIds((prev) => prev.filter((id) => id !== emp.id));
                              }
                            }}
                            className="rounded border-slate-300 text-primary"
                          />
                          <span>{emp.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Schedule & Send Invites</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

