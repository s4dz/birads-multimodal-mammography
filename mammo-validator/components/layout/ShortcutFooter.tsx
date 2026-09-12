'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Kbd } from '@/components/ui/Button';
import { useWorkbenchStore } from '@/store/workbench-store';
import { useActivePatientGroup } from '@/hooks/usePatientGroups';

/** Bottom status/shortcut bar. */
export function ShortcutFooter() {
  const cases = useWorkbenchStore((state) => state.cases);
  const activeIndex = useWorkbenchStore((state) => state.activeIndex);
  const goToPrev = useWorkbenchStore((state) => state.goToPrev);
  const goToNext = useWorkbenchStore((state) => state.goToNext);
  const goToPrevPatientGroup = useWorkbenchStore((state) => state.goToPrevPatientGroup);
  const goToNextPatientGroup = useWorkbenchStore((state) => state.goToNextPatientGroup);
  const recordByImageId = useWorkbenchStore((state) => state.recordByImageId);
  const activeGroup = useActivePatientGroup(cases, activeIndex);

  const records = Object.values(recordByImageId);
  const approved = records.filter((r) => r.status === 'APPROVED').length;
  const relabelled = records.filter((r) => r.status === 'RELABELED').length;
  const reviewed = records.length;

  const viewIndex = activeGroup ? activeIndex - activeGroup.startIndex : 0;
  const totalViews = activeGroup ? activeGroup.cases.length : 1;
  const canPrevView = viewIndex > 0;
  const canNextView = viewIndex < totalViews - 1;
  const canPrevPatient = activeGroup && activeGroup.startIndex > 0;
  const canNextPatient = activeGroup && activeGroup.endIndex < cases.length - 1;

  return (
    <footer className="flex h-11 shrink-0 items-center justify-between gap-4 border-t border-slate-800 bg-slate-900/60 px-4">
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="font-semibold text-slate-200">
          {reviewed}/{cases.length || 0} reviewed
        </span>
        <span className="text-emerald-400">{approved} approved</span>
        <span className="text-amber-400">{relabelled} relabeled</span>
        {reviewed > 0 && reviewed === cases.length ? (
          <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
            Worklist complete
          </span>
        ) : null}
      </div>

      <div className="hidden items-center gap-4 text-[11px] text-slate-500 md:flex">
        <span className="inline-flex items-center gap-1.5">
          <Kbd>A</Kbd> approve
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>R</Kbd> relabel
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd> view
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> patient
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPrevPatientGroup}
          disabled={!canPrevPatient}
          className="h-7 px-2 text-xs opacity-60 hover:opacity-100"
          title="Previous patient (↑)"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPrev}
          disabled={!canPrevView}
          className="h-7 px-2 text-xs"
          title="Previous view (←)"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="min-w-20 text-center font-mono text-xs text-slate-400">
          {viewIndex + 1} / {totalViews}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNext}
          disabled={!canNextView}
          className="h-7 px-2 text-xs"
          title="Next view (→)"
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNextPatientGroup}
          disabled={!canNextPatient}
          className="h-7 px-2 text-xs opacity-60 hover:opacity-100"
          title="Next patient (↓)"
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <span className="min-w-14 text-center font-mono text-xs text-slate-400">
          {cases.length ? activeIndex + 1 : 0} / {cases.length}
        </span>
      </div>
    </footer>
  );
}
