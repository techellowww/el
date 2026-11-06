import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/AppShell';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'ClientHub — Agency & Client Operations Platform',
  description:
    'Unified operations platform for web agencies and freelancers to manage clients, project deliverables, working hours, proposals, and client communication.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full bg-app-background text-text-primary antialiased ${inter.variable}`} suppressHydrationWarning>
      <body
        className={`min-h-full flex flex-col font-sans ${inter.className} bg-app-background text-text-primary selection:bg-primary selection:text-white`}
        suppressHydrationWarning
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
