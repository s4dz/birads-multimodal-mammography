'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Images, Scale, Users } from 'lucide-react';
import { fetchAdminCases, fetchAdminReviews, fetchAdminUsers } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { AdminCaseView, CaseReview } from '@/lib/types';

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-40 items-center justify-center gap-3 text-sm text-slate-500">
      <span>{t('admin.loadError')}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
      >
        {t('admin.retry')}
      </button>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Images;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className={`size-4 ${accent}`} />
        <span className="text-[11px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="mt-2 font-mono text-3xl font-bold text-slate-100">
        {value}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { t } = useTranslation();
  const [cases, setCases] = useState<AdminCaseView[]>([]);
  const [reviews, setReviews] = useState<CaseReview[]>([]);
  const [users, setUsers] = useState<{ active: boolean; role: string }[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [caseList, reviewList, userList] = await Promise.all([
        fetchAdminCases(),
        fetchAdminReviews(false),
        fetchAdminUsers(),
      ]);
      setCases(caseList);
      setReviews(reviewList);
      setUsers(userList);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <LoadError onRetry={() => void load()} />;

  const totalDecisions = cases.reduce((sum, item) => sum + item.decisions, 0);
  const activeRadiologists = users.filter(
    (user) => user.role === 'radiologist' && user.active
  ).length;
  const pending = cases.filter(
    (item) =>
      !item.finalized &&
      (item.reviewStatus === 'consensus' || item.reviewStatus === 'disagreement')
  ).length;
  const disagreements = cases.filter(
    (item) => item.reviewStatus === 'disagreement'
  ).length;
  const finalized = cases.filter((item) => item.finalized).length;
  const recentFinalized = reviews
    .filter((review) => review.finalization)
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard icon={Images} label={t('admin.statCases')} value={cases.length} accent="text-sky-400" />
        <StatCard
          icon={Users}
          label={t('admin.statRadiologists')}
          value={activeRadiologists}
          accent="text-indigo-400"
        />
        <StatCard
          icon={CheckCircle2}
          label={t('admin.statDecisions')}
          value={totalDecisions}
          accent="text-emerald-400"
        />
        <StatCard
          icon={Scale}
          label={t('admin.statPending')}
          value={pending}
          accent="text-amber-400"
        />
        <StatCard
          icon={AlertTriangle}
          label={t('admin.statDisagreements')}
          value={disagreements}
          accent="text-rose-400"
        />
        <StatCard
          icon={CheckCircle2}
          label={t('admin.statFinalized')}
          value={finalized}
          accent="text-teal-400"
        />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {t('admin.recentFinalize')}
          </h2>
          <Link
            href="/admin/reviews"
            className="text-xs font-medium text-sky-400 hover:text-sky-300"
          >
            {t('admin.navReviews')} →
          </Link>
        </div>
        {recentFinalized.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center text-xs text-slate-600">
            {t('admin.noFinalizedYet')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
            {recentFinalized.map((review) => (
              <li
                key={review.imageId}
                className="flex items-center gap-3 bg-slate-900/40 px-4 py-2.5 text-xs"
              >
                <span className="truncate font-mono text-slate-300">
                  {review.imageId}
                </span>
                <span className="ml-auto rounded-full bg-teal-500/10 px-2 py-0.5 font-semibold text-teal-300 ring-1 ring-inset ring-teal-400/30">
                  {review.finalization?.finalLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}