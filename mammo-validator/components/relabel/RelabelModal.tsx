'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToneBadge } from '@/components/ui/Badge';
import {
  BI_RADS_TAXONOMY,
  SIMPLE_TAXONOMY,
  TAXONOMY_MODE_LABELS,
  biradsAuditLabel,
  biradsDescriptor,
  toneClasses,
  toneForLabel,
  type LabelKind,
} from '@/lib/taxonomy';
import type { Tone } from '@/lib/types';
import {
  selectActiveCase,
  useWorkbenchStore,
} from '@/store/workbench-store';

/**
 * Relabel dialog: pick a corrected category (BI-RADS 0–6 or a 3-class triage
 * label) and optionally record a free-text note for the AI team / audit log.
 */
function toneDot(tone: Tone): string {
  return toneClasses(tone).dot;
}

export function RelabelModal() {
  const reviewerId = useWorkbenchStore(
    (state) => state.reviewer?.id ?? ""
  );
  const open = useWorkbenchStore((state) => state.isRelabelOpen);
  const active = useWorkbenchStore(selectActiveCase);
  const closeRelabel = useWorkbenchStore((state) => state.closeRelabel);
  const relabelActive = useWorkbenchStore((state) => state.relabelActive);
  const syncState = useWorkbenchStore((state) =>
    active ? state.syncByImageId[active.imageId] : undefined
  );

  const [mode, setMode] = useState<LabelKind>('birads');
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const originalLabel = useMemo(
    () => (active ? biradsAuditLabel(active.ai.biradsGrade) : ''),
    [active]
  );

  // Reset the form every time the dialog opens for a new review.
  useEffect(() => {
    if (open) {
      setMode('birads');
      setSelected(null);
      setNotes('');
    }
  }, [open]);

  if (!active) return null;

  const busy = syncState === 'pending';

  const selectBirads = (grade: (typeof BI_RADS_TAXONOMY)[number]['grade']) => {
    setSelected(biradsAuditLabel(grade));
  };

  const submit = () => {
    if (!selected) return;
    void relabelActive(selected, notes.trim());
  };

  const previewTone = selected ? toneForLabel(selected) : 'neutral';

  return (
    <Modal
      open={open}
      onClose={closeRelabel}
      title={
        <span className="flex items-center gap-2">
          Relabel patient {active.patient.id}
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {active.acquisition.laterality}-{active.acquisition.view}
          </span>
        </span>
      }
      widthClassName="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={closeRelabel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={!selected || busy}
          >
            {busy ? 'Saving…' : 'Confirm relabel'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Context: what the AI said */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
          <span className="text-slate-500">AI suggestion</span>
          <ToneBadge tone={biradsDescriptor(active.ai.biradsGrade).tone}>
            {originalLabel}
          </ToneBadge>
          <span className="ml-auto text-slate-600">{reviewerId}</span>
        </div>

        {/* Taxonomy switcher */}
        <div className="inline-flex rounded-lg bg-slate-800/70 p-0.5">
          {(Object.keys(TAXONOMY_MODE_LABELS) as LabelKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setMode(kind);
                setSelected(null);
              }}
              className={[
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                mode === kind
                  ? 'bg-slate-950 text-slate-100 shadow'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              {TAXONOMY_MODE_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Category picker ---------- */}
      <div className="mt-4">
        {mode === 'birads' ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {BI_RADS_TAXONOMY.map((d) => {
              const audit = biradsAuditLabel(d.grade);
              const isSelected = selected === audit;
              return (
                <button
                  key={d.grade}
                  type="button"
                  onClick={() => selectBirads(d.grade)}
                  aria-pressed={isSelected}
                  className={[
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    isSelected
                      ? 'border-sky-400/80 bg-sky-500/10 ring-1 ring-inset ring-sky-400/50'
                      : 'border-slate-700/70 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-800/50',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={[
                        'text-xs font-bold',
                        isSelected ? 'text-sky-200' : 'text-slate-200',
                      ].join(' ')}
                    >
                      {d.label}
                    </span>
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full ${toneDot(d.tone)}`}
                    />
                  </div>
                  <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                    {d.title}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {SIMPLE_TAXONOMY.map((option) => {
              const isSelected = selected === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelected(option.key)}
                  aria-pressed={isSelected}
                  className={[
                    'rounded-lg border px-3 py-2.5 text-left transition-colors',
                    isSelected
                      ? 'border-sky-400/80 bg-sky-500/10 ring-1 ring-inset ring-sky-400/50'
                      : 'border-slate-700/70 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-800/50',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={[
                        'text-sm font-semibold',
                        isSelected ? 'text-sky-200' : 'text-slate-200',
                      ].join(' ')}
                    >
                      {option.key}
                    </span>
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full ${toneDot(option.tone)}`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
<p className="mt-1.5 text-[10px] text-slate-600">
          Tip: choose the category you would report — it overrides the AI
          label for this patient's study (all views).
        </p>
      </div>

      {/* ---------- Notes ---------- */}
      <div className="mt-4">
        <label
          htmlFor="relabel-notes"
          className="mb-1.5 block text-xs font-medium text-slate-300"
        >
          Notes <span className="font-normal text-slate-600">(optional)</span>
        </label>
        <textarea
          id="relabel-notes"
          rows={3}
          value={notes}
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="e.g. Mass has benign morphology on spot compression — recommend 6-month follow-up."
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-600">
          <span>Visible to the AI team &amp; audit trail.</span>
          <span className="font-mono">{notes.length}/500</span>
        </div>
      </div>

      {/* ---------- Live selection summary ---------- */}
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
        <span className="text-[11px] text-slate-500">Final label</span>
        {selected ? (
          <ToneBadge tone={previewTone}>{selected}</ToneBadge>
        ) : (
          <span className="text-xs italic text-slate-600">
            nothing selected yet
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-slate-600">
          status: RELABELED
        </span>
      </div>
    </Modal>
  );
}
