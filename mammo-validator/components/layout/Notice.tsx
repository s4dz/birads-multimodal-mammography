'use client';

import { useEffect } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import {
  selectActiveCase,
  selectDecisionFor,
  useWorkbenchStore,
  type NoticeKind,
} from '@/store/workbench-store';

const ICONS: Record<NoticeKind, typeof Info> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

const COLOURS: Record<NoticeKind, string> = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  info: 'text-sky-400',
};

/** Transient toast shown when a decision is recorded or sync fails. */
export function Notice() {
  const notice = useWorkbenchStore((state) => state.notice);
  const dismiss = useWorkbenchStore((state) => state.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => dismiss(), 3500);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  if (!notice) return null;
  const Icon = ICONS[notice.kind];

  return (
    <div className="pointer-events-none fixed left-72 right-80 top-16 z-40 flex justify-center px-4 xl:right-96">
      <div
        key={notice.id}
        className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-2.5 text-sm shadow-2xl backdrop-blur"
        role="status"
      >
        <Icon className={`size-4 shrink-0 ${COLOURS[notice.kind]}`} />
        <span className="text-slate-200">{notice.text}</span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notification"
          className="ml-1 rounded p-0.5 text-slate-500 hover:bg-white/5 hover:text-slate-200"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Slim sync progress strip pinned to the bottom edge.
 * Reflects the optimistic-decision + API-sync model in the store.
 */
export function SyncProgressStrip() {
  const active = useWorkbenchStore(selectActiveCase);
  const decision = useWorkbenchStore((state) =>
    active ? selectDecisionFor(state, active.imageId) : undefined
  );
  const pending = useWorkbenchStore((state) =>
    active ? state.syncByImageId[active.imageId] === 'pending' : false
  );
  const syncFailed = useWorkbenchStore((state) =>
    active ? state.syncByImageId[active.imageId] === 'error' : false
  );
  const recordCount = useWorkbenchStore(
    (state) => Object.keys(state.recordByImageId).length
  );
  const syncedCount = useWorkbenchStore(
    (state) =>
      Object.values(state.syncByImageId).filter((s) => s === 'synced').length
  );
  const hasError = useWorkbenchStore((state) =>
    Object.values(state.syncByImageId).some((s) => s === 'error')
  );

  if (!active) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-slate-800 px-4 py-1.5">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">
        Sync
      </span>
      {decision ? (
        pending ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-sky-300">
            <span className="size-2 animate-pulse rounded-full bg-sky-400" />
            Saving {decision.imageId} decision…
          </span>
        ) : syncFailed ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-300">
            <TriangleAlert className="size-3" />
            {decision.imageId} not yet synced — see validation log on the API.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
            <CheckCircle2 className="size-3" />
            {decision.imageId} synced · {recordCount} local / {syncedCount}{' '}
            persisted
          </span>
        )
      ) : (
        <span className="text-[11px] text-slate-600">idle — no decision yet</span>
      )}
      {hasError ? (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-300">
          <TriangleAlert className="size-3" /> 1+ failed sync (retry on next
          action)
        </span>
      ) : null}
    </div>
  );
}
