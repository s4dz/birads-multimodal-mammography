'use client';

import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import type { ReviewStatus } from '@/lib/types';

const STYLES: Record<ReviewStatus, string> = {
  not_started: 'bg-slate-500/10 text-slate-400 ring-slate-400/30',
  consensus: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30',
  disagreement: 'bg-rose-500/10 text-rose-300 ring-rose-400/40',
  finalized: 'bg-teal-500/10 text-teal-300 ring-teal-400/30',
};

const LABELS: Record<ReviewStatus, TranslationKey> = {
  not_started: 'admin.notStarted',
  consensus: 'admin.consensus',
  disagreement: 'admin.disagreement',
  finalized: 'admin.finalized',
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${STYLES[status]}`}
    >
      {t(LABELS[status])}
    </span>
  );
}