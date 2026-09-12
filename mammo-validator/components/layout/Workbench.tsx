'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
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
          <RefreshCw className="size-3.5" /> Retry
        </button>
      ) : null}
    </div>
  );
}

/** Root client layout for the validation session. */
export function Workbench() {
  const loadCases = useWorkbenchStore((state) => state.loadCases);
  const isLoading = useWorkbenchStore((state) => state.isLoadingCases);
  const casesError = useWorkbenchStore((state) => state.casesError);
  const caseCount = useWorkbenchStore((state) => state.cases.length);
  const active = useWorkbenchStore(selectActiveCase);
  const reviewer = useWorkbenchStore((state) => state.reviewer);
  const restoreReviewer = useWorkbenchStore((state) => state.restoreReviewer);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreReviewer();
    setReady(true);
  }, [restoreReviewer]);

  useValidationShortcuts();

  useEffect(() => {
    if (reviewer !== null) {
      void loadCases();
    }
  }, [loadCases, reviewer]);

  if (!ready) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-950 p-8 text-slate-200 antialiased">
        <span className="size-8 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
        <p className="text-sm font-semibold text-slate-200">
          Preparing workbench…
        </p>
      </div>
    );
  }

  if (reviewer === null) {
    return <ReviewerSetup />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200 antialiased">
      <PatientHeader />

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
              title="Loading worklist…"
              hint="Fetching cases and AI predictions from /api/cases."
            />
          ) : casesError ? (
            <CenterMessage
              icon="error"
              title="Could not load the worklist"
              hint={casesError}
              action={() => void loadCases()}
            />
          ) : (
            <CenterMessage
              icon="empty"
              title="No cases available"
              hint={`The demo worklist contains no cases${
                caseCount === 0 ? ' (0 items)' : ''
              }. Run the sample-data generator or check /api/cases.`}
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
