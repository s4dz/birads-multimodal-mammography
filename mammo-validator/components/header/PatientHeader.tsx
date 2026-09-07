'use client';

import { Activity, CalendarDays, ScanLine, UserRound } from 'lucide-react';
import { APP_CONFIG, RADIOLOGIST } from '@/lib/config';
import { selectActiveCase, useWorkbenchStore } from '@/store/workbench-store';
import { NeutralBadge } from '@/components/ui/Badge';

function formatStudyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Top information bar: patient, study date, acquisition view & laterality. */
export function PatientHeader() {
  const active = useWorkbenchStore(selectActiveCase);

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

      {active ? (
        <>
          {/* Patient / study */}
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex items-center gap-2">
              <UserRound className="size-3.5 shrink-0 text-slate-500" />
              <span className="font-mono text-sm font-semibold text-slate-100">
                {active.patient.id}
              </span>
              <span className="text-xs text-slate-500">
                F, {active.patient.ageAtStudy ?? '—'}y
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CalendarDays className="size-3.5 text-slate-500" />
              {formatStudyDate(active.study.date)}
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="text-[11px] text-slate-500">Acc</span>
              <span className="font-mono text-xs text-slate-300">
                {active.study.accessionNumber}
              </span>
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800" />

          {/* Acquisition + format */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-2.5 py-1 text-sm font-bold text-indigo-300 ring-1 ring-inset ring-indigo-400/30">
              {active.acquisition.laterality}-
              {active.acquisition.view}
            </span>
            <NeutralBadge>
              {active.image.type === 'dicom' ? 'DICOM P10' : 'PNG'}
            </NeutralBadge>
            <span className="hidden text-[11px] text-slate-500 xl:block">
              {active.image.width}×{active.image.height}
              {active.image.bitsAllocated ? ` · ${active.image.bitsAllocated}-bit` : ''}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1.5 text-right sm:flex">
              <Activity className="size-3.5 text-slate-500" />
              <div className="leading-tight">
                <div className="text-xs font-semibold text-slate-200">
                  {RADIOLOGIST.name}
                </div>
                <div className="font-mono text-[10px] text-slate-500">
                  {RADIOLOGIST.id}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="size-2 animate-pulse rounded-full bg-slate-600" />
          Connecting to worklist…
        </div>
      )}
    </header>
  );
}
