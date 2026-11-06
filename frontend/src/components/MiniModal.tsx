'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

/* ──────────────────────────────────────────────────────────
   Types
────────────────────────────────────────────────────────── */
export type MiniModalVariant = 'info' | 'success' | 'error' | 'warning';

interface AlertModalProps {
  open: boolean;
  variant?: MiniModalVariant;
  title?: string;
  message: string;
  onClose: () => void;
}

interface ConfirmModalProps {
  open: boolean;
  variant?: MiniModalVariant;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Set to true to show a loading spinner on the confirm button */
  loading?: boolean;
}

interface PromptModalProps {
  open: boolean;
  variant?: MiniModalVariant;
  title?: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

/* ──────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────── */
const ICON_MAP: Record<MiniModalVariant, React.ReactNode> = {
  info: <Info className="w-5 h-5 text-blue-500" />,
  success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
};

const ICON_BG: Record<MiniModalVariant, string> = {
  info: 'bg-blue-50 border-blue-200',
  success: 'bg-emerald-50 border-emerald-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-amber-50 border-amber-200',
};

const CONFIRM_BTN: Record<MiniModalVariant, string> = {
  info: 'bg-primary hover:bg-primary-hover',
  success: 'bg-emerald-600 hover:bg-emerald-500',
  error: 'bg-red-600 hover:bg-red-500',
  warning: 'bg-amber-500 hover:bg-amber-400',
};

/* Shared backdrop + card wrapper */
function ModalShell({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onClose}
      />
      {/* Card */}
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-xl border border-border animate-in zoom-in-95 fade-in duration-150">
        {children}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   AlertModal — replaces alert()
────────────────────────────────────────────────────────── */
export function AlertModal({ open, variant = 'info', title, message, onClose }: AlertModalProps) {
  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl border ${ICON_BG[variant]} shrink-0`}>
            {ICON_MAP[variant]}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {title && <p className="text-sm font-semibold text-text-primary mb-1">{title}</p>}
        <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-text-primary text-sm font-medium transition cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────
   ConfirmModal — replaces confirm()
────────────────────────────────────────────────────────── */
export function ConfirmModal({
  open,
  variant = 'warning',
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  return (
    <ModalShell open={open} onClose={onCancel}>
      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl border ${ICON_BG[variant]} shrink-0`}>
            {ICON_MAP[variant]}
          </div>
          <div className="flex-1 min-w-0">
            {title && <p className="text-sm font-semibold text-text-primary mb-0.5">{title}</p>}
            <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-text-primary text-sm font-medium transition cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition cursor-pointer disabled:opacity-50 flex items-center gap-2 ${CONFIRM_BTN[variant]}`}
          >
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────
   PromptModal — replaces prompt()
────────────────────────────────────────────────────────── */
export function PromptModal({
  open,
  variant = 'info',
  title,
  message,
  placeholder = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}: PromptModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleConfirm = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
  };

  return (
    <ModalShell open={open} onClose={onCancel}>
      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl border ${ICON_BG[variant]} shrink-0`}>
            {ICON_MAP[variant]}
          </div>
          <div className="flex-1 min-w-0">
            {title && <p className="text-sm font-semibold text-text-primary mb-0.5">{title}</p>}
            <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-xl border border-border text-sm text-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition mb-4"
        />
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-text-primary text-sm font-medium transition cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !value.trim()}
            className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition cursor-pointer disabled:opacity-50 flex items-center gap-2 ${CONFIRM_BTN[variant]}`}
          >
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
