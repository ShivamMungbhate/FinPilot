import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/AuthContext';
import { AuthGuard } from '../components/AuthGuard';

export const metadata: Metadata = {
  title: 'FinPilot | Freelancer Invoicing & Policy Engine',
  description: 'AI-assisted, policy-governed freelance billing application with PayPal invoicing integration and verified payment webhooks.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen flex flex-col">
        <AuthProvider>
          <AuthGuard>
            <main className="flex-1">{children}</main>
          </AuthGuard>
        </AuthProvider>
        <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <strong>FinPilot</strong> &copy; {new Date().getFullYear()} &bull; Licensed under MIT License
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>Policy-Governed Freelance Billing</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
