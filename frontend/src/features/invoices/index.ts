import type { Invoice, InvoiceItem, InvoiceStatus } from '@/types';

export type { Invoice, InvoiceItem, InvoiceStatus };

export async function fetchInvoices(): Promise<Invoice[]> {
  const res = await fetch('/api/invoices');
  const data = await res.json();
  return data.invoices || data;
}

