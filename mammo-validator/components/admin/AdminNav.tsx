'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Images, Scale, ClipboardList } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { TranslationKey } from '@/lib/i18n/dictionary';

const TABS: {
  href: string;
  labelKey: TranslationKey;
  icon: typeof LayoutDashboard;
}[] = [
  { href: '/admin', labelKey: 'admin.navOverview', icon: LayoutDashboard },
  { href: '/admin/users', labelKey: 'admin.navUsers', icon: Users },
  { href: '/admin/cases', labelKey: 'admin.navCases', icon: Images },
  { href: '/admin/assign', labelKey: 'admin.navAssign', icon: ClipboardList },
  { href: '/admin/reviews', labelKey: 'admin.navReviews', icon: Scale },
];

/** Admin-only secondary navigation (AppNav above is left untouched). */
export function AdminNav() {
  const pathname = usePathname() ?? '';
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950 px-4 py-2">
      {TABS.map(({ href, labelKey, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
            ].join(' ')}
          >
            <Icon className="size-3.5" />
            {t(labelKey)}
          </Link>
        );
      })}
    </div>
  );
}