"use client";

import React, { useEffect, useState, use } from "react";
import {
  FolderKanban,
  ExternalLink,
  CheckCircle2,
  Clock,
  Sparkles,
  Building,
  ArrowRight,
  ShieldCheck,
  Calendar,
  FileText,
  CreditCard,
  MessageSquare,
  Send,
  Loader2,
  Paperclip,
  X,
  FileCheck,
} from "lucide-react";
import { getStageBadge } from "@/lib/utils";

export default function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [clientData, setClientData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"PROJECTS" | "PROPOSALS" | "INVOICES" | "CHAT">("PROJECTS");

  // Client Chat States
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const loadPortalData = async () => {
    try {
      const res = await fetch(`/api/portal/${token}`);
      if (!res.ok) throw new Error("Portal link is invalid, expired, or revoked.");
      const data = await res.json();
      setClientData(data.client);
    } catch (err: any) {
      setError(err.message || "Failed to load client portal");
    } finally {
      setLoading(false);
    }
  };

  const loadChatMessages = async () => {
    try {
      const res = await fetch(`/api/portal/${token}/chat`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Chat load error:", err);
    }
  };

  useEffect(() => {
    loadPortalData();
    loadChatMessages();
    const interval = setInterval(loadChatMessages, 10000); // Poll every 10s per Section 9
    return () => clearInterval(interval);
  }, [token]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setSendingMsg(true);
    setChatError(null);

    try {
      const res = await fetch(`/api/portal/${token}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: chatInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");

      setChatInput("");
      loadChatMessages();
    } catch (err: any) {
      setChatError(err.message || "Failed to send message");
    } finally {
      setSendingMsg(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500 font-medium">Opening secure client hub...</p>
        </div>
      </div>
    );
  }

  if (error || !clientData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">Portal Link Unavailable</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || "This client portal link is invalid, expired, or has been revoked."}
          </p>
        </div>
      </div>
    );
  }

  const { agency, projects = [], proposals = [], invoices = [] } = clientData;

  return (
    <div className="min-h-screen bg-slate-100/60 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Client Portal Branding Bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {agency.logoUrl ? (
              <img src={agency.logoUrl} alt={agency.name} className="max-h-8 max-w-[140px] object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-sm">
                {agency.name.charAt(0)}
              </div>
            )}
            <div>
              <span className="font-bold text-slate-900 block text-sm leading-tight">{agency.name}</span>
              <span className="text-[11px] text-slate-500 font-medium leading-none">Client Operations Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="hidden sm:inline">Secure Client Link</span>
              <span className="sm:hidden">Secure</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Welcome Banner */}
        <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2 relative overflow-hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full inline-block">
            Client Workspace
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Hello, {clientData.name}
          </h1>
          {clientData.company && (
            <p className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
              <Building className="w-4 h-4" />
              <span>{clientData.company}</span>
            </p>
          )}
          <p className="text-xs text-slate-600 max-w-2xl pt-1 leading-relaxed">
            Welcome to your dedicated project hub with {agency.name}. Review delivery milestones, test staging previews, sign proposals, inspect invoices, and message your project team directly.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          {[
            { id: "PROJECTS", label: `Projects (${projects.length})`, icon: FolderKanban },
            { id: "PROPOSALS", label: `Proposals (${proposals.length})`, icon: FileText },
            { id: "INVOICES", label: `Invoices (${invoices.length})`, icon: CreditCard },
            { id: "CHAT", label: "Team Chat", icon: MessageSquare },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: PROJECTS */}
        {activeTab === "PROJECTS" && (
          <div className="space-y-6">
            {projects.length === 0 ? (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
                No active projects have been published yet.
              </div>
            ) : (
              projects.map((proj: any) => {
                const stageMeta = getStageBadge(proj.stage);

                return (
                  <div key={proj.id} className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-lg font-bold text-slate-900">{proj.name}</h3>
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${stageMeta.bg}`}>
                            {stageMeta.label}
                          </span>
                        </div>
                        {proj.description && <p className="text-xs text-slate-600 max-w-2xl pt-1">{proj.description}</p>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        {proj.stagingUrl && (
                          <a
                            href={proj.stagingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
                          >
                            <span>Open Staging Preview</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {proj.liveUrl && (
                          <a
                            href={proj.liveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
                          >
                            <span>Visit Live Website</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Stage Progress Bar (Mobile and Desktop Friendly) */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                        <span>Project Phase</span>
                        <span className="text-blue-600 font-bold">Step {stageMeta.step} of 4</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { title: "Discovery", step: 1 },
                          { title: "In Progress", step: 2 },
                          { title: "Awaiting Review", step: 3 },
                          { title: "Live", step: 4 },
                        ].map((s) => {
                          const isDone = stageMeta.step >= s.step;
                          return (
                            <div key={s.step} className="space-y-1 text-center">
                              <div className={`h-2 rounded-full transition-all ${isDone ? "bg-blue-600" : "bg-slate-200"}`} />
                              <span className="text-[10px] font-semibold text-slate-600 block truncate">{s.title}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Status Updates */}
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span>Recent Project Status Timeline</span>
                      </h4>

                      {proj.statusUpdates && proj.statusUpdates.length > 0 ? (
                        <div className="space-y-2.5">
                          {proj.statusUpdates.map((update: any) => (
                            <div key={update.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <h5 className="font-bold text-slate-900">{update.title}</h5>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {new Date(update.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-slate-600">{update.body}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No status updates published yet.</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: PROPOSALS */}
        {activeTab === "PROPOSALS" && (
          <div className="space-y-4">
            {proposals.length === 0 ? (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
                No proposals have been published to your account.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {proposals.map((prop: any) => (
                  <div key={prop.id} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900">{prop.title}</h3>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          prop.status === "SIGNED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {prop.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">
                      Issued: {prop.sentAt ? new Date(prop.sentAt).toLocaleDateString() : "Recent"}
                    </p>

                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <a
                        href={`/proposal/${prop.tokenHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5"
                      >
                        <span>{prop.status === "SIGNED" ? "View Signed Agreement" : "Review & Sign Proposal"}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INVOICES */}
        {activeTab === "INVOICES" && (
          <div className="space-y-4">
            {invoices.length === 0 ? (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
                No invoices have been issued to your account.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-slate-900 text-base">{inv.invoiceNumberDisplay}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "Upon Receipt"}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          inv.status === "PAID"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>

                    <div className="text-xl font-bold font-mono text-slate-900">
                      ${(inv.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <a
                        href={`/invoice/${inv.tokenHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5"
                      >
                        <span>View Invoice Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CLIENT CHAT (Section 9) */}
        {activeTab === "CHAT" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-[520px] overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/75 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Direct Agency Messaging</h3>
                <p className="text-[11px] text-slate-500">Communicate directly with your assigned web agency team.</p>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Connected as {clientData.name}
              </span>
            </div>

            {/* Chat Messages Feed */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                  <span>No messages yet. Send a message to start the conversation!</span>
                </div>
              ) : (
                chatMessages.map((m: any) => {
                  const isClient = m.senderType === "CLIENT";
                  return (
                    <div key={m.id} className={`flex flex-col ${isClient ? "items-end" : "items-start"}`}>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5 px-1">
                        <span className="font-semibold text-slate-600">{m.senderName}</span>
                        <span>•</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div
                        className={`max-w-md p-3 rounded-2xl text-xs leading-relaxed ${
                          isClient
                            ? "bg-blue-600 text-white rounded-br-none shadow-xs"
                            : "bg-slate-100 text-slate-900 rounded-bl-none"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {chatError && (
              <div className="p-2 bg-red-50 text-red-700 text-xs border-t border-red-200 px-4">{chatError}</div>
            )}

            {/* Message Input */}
            <form onSubmit={handleSendChatMessage} className="p-3 border-t border-slate-200 flex items-center gap-2">
              <input
                type="text"
                placeholder="Type your message to the agency..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="submit"
                disabled={sendingMsg || !chatInput.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {sendingMsg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Send</span>
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <p>Powered by ClientHub • Built for Web Agencies & Freelancers</p>
      </footer>
    </div>
  );
}
