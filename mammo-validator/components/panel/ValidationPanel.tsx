'use client';

import { Bot, Check, PenLine } from 'lucide-react';
import { Kbd } from '@/components/ui/Button';
import { ToneBadge } from '@/components/ui/Badge';
import { biradsAuditLabel, biradsDescriptor, toneForLabel } from '@/lib/taxonomy';
import { RADIOLOGIST } from '@/lib/config';
import {
  selectActiveCase,
  selectDecisionFor,
  useWorkbenchStore,
} from '@/store/workbench-store';
import type { BiRadsGrade, ValidationRecord } from '@/lib/types';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500">Model confidence</span>
        <span className="font-mono text-slate-300">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TopCandidates({
  probabilities,
}: {
  probabilities: Record<BiRadsGrade, number>;
}) {
  const top = Object.entries(probabilities)
    .filter(([, value]) => value >= 0.02)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const max = top[0]?.[1] ?? 1;
  return (
    <ul className="space-y-1">
      {top.map(([grade, value]) => (
        <li key={grade} className="flex items-center gap-2 text-[11px]">
          <span className="w-12 shrink-0 font-mono text-slate-400">
            {biradsDescriptor(grade as BiRadsGrade).label}
          </span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-slate-400/80"
              style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right font-mono text-slate-500">
            {Math.round(value * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function DecisionSummary({ record }: { record: ValidationRecord }) {
  const tone = toneForLabel(record.finalLabel);
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Your decision
        </span>
        <ToneBadge tone={record.status === 'APPROVED' ? 'positive' : 'watch'}>
          {record.status === 'APPROVED' ? 'APPROVED' : 'RELABELED'}
        </ToneBadge>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ToneBadge tone={tone}>{record.finalLabel}</ToneBadge>
        {record.status === 'APPROVED' ? (
          <span className="text-xs text-slate-400">matches AI label</span>
        ) : null}
      </div>
      {record.notes ? (
        <p className="mt-2 border-l-2 border-slate-600 pl-2 text-xs italic text-slate-400">
          “{record.notes}”
        </p>
      ) : null}
      <p className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
        <span>
          {RADIOLOGIST.id} · {formatTime(record.timestamp)}
        </span>
        <span>
          original: <span className="text-slate-500">{record.originalLabel}</span>
        </span>
      </p>
    </div>
  );
}

export function ValidationPanel() {
  const active = useWorkbenchStore(selectActiveCase);
  const decision = useWorkbenchStore((state) =>
    active ? selectDecisionFor(state, active.imageId) : undefined
  );
  const isPending = useWorkbenchStore((state) =>
    active ? state.syncByImageId[active.imageId] === 'pending' : false
  );
  const openRelabel = useWorkbenchStore((state) => state.openRelabel);
  const approveActive = useWorkbenchStore((state) => state.approveActive);

  if (!active) return null;

  const descriptor = biradsDescriptor(active.ai.biradsGrade);
  const approved = decision?.status === 'APPROVED';

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900/40 xl:w-96">
      <div className="space-y-5 p-4">
        {/* ---------- Current AI label ---------- */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Bot className="size-4 text-sky-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Current AI label
            </h2>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <ToneBadge tone={descriptor.tone} className="text-sm">
                {descriptor.label}
              </ToneBadge>
            </div>
            <p className="mt-1.5 text-[13px] font-medium text-slate-200">
              {descriptor.title}
              {descriptor.grade.startsWith('4') ? (
                <span className="text-slate-400">
                  {descriptor.tone === 'critical'
                    ? ' — high suspicion'
                    : descriptor.grade === '4A'
                      ? ' — low suspicion'
                      : ' — moderate suspicion'}
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              {descriptor.description}
            </p>

            <div className="mt-3 space-y-3">
              <ConfidenceMeter value={active.ai.confidence} />
              <TopCandidates probabilities={active.ai.gradeProbabilities} />
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-[10px] text-slate-600">
              <span>
                {active.ai.model} · {active.ai.modelVersion}
              </span>
              <span className="font-mono">{active.imageId}</span>
            </div>
          </div>
        </section>

        {/* ---------- Findings ---------- */}
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            AI findings
          </h2>
          {active.ai.findings.length === 0 ? (
            <p className="text-xs text-slate-600">No findings reported.</p>
          ) : (
            <ul className="space-y-1.5">
              {active.ai.findings.map((finding) => (
                <li
                  key={finding.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium capitalize text-slate-200">
                      {finding.kind.replace('-', ' ')}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {finding.location}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {finding.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- Decision status ---------- */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Radiologist decision
          </h2>

          {decision ? (
            <DecisionSummary record={decision} />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-center text-[11px] text-slate-600">
              Awaiting your review — approve or relabel below
            </p>
          )}

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => void approveActive()}
              disabled={isPending}
              className={[
                'inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-bold shadow-lg transition-colors',
                approved
                  ? 'bg-emerald-600/80 text-emerald-50 hover:bg-emerald-500'
                  : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400',
                isPending ? 'cursor-wait opacity-70' : 'active:translate-y-px',
              ].join(' ')}
            >
              <Check className="size-4" strokeWidth={3} />
              {isPending
                ? 'Saving…'
                : approved
                  ? 'Approve (update)'
                  : 'Approve AI label'}
              <Kbd>A</Kbd>
            </button>

            <button
              type="button"
              onClick={openRelabel}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800/60 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-700/70"
            >
              <PenLine className="size-4" />
              Relabel image
              <Kbd>R</Kbd>
            </button>
          </div>

          <p className="text-[10px] leading-relaxed text-slate-600">
            Decisions are POSTed to <code>/api/validation</code> in the payload
            format of the spec and recorded in the demo session log.
          </p>
        </section>
      </div>
    </aside>
  );
}

