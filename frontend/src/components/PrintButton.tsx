'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined') window.print();
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer"
    >
      <Printer className="w-3.5 h-3.5" />
      <span>Print or Save PDF</span>
    </button>
  );
}

