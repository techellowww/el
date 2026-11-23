import { notFound } from "next/navigation";
import { getInvoiceByToken } from "@/lib/server/invoiceService";
import { PrintButton } from "@/components/PrintButton";
import { ShieldCheck } from "lucide-react";

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let invoice: any = null;
  try {
    invoice = await getInvoiceByToken(token);
  } catch (err) {
    notFound();
  }

  const isPaid = invoice.status === "PAID";
  const isVoid = invoice.status === "VOID";

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 py-8 px-4 sm:px-6 lg:px-8 font-sans antialiased print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Control Bar (Hidden when printing) */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Secure Client Invoice Link</span>
            <span className="sm:hidden">Secure Link</span>
          </div>
          <PrintButton />
        </div>

        {/* Invoice Paper Document */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-8 relative overflow-hidden print:border-none print:shadow-none print:p-0">
          {/* PAID STAMP WATERMARK */}
          {isPaid && (
            <div className="absolute top-12 right-10 rotate-[-12deg] pointer-events-none select-none opacity-90 border-4 border-emerald-600 text-emerald-600 px-6 py-2 rounded-xl text-3xl font-black tracking-widest uppercase">
              PAID
            </div>
          )}

          {isVoid && (
            <div className="absolute top-12 right-10 rotate-[-12deg] pointer-events-none select-none opacity-90 border-4 border-red-600 text-red-600 px-6 py-2 rounded-xl text-3xl font-black tracking-widest uppercase">
              VOIDED
            </div>
          )}

          {/* Header with Agency Branding & Invoice Meta */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-slate-200 pb-8">
            <div className="space-y-3">
              {invoice.logoSnapshotUrl || invoice.account?.logoUrl ? (
                <img
                  src={invoice.logoSnapshotUrl || invoice.account?.logoUrl}
                  alt={invoice.account?.name}
                  className="max-h-12 max-w-[200px] object-contain"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-lg">
                  {invoice.account?.name?.charAt(0) || "A"}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-slate-900">{invoice.account?.name}</h1>
                <p className="text-xs text-slate-500">Website & Digital Engineering</p>
              </div>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">INVOICE</span>
              <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
                {invoice.invoiceNumberDisplay || "DRAFT"}
              </div>
              <div className="text-xs text-slate-500 pt-1 space-y-0.5">
                <div>
                  Issued:{" "}
                  <span className="font-medium text-slate-700">
                    {invoice.sentAt ? new Date(invoice.sentAt).toLocaleDateString() : new Date().toLocaleDateString()}
                  </span>
                </div>
                <div>
                  Due Date:{" "}
                  <span className="font-medium text-slate-700">
                    {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "Due upon receipt"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Client Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div>
              <span className="font-semibold uppercase tracking-wider text-slate-400 block mb-1">Billed To</span>
              <div className="text-sm font-bold text-slate-900">{invoice.client?.name}</div>
              {invoice.client?.company && <div className="text-slate-600">{invoice.client.company}</div>}
              <div className="text-slate-500">{invoice.client?.email}</div>
              {invoice.client?.phone && <div className="text-slate-500">{invoice.client.phone}</div>}
            </div>

            <div className="text-left sm:text-right">
              <span className="font-semibold uppercase tracking-wider text-slate-400 block mb-1">Status</span>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  isPaid
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : isVoid
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                {invoice.status}
              </span>
              {isPaid && invoice.paidAt && (
                <p className="text-[11px] text-emerald-700 mt-1">Paid on {new Date(invoice.paidAt).toLocaleDateString()}</p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-0">Description</th>
                    <th className="py-2.5 px-3 text-center">Qty / Hrs</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-0 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {invoice.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-3 px-0 font-medium text-slate-900">{item.description}</td>
                      <td className="py-3 px-3 text-center font-mono">{item.quantity}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        ${(item.unitPriceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-0 text-right font-mono font-semibold text-slate-900">
                        ${(item.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="flex justify-end pt-4 border-t border-slate-200">
              <div className="w-64 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono font-medium">
                    ${(invoice.subtotalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {invoice.taxCents > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax</span>
                    <span className="font-mono font-medium">
                      ${(invoice.taxCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t-2 border-slate-900">
                  <span>Total Due</span>
                  <span className="font-mono text-blue-600">
                    ${(invoice.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Payment Instructions */}
          {invoice.notes && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <span className="font-semibold text-slate-700 block">Notes & Payment Instructions:</span>
              <p className="text-slate-600 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="pt-6 border-t border-slate-100 text-center text-[11px] text-slate-400">
            Thank you for working with {invoice.account?.name}! Please remit payment according to your agreed terms.
          </div>
        </div>
      </div>
    </div>
  );
}

