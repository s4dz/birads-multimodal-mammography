'use client';

import { Bot, Check, PenLine } from 'lucide-react';
import { Kbd } from '@/components/ui/Button';
import { ToneBadge } from '@/components/ui/Badge';
import {
  biradsDescriptor,
  classSummary,
  toneForClass,
  toneForLabel,
} from '@/lib/taxonomy';
import {
  selectActiveCase,
  selectDecisionFor,
  useWorkbenchStore,
} from '@/store/workbench-store';
import type { AiClassLabel, ValidationRecord } from '@/lib/types';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function prettyLabel(label: string): string {
  return label.replace(' — ', ' · ');
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-600">Model confidence</span>
        <span className="font-mono text-slate-400">{pct}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-600 to-cyan-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ClassCandidates({
  probabilities,
}: {
  probabilities: { normal: number; benignLeaning: number; suspicious: number };
}) {
  const rows = [
    { index: 0 as const, label: 'Normal', range: 'BI-RADS 1', value: probabilities.normal },
    { index: 1 as const, label: 'Benign-leaning', range: 'BI-RADS 2-3', value: probabilities.benignLeaning },
    { index: 2 as const, label: 'Suspicious', range: 'BI-RADS 4-5', value: probabilities.suspicious },
  ].sort((a, b) => b.value - a.value);
  const max = rows[0]?.value ?? 1;
  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.index} className="flex items-center gap-2 text-[10px]">
          <span className="min-w-0 truncate font-mono text-slate-400">
            {row.label} <span className="text-slate-600">({row.range})</span>
          </span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-950 ring-1 ring-inset ring-white/5">
            <span
              className={[
                'block h-full rounded-full',
                row.value === max
                  ? 'bg-sky-500/70'
                  : 'bg-white/15',
              ].join(' ')}
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right font-mono text-slate-500">
            {Math.round(row.value * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function DecisionSummary({
  record,
  prediction = null,
}: {
  record: ValidationRecord;
  prediction?: AiClassLabel | null;
}) {
  const tone = toneForLabel(record.finalLabel);
  const isApproved = record.status === 'APPROVED';
  return (
    <div
      className={[
        'rounded-lg border p-3',
        isApproved
          ? 'border-emerald-700/50 bg-emerald-950/30'
          : 'border-amber-700/50 bg-amber-950/20',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Your decision
        </span>
        <span
          className={[
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset',
            isApproved
              ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30'
              : 'bg-amber-500/10 text-amber-300 ring-amber-400/30',
          ].join(' ')}
        >
          {isApproved ? 'Currently approved' : 'Relabeled'}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <ToneBadge tone={tone} className="px-3 py-1 text-sm">
          {prettyLabel(record.finalLabel)}
        </ToneBadge>
        {isApproved ? (
          <span className="text-xs text-slate-500">matches AI label</span>
        ) : null}
      </div>
      {!isApproved ? (
        <div className="mt-2 border-t border-slate-800 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            AI originally predicted
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {prediction ? (
              <>
                <ToneBadge
                  tone={toneForClass(prediction.index)}
                  className="px-2 py-0.5 text-xs"
                >
                  {prediction.name}
                </ToneBadge>
                <span className="min-w-0 text-[11px] text-slate-400">
                  {prediction.range}
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-300">
                {record.originalLabel}
              </span>
            )}
          </div>
        </div>
      ) : null}
      {record.notes ? (
        <p className="mt-2 border-l-2 border-slate-600 pl-2 text-xs italic text-slate-400">
          “{record.notes}”
        </p>
      ) : null}
      <p className="mt-2 text-[10px] text-slate-600">
        {record.radiologistId || '—'} · {formatTime(record.timestamp)}
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
  const predictedClass = active.ai.predictedClass;
  const approved = decision?.status === 'APPROVED';
  const aiPct = Math.round(active.ai.confidence * 100);

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900/40 xl:w-96">
      <div className="space-y-5 p-4">
        {/* ---------- AI assessment ---------- */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Bot className="size-4 text-sky-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              AI assessment
            </h2>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <ToneBadge
                tone={toneForClass(predictedClass.index)}
                className="px-3.5 py-1.5 text-2xl"
              >
                {predictedClass.name}
              </ToneBadge>
            </div>
            <p className="mt-1.5 text-[13px] font-medium text-slate-200">
              {predictedClass.range}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              {classSummary(predictedClass.index)}
            </p>

            <div className="mt-3 space-y-2.5">
              <ConfidenceMeter value={active.ai.confidence} />
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Alternative class probabilities
                </p>
                <ClassCandidates probabilities={active.ai.classProbabilities} />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[10px] text-slate-600">
              <span className="truncate">
                {active.ai.model} · {active.ai.modelVersion}
              </span>
              <span
                className="max-w-[9rem] truncate font-mono"
                title={active.imageId}
              >
                {active.imageId}
              </span>
            </div>
          </div>
        </section>

        {/* ---------- Findings ---------- */}
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            AI findings
          </h2>
          {active.ai.findings.length === 0 ? (
            <p className="text-[11px] text-slate-600">None detected</p>
          ) : (
            <ul className="space-y-1.5">
              {active.ai.findings.map((finding) => {
                const origin = finding.originalClass;
                const model = finding.modelClass;
                const disagreement = Boolean(origin && model);
                return (
                  <li
                    key={finding.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium capitalize text-slate-200">
                        {finding.kind.replace('-', ' ')}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {finding.location === 'See full image scans'
                          ? 'View full study'
                          : finding.location}
                      </span>
                    </div>
                    {disagreement ? (
                      <div className="mt-1.5 space-y-1 border-t border-slate-800/70 pt-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
                          Label disagreement detected
                        </p>
                        <div>
                          <p className="text-[10px] text-slate-500">
                            Original label
                          </p>
                          <p className="text-[11px] font-medium text-slate-200">
                            {origin!.name}{' '}
                            <span className="text-slate-400">
                              ({origin!.range})
                            </span>
                            {origin!.grade ? (
                              <span className="ml-1 font-mono text-[10px] text-slate-500">
                                · VinDr: {origin!.grade}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">
                            Model prediction
                          </p>
                          <p className="text-[11px] font-medium text-slate-100">
                            {model!.name}{' '}
                            <span className="text-slate-400">
                              ({model!.range})
                            </span>
                          </p>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-slate-500">
                            Model confidence
                          </span>
                          <span className="font-mono text-[11px] text-slate-300">
                            {Math.round(finding.probability * 100)}%
                          </span>
                        </div>
                        {typeof finding.originalConfidence === 'number' ? (
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[10px] text-slate-600">
                              Original-label confidence
                            </span>
                            <span className="font-mono text-[11px] text-slate-600">
                              {Math.round(finding.originalConfidence * 100)}%
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                        {finding.description}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------- Radiologist decision ---------- */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Radiologist decision
          </h2>

          {/* AI suggestion (informational recap) */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              AI suggestion
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <ToneBadge
                tone={toneForClass(predictedClass.index)}
                className="px-2 py-0.5 text-xs"
              >
                {predictedClass.name}
              </ToneBadge>
              <span className="min-w-0 truncate text-[11px] text-slate-400">
                {predictedClass.range}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-600">
                {aiPct}% confidence
              </span>
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Your decision */}
          {decision ? (
            <DecisionSummary record={decision} prediction={predictedClass} />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-700/60 bg-slate-900/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Your decision
              </p>
              <div className="mt-1">
                <span className="text-[11px] font-medium text-slate-300">
                  Pending
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 pt-1">
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
                  ? 'Update decision'
                  : decision
                    ? `Change to ${descriptor.label}`
                    : `Approve ${descriptor.label}`}
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

