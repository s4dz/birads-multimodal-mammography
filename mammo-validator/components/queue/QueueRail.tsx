'use client';

import { useState } from 'react';
import { CheckCircle2, Flag, LoaderCircle, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { useWorkbenchStore } from '@/store/workbench-store';
import { usePatientGroups } from '@/hooks/usePatientGroups';
import type { PatientGroup } from '@/hooks/usePatientGroups';
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

function ViewItem({ c, i, isActive, record, sync, onClick }: {
  c: StudyCase;
  i: number;
  isActive: boolean;
  record: ValidationRecord | undefined;
  sync: SyncState | undefined;
  onClick: () => void;
}) {
  return (
    <li key={c.imageId}>
      <button
        type="button"
        onClick={onClick}
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
}

function PatientGroupItem({ group, groupIndex, activeIndex, recordByImageId, syncByImageId, goToIndex }: {
  group: PatientGroup;
  groupIndex: number;
  activeIndex: number;
  recordByImageId: Record<string, ValidationRecord>;
  syncByImageId: Record<string, SyncState>;
  goToIndex: (index: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isActiveGroup = activeIndex >= group.startIndex && activeIndex <= group.endIndex;
  const hasActiveView = group.cases.some((c, i) => group.startIndex + i === activeIndex);
  const completedViews = group.cases.filter(c => recordByImageId[c.imageId]?.status === 'APPROVED').length;
  const pendingViews = group.cases.filter(c => syncByImageId[c.imageId] === 'pending').length;
  const relabeledViews = group.cases.filter(c => recordByImageId[c.imageId]?.status === 'RELABELED').length;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={[
          'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
          isActiveGroup ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]',
        ].join(' ')}
      >
        <ChevronDown className={`size-4 text-slate-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
        <Users className="size-4 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm font-medium text-slate-200 truncate">
              {group.patient.id}
            </span>
            <span className="text-[10px] text-slate-500">
              {group.patient.sex}, {group.patient.ageAtStudy ?? '—'}y
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <span className="flex items-center gap-1">
              <span className={`size-1.5 rounded-full ${completedViews > 0 ? 'bg-emerald-500' : 'bg-slate-700'}`} />
              {completedViews} approved
            </span>
            {relabeledViews > 0 && (
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {relabeledViews} relabeled
              </span>
            )}
            {pendingViews > 0 && (
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full animate-pulse bg-sky-500" />
                {pendingViews} pending
              </span>
            )}
          </div>
        </div>
        <span className="font-mono text-[9px] text-slate-600">
          {group.cases.length} views
        </span>
      </button>

      {isExpanded && (
        <ol className="ml-2 mt-1 flex flex-col gap-1 border-l border-slate-800/50 pl-2">
          {group.cases.map((c, i) => {
            const globalIndex = group.startIndex + i;
            const isActive = globalIndex === activeIndex;
            const record = recordByImageId[c.imageId];
            const sync = syncByImageId[c.imageId];
            return (
              <ViewItem
                key={c.imageId}
                c={c}
                i={i}
                isActive={isActive}
                record={record}
                sync={sync}
                onClick={() => goToIndex(globalIndex)}
              />
            );
          })}
        </ol>
      )}
    </>
  );
}

/** Left-hand vertical worklist with patient groups & per-view previews. */
export function QueueRail() {
  const cases = useWorkbenchStore((state) => state.cases);
  const activeIndex = useWorkbenchStore((state) => state.activeIndex);
  const recordByImageId = useWorkbenchStore((state) => state.recordByImageId);
  const syncByImageId = useWorkbenchStore((state) => state.syncByImageId);
  const goToIndex = useWorkbenchStore((state) => state.goToIndex);
  const patientGroups = usePatientGroups(cases);

  return (
    <aside className="flex w-40 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
      <div className="border-b border-slate-800/70 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Patients · {patientGroups.length} ({cases.length} views)
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {cases.length === 0 ? (
          <p className="px-1 text-xs text-slate-600">Empty worklist</p>
        ) : (
          <>
            {patientGroups.map((group, groupIndex) => (
              <PatientGroupItem
                key={group.patientId}
                group={group}
                groupIndex={groupIndex}
                activeIndex={activeIndex}
                recordByImageId={recordByImageId}
                syncByImageId={syncByImageId}
                goToIndex={goToIndex}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}