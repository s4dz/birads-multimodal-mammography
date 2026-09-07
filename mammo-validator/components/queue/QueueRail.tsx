'use client';

import { CheckCircle2, Flag, LoaderCircle } from 'lucide-react';
import { useWorkbenchStore } from '@/store/workbench-store';
import type { StudyCase, SyncState, ValidationRecord } from '@/lib/types';

function DecisionIcon({
  record,
  sync,
}: {
  record?: ValidationRecord;
  sync?: SyncState;
}) {
  if (sync === 'pending') {
    return <LoaderCircle className="size-3.5 animate-spin text-sky-300" />;
  }
  if (!record) return null;
  if (record.status === 'APPROVED') {
    return <CheckCircle2 className="size-3.5 text-emerald-400" />;
  }
  return <Flag className="size-3.5 text-amber-400" />;
}

function Thumb({ c }: { c: StudyCase }) {
  if (c.image.type === 'png') {
    return (
      <img
        src={c.image.url}
        alt=""
        loading="lazy"
        draggable={false}
        className="h-full w-full object-contain"
      />
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-slate-800 to-slate-950 text-slate-500">
      <span className="font-mono text-[8px] tracking-widest">DICOM</span>
      <span className="flex h-4 w-4 items-center justify-center rounded border border-slate-600 font-mono text-[8px] text-slate-400">
        P10
      </span>
    </div>
  );
}

/** Left-hand vertical worklist with per-case previews & decision markers. */
export function QueueRail() {
  const cases = useWorkbenchStore((state) => state.cases);
  const activeIndex = useWorkbenchStore((state) => state.activeIndex);
  const recordByImageId = useWorkbenchStore((state) => state.recordByImageId);
  const syncByImageId = useWorkbenchStore((state) => state.syncByImageId);
  const goToIndex = useWorkbenchStore((state) => state.goToIndex);

  return (
    <aside className="flex w-40 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
      <div className="border-b border-slate-800/70 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Queue · {cases.length}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {cases.length === 0 ? (
          <p className="px-1 text-xs text-slate-600">Empty worklist</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {cases.map((c, i) => {
              const isActive = i === activeIndex;
              const record = recordByImageId[c.imageId];
              const sync = syncByImageId[c.imageId];
              return (
                <li key={c.imageId}>
                  <button
                    type="button"
                    onClick={() => goToIndex(i)}
                    title={`${c.imageId} — ${c.acquisition.laterality}-${c.acquisition.view}`}
                    className={[
                      'group w-full rounded-lg p-1 text-left transition-colors',
                      isActive
                        ? 'bg-sky-500/10 ring-2 ring-inset ring-sky-400/70'
                        : 'hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    <div className="relative h-16 w-full overflow-hidden rounded-md bg-black">
                      <Thumb c={c} />
                      {record ? (
                        <span className="absolute right-1 top-1 rounded bg-black/60 p-0.5">
                          <DecisionIcon record={record} sync={sync} />
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center justify-between px-0.5">
                      <span
                        className={[
                          'font-mono text-[10px]',
                          isActive ? 'text-sky-300' : 'text-slate-500',
                        ].join(' ')}
                      >
                        {c.acquisition.laterality}-{c.acquisition.view}
                      </span>
                      <span className="font-mono text-[9px] text-slate-600">
                        #{i + 1}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
