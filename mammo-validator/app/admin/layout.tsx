import { AdminNav } from '@/components/admin/AdminNav';

/** `/admin/*` — shared shell for the admin dashboard. */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 text-slate-200 antialiased">
      <AdminNav />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}