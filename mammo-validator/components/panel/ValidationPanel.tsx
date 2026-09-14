'use client';

import Link from 'next/link';
import { Bot, Check, PenLine, ScanSearch } from 'lucide-react';
import { Kbd } from '@/components/ui/Button';
import { ToneBadge } from '@/components/ui/Badge';
import { biradsAuditLabel, biradsDescriptor, toneForLabel } from '@/lib/taxonomy';
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

function prettyLabel(label: string): string {
  return label.replace(' — ', ' · ');
}

type Disagreement = {
  originalGrade: string;
  modelGrade: string;
  confidence: number | null;
  originalConfidence: number | null;
};

function parseDisagreement(description: string): Disagreement | null {
  const original = description.match(
    /Original label is [^(]* \(BI-RADS (\d[A-C]?)\)/i
  );
  const model = description.match(
    /our model predicts [^(]* \(BI-RADS (\d[A-C]?)\)/i
  );
  if (!original || !model) return null;
  const confidence = description.match(/with ([\d.]+)% confidence/i);
  const originalConfidence = description.match(
    /Model self-confidence in original label: ([\d.]+)%/i
  );
  return {
    originalGrade: original[1].toUpperCase(),
    modelGrade: model[1].toUpperCase(),
    confidence: confidence ? Number(confidence[1]) : null,
    originalConfidence: originalConfidence
      ? Number(originalConfidence[1])
      : null,
  };
}

function gradeFromAuditLabel(label: string): BiRadsGrade | null {
  const match = label.match(/BI-RADS\s*(\d[A-C]?)/i);
  if (!match) return null;
  const grade = match[1].toUpperCase() as BiRadsGrade;
  try {
    biradsDescriptor(grade);
  } catch {
    return null;
  }
  return grade;
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
        <li key={grade} className="flex items-center gap-2 text-[10px]">
          <span className="w-14 shrink-0 font-mono text-slate-600">
            {biradsDescriptor(grade as BiRadsGrade).label}
          </span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-950 ring-1 ring-inset ring-white/5">
            <span
              className="block h-full rounded-full bg-white/15"
              style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right font-mono text-slate-600">
            {Math.round(value * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function DecisionSummary({ record }: { record: ValidationRecord }) {
  const tone = toneForLabel(record.finalLabel);
  const isApproved = record.status === 'APPROVED';
  const originalGrade = isApproved
    ? null
    : gradeFromAuditLabel(record.originalLabel);
  const originalDescriptor = originalGrade
    ? biradsDescriptor(originalGrade)
    : null;
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
            {originalDescriptor ? (
              <>
                <ToneBadge
                  tone={originalDescriptor.tone}
                  className="px-2 py-0.5 text-xs"
                >
                  {originalDescriptor.label}
                </ToneBadge>
                <span className="min-w-0 text-[11px] text-slate-400">
                  {originalDescriptor.title}
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

  // Dataset images can reach the worklist without any AI label. Rather than
  // showing a meaningless assessment, hand the image to /predict.
  if (active.needsPrediction) {
    const predictHref =
      `/predict?sample=${encodeURIComponent(active.image.url)}` +
      `&imageId=${encodeURIComponent(active.imageId)}&from=review`;

    return (
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900/40 xl:w-96">
        <div className="space-y-5 p-4">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Bot className="size-4 text-slate-500" />
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                AI assessment
              </h2>
            </div>
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4">
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-400/30">
                Unlabeled
              </span>
              <p className="mt-2 text-sm font-semibold text-slate-200">
                No AI label for this image
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                This dataset image has not been scored yet. Run the model, check
                its assessment, then approve the returned label.
              </p>
              <Link
                href={predictHref}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-500 text-sm font-semibold text-white shadow-lg shadow-sky-950/40 transition-colors hover:bg-sky-400"
              >
                <ScanSearch className="size-4" />
                Predict this label
              </Link>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Radiologist decision
            </h2>
            {decision ? (
              <DecisionSummary record={decision} />
            ) : (
              <p className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-center text-[11px] text-slate-600">
                Predict a label first — you can then approve it
              </p>
            )}
          </section>
        </div>
      </aside>
    );
  }

  const descriptor = biradsDescriptor(active.ai.biradsGrade);
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
              <ToneBadge tone={descriptor.tone} className="px-3.5 py-1.5 text-2xl">
                {descriptor.label}
              </ToneBadge>
            </div>
            <p className="mt-1.5 text-[13px] font-medium text-slate-200">
              {descriptor.title}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              {descriptor.description}
            </p>

            <div className="mt-3 space-y-2.5">
              <ConfidenceMeter value={active.ai.confidence} />
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Alternative BI-RADS probabilities
                </p>
                <TopCandidates probabilities={active.ai.gradeProbabilities} />
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
                const disagreement = parseDisagreement(finding.description);
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
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-slate-500">
                            Original label
                          </span>
                          <span className="font-mono text-[11px] text-slate-300">
                            BI-RADS {disagreement.originalGrade}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-slate-500">
                            Model prediction
                          </span>
                          <span className="font-mono text-[11px] text-slate-100">
                            BI-RADS {disagreement.modelGrade}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-slate-500">
                            Model confidence
                          </span>
                          <span className="font-mono text-[11px] text-slate-300">
                            {disagreement.confidence === null
                              ? '—'
                              : `${disagreement.confidence}%`}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] text-slate-600">
                            Original-label confidence
                          </span>
                          <span className="font-mono text-[11px] text-slate-600">
                            {disagreement.originalConfidence === null
                              ? '—'
                              : `${disagreement.originalConfidence}%`}
                          </span>
                        </div>
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
              <ToneBadge tone={descriptor.tone} className="px-2 py-0.5 text-xs">
                {descriptor.label}
              </ToneBadge>
              <span className="min-w-0 truncate text-[11px] text-slate-400">
                {descriptor.title}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-600">
                {aiPct}% confidence
              </span>
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Your decision */}
          {decision ? (
            <DecisionSummary record={decision} />
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

