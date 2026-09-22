'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Scale } from 'lucide-react';
import { fetchAdminReviews, finalizeCase } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { CaseReview } from '@/lib/types';

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30',
  RELABELED: 'bg-amber-500/10 text-amber-300 ring-amber-400/30',
  SKIPPED: 'bg-slate-500/10 text-slate-400 ring-slate-400/30',
  PENDING: 'bg-sky-500/10 text-sky-300 ring-sky-400/30',
};

export default function AdminReviewsPage() {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<CaseReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [onlyWithDecisions, setOnlyWithDecisions] = useState(true);
  const [onlyDisagreements, setOnlyDisagreements] = useState(false);
  const [finalizing, setFinalizing] = useState<CaseReview | null>(null);
  const [finalLabel, setFinalLabel] = useState('');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(
    async (withDecisions: boolean) => {
      setLoading(true);
      setError(false);
      try {
        setReviews(await fetchAdminReviews(withDecisions));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(onlyWithDecisions);
  }, [load, onlyWithDecisions]);

  const visible = useMemo(() => {
    if (!onlyDisagreements) return reviews;
    return reviews.filter((review) => review.reviewStatus === 'disagreement');
  }, [reviews, onlyDisagreements]);

  const openFinalize = (review: CaseReview) => {
    setFinalizing(review);
    const fromDecisions = review.decisions.map((decision) => decision.finalLabel);
    setFinalLabel(review.ai.predictedClass.name || fromDecisions[0] || '');
    setRationale('');
  };

  const handleFinalize = async () => {
    if (!finalizing) return;
    setSubmitting(true);
    try {
      await finalizeCase(finalizing.imageId, finalLabel, rationale.trim());
      setToast(`${finalizing.imageId} → ${finalLabel}`);
      window.setTimeout(() => setToast(null), 2500);
      setFinalizing(null);
      await load(onlyWithDecisions);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Finalize failed.');
      window.setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-slate-400">
            <input
              type="checkbox"
              checked={onlyWithDecisions}
              onChange={(event) => setOnlyWithDecisions(event.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
            />
            {t('admin.onlyReviewed')}
          </label>
          <label className="flex items-center gap-1.5 text-slate-400">
            <input
              type="checkbox"
              checked={onlyDisagreements}
              onChange={(event) => setOnlyDisagreements(event.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-rose-500 focus:ring-rose-500"
            />
            {t('admin.onlyDisagreement')}
          </label>
        </div>
        {toast ? (
          <span className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-200">{toast}</span>
        ) : null}
      </div>

      {loading ? (
        <p className="py-10 text-center text-xs text-slate-500">{t('admin.loading')}</p>
      ) : error ? (
        <button type="button" onClick={() => void load(onlyWithDecisions)} className="text-xs text-rose-400 hover:underline">
          {t('admin.loadError')} — {t('admin.retry')}
        </button>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 px-4 py-10 text-center text-xs text-slate-600">
          {t('admin.noReviews')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map((review) => {
            const decisions = review.decisions;
            return (
              <div
                key={review.imageId}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-slate-200" title={review.imageId}>
                      {review.imageId}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {review.acquisition.laterality}-{review.acquisition.view} · {decisions.length} {t('admin.decisionCount')}
                    </div>
                  </div>
                  <StatusBadge status={review.reviewStatus} />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-md bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-300 ring-1 ring-inset ring-sky-400/30">
                    AI · {review.ai.predictedClass.name}{' '}
                    <span className="text-sky-400/70">{review.ai.predictedClass.range}</span>
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {Math.round(review.ai.confidence * 100)}%
                  </span>
                </div>

                <div className="mt-3 space-y-1.5">
                  {decisions.length === 0 ? (
                    <p className="py-2 text-center text-[11px] text-slate-600">{t('admin.noDecisionsYet')}</p>
                  ) : (
                    decisions.map((decision) => (
                      <div
                        key={`${decision.imageId}-${decision.radiologistId}-${decision.timestamp}`}
                        className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-200">
                            {decision.radiologistName || decision.radiologistId}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-600">
                            {decision.timestamp.replace('T', ' ').slice(0, 16)}
                          </div>
                          {decision.notes ? (
                            <div className="mt-1 line-clamp-2 text-[11px] italic text-slate-500">
                              “{decision.notes}”
                            </div>
                          ) : null}
                        </div>
                        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                              STATUS_STYLES[decision.status] ?? STATUS_STYLES.PENDING
                            }`}
                          >
                            {decision.status}
                          </span>
                          {decision.finalLabel ? (
                            <span className="font-mono text-[11px] text-slate-400">
                              {decision.finalLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={review.finalization !== null}
                    leftIcon={<BadgeCheck className="size-3.5" />}
                    onClick={() => openFinalize(review)}
                  >
                    {review.finalization !== null
                      ? `${t('admin.finalized')} · ${review.finalization.finalLabel}`
                      : t('admin.finalize')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Finalize modal */}
      <Modal
        open={finalizing !== null}
        onClose={() => setFinalizing(null)}
        title={
          <span className="flex items-center gap-2">
            <Scale className="size-4 text-teal-400" />
            {t('admin.reviewDetails')}
          </span>
        }
      >
        {finalizing ? (
          <div className="space-y-4">
            <div>
              <p className="break-all font-mono text-xs text-slate-300">{finalizing.imageId}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...new Set(finalizing.decisions.map((d) => d.finalLabel))].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setFinalLabel(label)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-mono transition-colors ${
                      finalLabel === label
                        ? 'border-teal-400 bg-teal-500/10 text-teal-200'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">{t('admin.finalLabel')}</label>
              <input
                value={finalLabel}
                onChange={(event) => setFinalLabel(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">{t('admin.rationale')}</label>
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setFinalizing(null)}>
            {t('admin.cancel')}
          </Button>
          <Button variant="success" loading={submitting} onClick={() => void handleFinalize()}>
            {submitting ? t('common.saving') : t('admin.confirmFinalize')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}