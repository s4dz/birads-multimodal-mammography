import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppNav } from '@/components/layout/AppNav';

export const metadata: Metadata = {
  title: 'Mammo QA Workbench — AI Prediction Validation',
  description:
    'Radiologist workbench for validating AI predictions on digital mammography (DICOM + PNG).',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020617',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200 antialiased">
          <AppNav />
          {children}
        </div>
      </body>
    </html>
  );
}
