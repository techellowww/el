"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAuthStore } from "@/lib/store";
import {
  Settings as SettingsIcon,
  Building,
  Image,
  Mail,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  Lock,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ConfirmModal } from "@/components/MiniModal";

export default function SettingsPage() {
  const { user, setAgencyBranding } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Form states
  const [agencyName, setAgencyName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [logoUrl, setLogoUrl] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [emailPreferences, setEmailPreferences] = useState<Record<string, boolean>>({
    STATUS_UPDATE: true,
    MEETING_INVITE: true,
    NEW_CHAT_MESSAGE: true,
    ASSIGNED_TO_CLIENT: true,
    RETAINER_WARNING: true,
  });

  // Logo deletion & upload states
  const [showDeleteLogoConfirm, setShowDeleteLogoConfirm] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const [savingBranding, setSavingBranding] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setAccount(data.account);
        setAuditLogs(data.auditLogs || []);

        if (data.account) {
          setAgencyName(data.account.name || "");
          setCurrency(data.account.currency || "USD");
          setLogoUrl(data.account.logoUrl || "");
          setReplyToEmail(data.account.replyToEmail || "");

          setAgencyBranding({
            name: data.account.name || "ClientHub",
            logoUrl: data.account.logoUrl || null,
            currency: data.account.currency || "USD",
          });

          if (data.account.emailSettings) {
            try {
              setEmailPreferences((prev) => ({
                ...prev,
                ...JSON.parse(data.account.emailSettings),
              }));
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSettings();
    }
  }, [isAdmin]);

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agencyName.trim(),
          currency,
          logoUrl: logoUrl.trim() || null,
          replyToEmail: replyToEmail.trim() || null,
          emailSettings: emailPreferences,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update agency settings");

      setSaveSuccess("Agency branding, logo, and notification preferences saved!");
      setTimeout(() => setSaveSuccess(null), 4000);
      setAccount(data.account);

      setAgencyBranding({
        name: data.account.name || "ClientHub",
        logoUrl: data.account.logoUrl || null,
        currency: data.account.currency || "USD",
      });
    } catch (err: any) {
      setSaveError(err.message || "Failed to save settings");
    } finally {
      setSavingBranding(false);
    }
  };

  const handleDeleteLogo = async () => {
    setDeletingLogo(true);
    setSaveError(null);
    setSaveSuccess(null);
    setShowDeleteLogoConfirm(false);

    try {
      const res = await fetch("/api/settings?field=logo", {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete agency logo");

      setLogoUrl("");
      if (logoFileInputRef.current) {
        logoFileInputRef.current.value = "";
      }
      if (account) {
        setAccount({ ...account, logoUrl: null });
      }

      setAgencyBranding({ logoUrl: null });
      setSaveSuccess("Agency logo deleted successfully! The sidebar and documents have reverted to default initials badge.");
      setTimeout(() => setSaveSuccess(null), 4500);
    } catch (err: any) {
      setSaveError(err.message || "Failed to delete agency logo");
    } finally {
      setDeletingLogo(false);
    }
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setSaveError("Logo image file size must be less than 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setLogoUrl(result);
        setSaveError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-card border border-border">
        <h2 className="text-xl font-bold text-text-primary">Admin Access Required</h2>
        <p className="text-text-secondary mt-2">Only agency administrators can access agency settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Agency Settings</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Configure agency branding, brand logo, and email notification rules.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* 1. Branding & Logo Upload Section (Section 4 & 6) */}
      <div className="p-6 rounded-2xl bg-white border border-border shadow-xs space-y-6">
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <Building className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold text-text-primary">Agency Branding & Brand Logo</h2>
        </div>

        <form onSubmit={handleSaveBranding} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Agency Name *</label>
              <input
                type="text"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Default Currency *</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="USD">💵 USD ($) — United States Dollar</option>
                <option value="EUR">💶 EUR (€) — Eurozone</option>
                <option value="GBP">💷 GBP (£) — British Pound</option>
                <option value="INR">₹ INR (₹) — Indian Rupee (Paise)</option>
                <option value="CAD">💲 CAD ($) — Canadian Dollar</option>
                <option value="AUD">💲 AUD ($) — Australian Dollar</option>
              </select>
            </div>
          </div>

          {/* Logo Field & Delete Options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-text-secondary">
                Agency Brand Logo (Renders in Sidebar, Client Pages, Proposals &amp; Invoices)
              </label>
              {(logoUrl || account?.logoUrl) && (
                <button
                  type="button"
                  id="btn-delete-logo-header"
                  data-testid="btn-delete-logo-header"
                  onClick={() => setShowDeleteLogoConfirm(true)}
                  disabled={deletingLogo}
                  className="px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Delete current logo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Logo</span>
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="https://... or data:image/... or choose file"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 pr-8 rounded-xl border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    title="Clear logo URL input"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                  onChange={handleLogoFileUpload}
                  className="hidden"
                  id="agency-logo-upload-input"
                />
                <button
                  type="button"
                  onClick={() => logoFileInputRef.current?.click()}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl border border-border bg-slate-50 hover:bg-slate-100 text-text-primary text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>

            <span className="text-[11px] text-slate-500 block">
              Enter a logo URL, paste SVG data, or upload an image file (PNG, JPG, SVG up to 2MB). The logo will render in the sidebar and be copied onto documents.
            </span>

            {/* Logo Preview & Delete Action */}
            {logoUrl && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-xs flex items-center justify-center min-w-[70px] min-h-[44px]">
                    <img
                      src={logoUrl}
                      alt="Agency Logo Preview"
                      className="max-h-10 max-w-[160px] object-contain"
                      onError={(e) => {
                        (e.target as any).style.display = "none";
                      }}
                    />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Active Logo Preview</span>
                    <span className="text-[11px] text-slate-500 block">
                      This logo renders in your sidebar and client-facing deliverables.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-delete-logo"
                  data-testid="btn-delete-logo"
                  onClick={() => setShowDeleteLogoConfirm(true)}
                  disabled={deletingLogo}
                  className="px-3 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-600 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  {deletingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Delete Logo</span>
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Admin Reply-To Email (Section 8)
            </label>
            <input
              type="email"
              placeholder="e.g. hello@yourdomain.com"
              value={replyToEmail}
              onChange={(e) => setReplyToEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-[11px] text-slate-500 block mt-1">
              Client emails will have this address set as the Reply-To header, so clients can reply directly to the agency owner.
            </span>
          </div>

          {/* Email Notification Toggles (Section 8) */}
          <div className="pt-4 border-t border-border space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Email Notification Preferences (Section 8)
            </h3>
            <p className="text-xs text-slate-500">
              Proposal, invoice, and contract signing emails to clients are permanent and cannot be disabled. Optional internal alerts can be toggled:
            </p>

            <div className="space-y-2.5 pt-1">
              {[
                { key: "STATUS_UPDATE", label: "Status update email to client when ticked" },
                { key: "MEETING_INVITE", label: "Meeting invite emails with .ics calendar files" },
                { key: "NEW_CHAT_MESSAGE", label: "10-minute unread chat notification emails" },
                { key: "ASSIGNED_TO_CLIENT", label: "Notify employee when assigned to a client" },
                { key: "RETAINER_WARNING", label: "Retainer warning emails to owner at 80% & 100% budget" },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2.5 text-xs text-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailPreferences[item.key] !== false}
                    onChange={(e) =>
                      setEmailPreferences((prev) => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="submit"
              disabled={savingBranding}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              {savingBranding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Agency Settings</span>
            </button>
          </div>
        </form>
      </div>

      {/* 2. Audit Log History (Section 6) */}
      <div className="p-6 rounded-2xl bg-white border border-border shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold text-text-primary">Audit Log (Sends, Signs, Voids, Payments)</h2>
        </div>

        {auditLogs.length === 0 ? (
          <p className="text-xs text-text-secondary">No audit logs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-slate-500 font-semibold">
                  <th className="py-2">Time</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Entity</th>
                  <th className="py-2">User / IP</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.slice(0, 15).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="py-2 text-slate-500 font-mono text-[11px]">
                      {new Date(log.createdAt).toLocaleDateString()}{" "}
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2 font-bold text-primary">{log.action}</td>
                    <td className="py-2 text-slate-700">{log.entityType}</td>
                    <td className="py-2 text-slate-600">{log.user?.name || log.ipAddress || "Client"}</td>
                    <td className="py-2 text-slate-500 font-mono text-[10px] truncate max-w-xs">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Logo Confirmation Modal */}
      <ConfirmModal
        open={showDeleteLogoConfirm}
        variant="error"
        title="Delete Agency Logo?"
        message="Are you sure you want to delete your agency logo? The sidebar, client pages, and generated proposals & invoices will revert to the default agency initials badge."
        confirmLabel={deletingLogo ? "Deleting..." : "Delete Logo"}
        cancelLabel="Keep Logo"
        loading={deletingLogo}
        onConfirm={handleDeleteLogo}
        onCancel={() => setShowDeleteLogoConfirm(false)}
      />
    </div>
  );
}

