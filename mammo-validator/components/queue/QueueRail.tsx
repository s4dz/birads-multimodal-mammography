'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Flag,
  LoaderCircle,
  Search,
  Users,
  X,
} from 'lucide-react';
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

function ViewItem({
  c,
  i,
  isActive,
  record,
  sync,
  onClick,
}: {
  c: StudyCase;
  i: number;
  isActive: boolean;
  record: ValidationRecord | undefined;
  sync: SyncState | undefined;
  onClick: () => void;
}) {
  return (
    <li>
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
          <span className="font-mono text-[9px] text-slate-600">#{i + 1}</span>
        </div>
      </button>
    </li>
  );
}

function PatientGroupItem({
  group,
  activeIndex,
  forceExpand,
  recordByImageId,
  syncByImageId,
  goToIndex,
}: {
  group: PatientGroup;
  activeIndex: number;
  /** True while a search is active — every match is opened for review. */
  forceExpand: boolean;
  recordByImageId: Record<string, ValidationRecord>;
  syncByImageId: Record<string, SyncState>;
  goToIndex: (index: number) => void;
}) {
  const isActiveGroup =
    activeIndex >= group.startIndex && activeIndex <= group.endIndex;
  // Collapsed by default so the rail stays fast with hundreds of patients.
  const [isExpanded, setIsExpanded] = useState(isActiveGroup);

  // Re-open the patient under review (and any search hit).
  useEffect(() => {
    if (isActiveGroup || forceExpand) setIsExpanded(true);
  }, [isActiveGroup, forceExpand]);

  const completedViews = group.cases.filter(
    (c) => recordByImageId[c.imageId]?.status === 'APPROVED'
  ).length;
  const relabeledViews = group.cases.filter(
    (c) => recordByImageId[c.imageId]?.status === 'RELABELED'
  ).length;
  const pendingViews = group.cases.filter(
    (c) => syncByImageId[c.imageId] === 'pending'
  ).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        title={group.patient.id}
        className={[
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
          isActiveGroup ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]',
        ].join(' ')}
      >
        <ChevronDown
          className={`size-4 shrink-0 text-slate-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
        />
        <Users className="size-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs font-medium text-slate-200">
              {group.patient.id}
            </span>
            <span className="shrink-0 text-[10px] text-slate-500">
              {group.patient.sex}, {group.patient.ageAtStudy ?? '—'}y
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <span className="flex items-center gap-1">
              <span
                className={`size-1.5 rounded-full ${completedViews > 0 ? 'bg-emerald-500' : 'bg-slate-700'}`}
              />
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
                <span className="size-1.5 animate-pulse rounded-full bg-sky-500" />
                {pendingViews} pending
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 font-mono text-[9px] text-slate-600">
          {group.cases.length} views
        </span>
      </button>

      {isExpanded && (
        <ol className="ml-2 mt-1 flex flex-col gap-1 border-l border-slate-800/50 pl-2">
          {group.cases.map((c, i) => {
            const globalIndex = group.startIndex + i;
            return (
              <ViewItem
                key={c.imageId}
                c={c}
                i={i}
                isActive={globalIndex === activeIndex}
                record={recordByImageId[c.imageId]}
                sync={syncByImageId[c.imageId]}
                onClick={() => goToIndex(globalIndex)}
              />
            );
          })}
        </ol>
      )}
    </>
  );
}

/** Left-hand worklist: searchable patient groups with per-view previews. */
export function QueueRail() {
  const cases = useWorkbenchStore((state) => state.cases);
  const activeIndex = useWorkbenchStore((state) => state.activeIndex);
  const recordByImageId = useWorkbenchStore((state) => state.recordByImageId);
  const syncByImageId = useWorkbenchStore((state) => state.syncByImageId);
  const goToIndex = useWorkbenchStore((state) => state.goToIndex);
  const patientGroups = usePatientGroups(cases);

  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visibleGroups = needle
    ? patientGroups.filter((group) =>
        group.patient.id.toLowerCase().includes(needle)
      )
    : patientGroups;

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <span>Patients · {patientGroups.length}</span>
        <span className="font-mono text-[10px] normal-case text-slate-600">
          {cases.length} views
        </span>
      </div>

      <div className="border-b border-slate-800/70 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find patient ID…"
            className="h-8 w-full rounded-md border border-slate-700/70 bg-slate-900/70 pl-7 pr-7 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500/60 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              title="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-slate-500 transition-colors hover:text-slate-200"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {needle ? (
          <p className="mt-1.5 px-0.5 text-[10px] text-slate-500">
            {visibleGroups.length} matching patient
            {visibleGroups.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {cases.length === 0 ? (
          <p className="px-1 text-xs text-slate-600">Empty worklist</p>
        ) : visibleGroups.length === 0 ? (
          <p className="px-1 text-xs text-slate-600">
            No patient matches that ID.
          </p>
        ) : (
          <>
            {visibleGroups.map((group) => (
              <PatientGroupItem
                key={group.patientId}
                group={group}
                activeIndex={activeIndex}
                forceExpand={Boolean(needle)}
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
