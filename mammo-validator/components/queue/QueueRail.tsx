'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Flag,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react';
import { useWorkbenchStore } from '@/store/workbench-store';
import { usePatientGroups } from '@/hooks/usePatientGroups';
import type { PatientGroup } from '@/hooks/usePatientGroups';
import type { StudyCase, SyncState, ValidationRecord } from '@/lib/types';

type GroupReviewStatus = 'awaiting' | 'approved' | 'relabelled' | 'saving';

type ListFilter = 'all' | 'awaiting' | 'approved' | 'relabelled';

function groupStatus(
  group: PatientGroup,
  recordByImageId: Record<string, ValidationRecord>,
  syncByImageId: Record<string, SyncState>,
): GroupReviewStatus {
  for (const c of group.cases) {
    if (syncByImageId[c.imageId] === 'pending') return 'saving';
  }
  for (const c of group.cases) {
    const rec = recordByImageId[c.imageId];
    if (rec?.status === 'APPROVED') return 'approved';
    if (rec?.status === 'RELABELED') return 'relabelled';
  }
  return 'awaiting';
}

const STATUS_STYLES: Record<GroupReviewStatus, string> = {
  awaiting:
    'bg-white/5 text-slate-400 ring-white/10',
  approved:
    'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30',
  relabelled:
    'bg-amber-500/10 text-amber-300 ring-amber-400/30',
  saving:
    'bg-sky-500/10 text-sky-300 ring-sky-400/30',
};

function StatusChip({ status }: { status: GroupReviewStatus }) {
  const label =
    status === 'awaiting'
      ? 'Pending'
      : status === 'approved'
        ? 'Approved'
        : status === 'relabelled'
          ? 'Relabeled'
          : 'Saving…';
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
        STATUS_STYLES[status],
      ].join(' ')}
    >
      {status === 'saving' ? (
        <LoaderCircle className="size-2.5 animate-spin" />
      ) : null}
      {label}
    </span>
  );
}

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
  status,
  forceExpand,
  recordByImageId,
  syncByImageId,
  goToIndex,
}: {
  group: PatientGroup;
  activeIndex: number;
  status: GroupReviewStatus;
  forceExpand: boolean;
  recordByImageId: Record<string, ValidationRecord>;
  syncByImageId: Record<string, SyncState>;
  goToIndex: (index: number) => void;
}) {
  const isActiveGroup =
    activeIndex >= group.startIndex && activeIndex <= group.endIndex;
  const [isExpanded, setIsExpanded] = useState(isActiveGroup);

  useEffect(() => {
    if (isActiveGroup || forceExpand) setIsExpanded(true);
  }, [isActiveGroup, forceExpand]);

  const shortId = group.patient.id.length > 12
    ? `${group.patient.id.slice(0, 12)}…`
    : group.patient.id;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        title={group.patient.id}
        className={[
          'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
          isActiveGroup
            ? 'border-l-2 border-sky-400 bg-sky-500/15 pl-1.5 ring-1 ring-inset ring-sky-400/25'
            : 'border-l-2 border-transparent hover:bg-white/[0.03]',
        ].join(' ')}
      >
        <ChevronDown
          className={`size-4 shrink-0 text-slate-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
        />
        <div className="min-w-0 flex-1">
          <div
            className={[
              'truncate font-mono text-xs font-semibold',
              isActiveGroup ? 'text-sky-300' : 'text-slate-200',
            ].join(' ')}
          >
            {shortId}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            {group.patient.sex} · {group.patient.ageAtStudy ?? '—'}y
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <StatusChip status={status} />
            <span className="text-[10px] text-slate-600">
              {group.cases.length} views
            </span>
          </div>
        </div>
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

/** Left-hand worklist: searchable + filterable patient groups with per-view previews. */
export function QueueRail() {
  const cases = useWorkbenchStore((state) => state.cases);
  const activeIndex = useWorkbenchStore((state) => state.activeIndex);
  const recordByImageId = useWorkbenchStore((state) => state.recordByImageId);
  const syncByImageId = useWorkbenchStore((state) => state.syncByImageId);
  const goToIndex = useWorkbenchStore((state) => state.goToIndex);
  const patientGroups = usePatientGroups(cases);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');
  const needle = query.trim().toLowerCase();

  // One status pass over all groups, recomputed only when inputs change.
  const groupStatuses = useMemo(
    () =>
      Object.fromEntries(
        patientGroups.map((group) => [
          group.patientId,
          groupStatus(group, recordByImageId, syncByImageId),
        ]),
      ) as Record<string, GroupReviewStatus>,
    [patientGroups, recordByImageId, syncByImageId],
  );

  const visibleGroups = patientGroups.filter((group) => {
    const matchesQuery =
      !needle || group.patient.id.toLowerCase().includes(needle);
    const matchesFilter =
      filter === 'all' || groupStatuses[group.patientId] === filter;
    return matchesQuery && matchesFilter;
  });

  const FILTERS: Array<{ key: ListFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'awaiting', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'relabelled', label: 'Relabeled' },
  ];

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/70 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <span>Patients · {patientGroups.length}</span>
        <span className="font-mono text-[10px] normal-case text-slate-600">
          {cases.length} views
        </span>
      </div>

      {/* Review-status filter */}
      <div className="flex items-center gap-0.5 border-b border-slate-800/70 px-2 py-1.5">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={[
              'flex-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors',
              filter === key
                ? 'bg-sky-500/15 text-sky-300'
                : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
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

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {cases.length === 0 ? (
          <p className="px-1 text-xs text-slate-600">Empty worklist</p>
        ) : visibleGroups.length === 0 ? (
          <p className="px-1 text-xs text-slate-600">
            {needle
              ? 'No patient matches that ID.'
              : 'No patients match this filter.'}
          </p>
        ) : (
          <>
            {visibleGroups.map((group) => (
              <PatientGroupItem
                key={group.patientId}
                group={group}
                activeIndex={activeIndex}
                status={groupStatuses[group.patientId]}
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
