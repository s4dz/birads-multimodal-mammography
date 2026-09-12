'use client';

import { useState } from 'react';
import { Activity, CalendarDays, ScanLine, UserRound, ChevronLeft, ChevronRight, LoaderCircle, LogOut } from 'lucide-react';
import { APP_CONFIG } from '@/lib/config';
import { useWorkbenchStore } from '@/store/workbench-store';
import { useActivePatientGroup } from '@/hooks/usePatientGroups';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { ValidationRecord } from '@/lib/types';

function formatStudyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function ReviewStateChip({
  record,
  pending,
}: {
  record: ValidationRecord | undefined;
  pending: boolean;
}) {
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300 ring-1 ring-inset ring-sky-400/30">
        <LoaderCircle className="size-2.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (!record) return null;
  if (record.status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
        Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-400/30">
      Relabeled
    </span>
  );
}

/** Top information bar: patient, study date, acquisition view & laterality. */
export function PatientHeader() {
  const cases = useWorkbenchStore((state) => state.cases);
  const activeIndex = useWorkbenchStore((state) => state.activeIndex);
  const goToIndex = useWorkbenchStore((state) => state.goToIndex);
  const reviewer = useWorkbenchStore((state) => state.reviewer);
  const clearReviewer = useWorkbenchStore((state) => state.clearReviewer);
  const recordByImageId = useWorkbenchStore((state) => state.recordByImageId);
  const syncByImageId = useWorkbenchStore((state) => state.syncByImageId);
  const [showSwitchReviewer, setShowSwitchReviewer] = useState(false);
  const active = cases[activeIndex];
  const activeGroup = useActivePatientGroup(cases, activeIndex);
  const activeViewIndex = activeGroup ? activeIndex - activeGroup.startIndex : 0;

  if (!active || !activeGroup) {
    return (
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900/70 px-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="size-2 animate-pulse rounded-full bg-slate-600" />
          Connecting to worklist…
        </div>
      </header>
    );
  }

  const totalViews = activeGroup.cases.length;
  const activeRecord = recordByImageId[active.imageId];
  const activePending = syncByImageId[active.imageId] === 'pending';

  const goToView = (viewIndex: number) => {
    goToIndex(activeGroup.startIndex + viewIndex);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900/70 px-4">
      {/* App identity */}
      <div className="flex items-center gap-2.5 pr-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 shadow">
          <ScanLine className="size-4.5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-tight text-slate-100">
            {APP_CONFIG.name}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            AI Validation Worklist
          </div>
        </div>
      </div>

      <div className="h-7 w-px bg-slate-800" />

      {/* Patient / study */}
      <div className="flex min-w-0 items-center gap-5">
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-2">
            <UserRound className="size-3.5 shrink-0 text-slate-500" />
            <span
              className="truncate font-mono text-sm font-semibold text-slate-100"
              title={active.patient.id}
            >
              {shortId(active.patient.id)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>
              {active.patient.sex}, {active.patient.ageAtStudy ?? '—'}y
            </span>
            <span className="text-slate-700">·</span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3 text-slate-500" />
              {formatStudyDate(active.study.date)}
            </span>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-400 lg:flex">
          <span className="text-[11px] text-slate-500">Acc</span>
          <span className="font-mono text-xs text-slate-300">
            {active.study.accessionNumber}
          </span>
        </div>
      </div>

      <div className="h-7 w-px bg-slate-800" />

      {/* Current view + review progress + view navigation */}
      <div className="flex items-center gap-2.5">
        <span className="flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-2.5 py-1 text-sm font-bold text-indigo-300 ring-1 ring-inset ring-indigo-400/30">
          {active.acquisition.laterality}-
          {active.acquisition.view}
        </span>

        {totalViews > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToView(Math.max(0, activeViewIndex - 1))}
              disabled={activeViewIndex === 0}
              className="p-1 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous view"
            >
              <ChevronLeft className="size-4 text-slate-400" />
            </button>
            <div className="flex items-baseline gap-1 px-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                View
              </span>
              <span className="text-sm font-mono text-slate-300">
                {activeViewIndex + 1} / {totalViews}
              </span>
            </div>
            <button
              type="button"
              onClick={() => goToView(Math.min(totalViews - 1, activeViewIndex + 1))}
              disabled={activeViewIndex === totalViews - 1}
              className="p-1 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next view"
            >
              <ChevronRight className="size-4 text-slate-400" />
            </button>
          </div>
        )}

        <ReviewStateChip record={activeRecord} pending={activePending} />
      </div>

      {/* Technical metadata (de-emphasized) */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] text-slate-700">
          {active.image.type === 'dicom' ? 'DICOM P10' : 'PNG'}
          <span className="hidden xl:inline">
            {` · ${active.image.width}×${active.image.height}`}
          </span>
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 text-right sm:flex">
          <Activity className="size-3.5 text-slate-500" />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-slate-100">
              {reviewer?.name}
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              {reviewer?.id}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSwitchReviewer(true)}
          title="Switch reviewer"
          className="hidden items-center gap-1 rounded-md p-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300 sm:flex"
        >
          <LogOut className="size-3.5" />
          Switch
        </button>
      </div>

      <Modal
        open={showSwitchReviewer}
        onClose={() => setShowSwitchReviewer(false)}
        title="Switch reviewer?"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowSwitchReviewer(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                clearReviewer();
                setShowSwitchReviewer(false);
              }}
            >
              Switch reviewer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-500">
            You are currently reviewing as:
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
            <UserRound className="size-4 text-slate-500" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-200">
                {reviewer?.name}
              </div>
              <div className="font-mono text-[10px] text-slate-500">
                {reviewer?.id} · {reviewer?.specialty}
              </div>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Switching generates a new reviewer ID. It will be stamped on all
            future decisions; already-recorded decisions stay linked to the
            current reviewer and remain saved. You will be returned to the
            setup screen.
          </p>
        </div>
      </Modal>
    </header>
  );
}
