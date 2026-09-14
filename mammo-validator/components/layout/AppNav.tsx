'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, ScanSearch, TriangleAlert } from 'lucide-react';
import { APP_CONFIG } from '@/lib/config';

interface NavMode {
  href: string;
  label: string;
  hint: string;
  icon: typeof ScanSearch;
}

const MODES: NavMode[] = [
  {
    href: '/predict',
    label: 'Predict',
    hint: 'Score a single PNG or DICOM mammogram with the model',
    icon: ScanSearch,
  },
  {
    href: '/review',
    label: 'Review dataset',
    hint: 'Approve or relabel the AI predictions in the worklist',
    icon: ClipboardCheck,
  },
];

/**
 * Shared top bar.
 *
 * Each mode is its own route (`/predict`, `/review`) so they can be linked,
 * bookmarked and deep-linked — e.g. review mode sends unlabeled images to
 * `/predict?sample=...&from=review`.
 */
export function AppNav() {
  const pathname = usePathname() ?? '';
  const activeMode =
    MODES.find((mode) => pathname.startsWith(mode.href)) ?? MODES[0];
  const ActiveIcon = activeMode.icon;

  return (
    <nav className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-950 px-4">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-sky-500/15 ring-1 ring-inset ring-sky-400/30">
          <ActiveIcon className="size-4 text-sky-300" />
        </span>
        <span className="hidden text-sm font-semibold tracking-tight text-slate-100 sm:inline">
          {APP_CONFIG.name}
        </span>
        <span className="hidden rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 md:inline">
          v{APP_CONFIG.version}
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
        {MODES.map(({ href, label, hint, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={hint}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              ].join(' ')}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          );
        })}
      </div>

      <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-amber-300/80 lg:flex">
        <TriangleAlert className="size-3.5" />
        Research prototype · not for clinical use
      </span>
    </nav>
  );
}