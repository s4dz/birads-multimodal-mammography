'use client';

import { LogIn } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/LanguageProvider';

/**
 * Shown when the backend session is missing/expired (the proxy redirect
 * normally prevents this, but a stale client can still end up here).
 */
export function LoginRequired() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-slate-200 antialiased">
      <span className="flex size-12 items-center justify-center rounded-xl bg-slate-800 ring-1 ring-inset ring-slate-700">
        <LogIn className="size-5 text-sky-400" />
      </span>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-100">
          {t('auth.loginRequiredTitle')}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          {t('auth.loginRequiredHint')}
        </p>
      </div>
      <a
        href="/login?next=/review"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-semibold text-white shadow-lg shadow-sky-950/40 transition-colors hover:bg-sky-400"
      >
        <LogIn className="size-4" />
        {t('auth.goToLogin')}
      </a>
    </div>
  );
}