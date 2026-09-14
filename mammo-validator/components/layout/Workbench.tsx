'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Inbox, RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import { useValidationShortcuts } from '@/hooks/useValidationShortcuts';
import { PatientHeader } from '@/components/header/PatientHeader';
import { QueueRail } from '@/components/queue/QueueRail';
import { ImageViewer } from '@/components/viewer/ImageViewer';
import { ValidationPanel } from '@/components/panel/ValidationPanel';
import { RelabelModal } from '@/components/relabel/RelabelModal';
import { ReviewerSetup } from '@/components/setup/ReviewerSetup';
import { ShortcutFooter } from '@/components/layout/ShortcutFooter';
import { Notice, SyncProgressStrip } from '@/components/layout/Notice';
import {
  selectActiveCase,
  useWorkbenchStore,
} from '@/store/workbench-store';

function CenterMessage({
  icon,
  title,
  hint,
  action,
}: {
  icon: 'loading' | 'error' | 'empty';
  title: string;
  hint?: string;
  action?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {icon === 'loading' ? (
        <span className="size-8 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
      ) : icon === 'error' ? (
        <AlertTriangle className="size-8 text-rose-400" />
      ) : (
        <Inbox className="size-8 text-slate-600" />
      )}
      <div>
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        {hint ? (
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
            {hint}
          </p>
        ) : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={action}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
        >
          <RefreshCw className="size-3.5" /> {t('review.retry')}
        </button>
      ) : null}
    </div>
  );
}

/** Root client layout for the validation session. */
export function Workbench() {
  const { t } = useTranslation();
  const loadCases = useWorkbenchStore((state) => state.loadCases);
  const isLoading = useWorkbenchStore((state) => state.isLoadingCases);
  const casesError = useWorkbenchStore((state) => state.casesError);
  const caseCount = useWorkbenchStore((state) => state.cases.length);
  const cases = useWorkbenchStore((state) => state.cases);
  const recordByImageId = useWorkbenchStore((state) => state.recordByImageId);
  const goToIndex = useWorkbenchStore((state) => state.goToIndex);
  const active = useWorkbenchStore(selectActiveCase);
  const reviewer = useWorkbenchStore((state) => state.reviewer);
  const restoreReviewer = useWorkbenchStore((state) => state.restoreReviewer);
  const hydrateDecisions = useWorkbenchStore((state) => state.hydrateDecisions);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreReviewer();
    setReady(true);
  }, [restoreReviewer]);

  useValidationShortcuts();

  useEffect(() => {
    if (reviewer !== null) {
      void loadCases();
      // Pick up labels approved in /predict during this server session.
      void hydrateDecisions();
    }
  }, [loadCases, hydrateDecisions, reviewer]);

  if (!ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-slate-950 p-8 text-slate-200 antialiased">
        <span className="size-8 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
        <p className="text-sm font-semibold text-slate-200">
          {t('review.preparing')}
        </p>
      </div>
    );
  }

  if (reviewer === null) {
    return <ReviewerSetup />;
  }

  /* Dataset images that still have no AI label (and no decision recorded). */
  const unlabeledPending = cases.filter(
    (c) => c.needsPrediction && !recordByImageId[c.imageId]
  );
  const firstUnlabeledIndex = unlabeledPending.length
    ? cases.findIndex((c) => c.imageId === unlabeledPending[0].imageId)
    : -1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 text-slate-200 antialiased">
      <PatientHeader />

      {unlabeledPending.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/25 bg-amber-500/[0.07] px-4 py-1.5 text-[11px] text-amber-200">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span>
            {unlabeledPending.length === 1
              ? t('review.unlabeledOne')
              : t('review.unlabeledMany', { count: unlabeledPending.length })}
          </span>
          <button
            type="button"
            onClick={() => goToIndex(firstUnlabeledIndex)}
            className="rounded-md bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-100 ring-1 ring-inset ring-amber-400/40 transition-colors hover:bg-amber-500/30"
          >
            {t('review.jumpToFirst')}
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <QueueRail />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {active ? (
            <>
              <ImageViewer key={active.imageId} caseStudy={active} />
              <SyncProgressStrip />
            </>
          ) : isLoading ? (
            <CenterMessage
              icon="loading"
              title={t('review.loadingWorklist')}
              hint={t('review.loadingHint')}
            />
          ) : casesError ? (
            <CenterMessage
              icon="error"
              title={t('review.loadError')}
              hint={casesError}
              action={() => void loadCases()}
            />
          ) : (
            <CenterMessage
              icon="empty"
              title={t('review.emptyTitle')}
              hint={t('review.emptyHint')}
            />
          )}
        </main>

        <ValidationPanel />
      </div>

      <ShortcutFooter />

      <RelabelModal />
      <Notice />
    </div>
  );
}
