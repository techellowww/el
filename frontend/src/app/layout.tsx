import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'EL App — Employee Project Time Tracking & Management System',
  description:
    'Production-grade employee project time tracking, working-hour management, project monitoring, automated reporting, and administrative control.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-slate-950 text-slate-100 antialiased" suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col font-sans bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white"
        suppressHydrationWarning
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
