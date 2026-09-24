'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  FileScan,
  ImageIcon,
  LoaderCircle,
  Play,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ImageViewer } from '@/components/viewer/ImageViewer';
import {
  predictBreasts,
  predictBreastsUpload,
  submitValidation,
  fetchPredictHealth,
} from '@/lib/api-client';
import { toneClasses } from '@/lib/taxonomy';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { useWorkbenchStore } from '@/store/workbench-store';
import type {
  DensityChoice,
  Laterality,
  PredictBreastResult,
  PredictResponse,
  StudyCase,
  Tone,
  ValidationRecord,
} from '@/lib/types';

/**
 * Mode 1 — Predict.
 *
 * Score one or both breasts: upload (or pick from bundled samples) the CC +
 * MLO pair of a breast — 2 images — and run the 4-fold SwinV2 + breast-fusion
 * ensemble (`/api/predict` -> `ml/predict.py`). Add the other breast (4 images)
 * to get two independent per-breast assessments, which may differ. Each breast
 * is previewed with the same viewer used in review mode.
 */

/** The three classes the model was trained on (BI-RADS collapsed). */
const CLASS_INFO: {
  key: 'normal' | 'benignLeaning' | 'suspicious';
  labelKey: TranslationKey;
  range: string;
  tone: Tone;
}[] = [
  {
    key: 'normal',
    labelKey: 'predict.classNormal',
    range: 'BI-RADS 1',
    tone: 'positive',
  },
  {
    key: 'benignLeaning',
    labelKey: 'predict.classBenign',
    range: 'BI-RADS 2-3',
    tone: 'watch',
  },
  {
    key: 'suspicious',
    labelKey: 'predict.classSuspicious',
    range: 'BI-RADS 4-5',
    tone: 'critical',
  },
];

const DENSITY_OPTIONS: { value: DensityChoice; labelKey: TranslationKey }[] = [
  { value: 'A', labelKey: 'predict.densityA' },
  { value: 'B', labelKey: 'predict.densityB' },
  { value: 'C', labelKey: 'predict.densityC' },
  { value: 'D', labelKey: 'predict.densityD' },
];

function isDicomName(name: string): boolean {
  return /\.(dcm|dicom)$/i.test(name);
}

function basenameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

/** One image slot: either a bundled sample or an uploaded local file. */
interface ViewSource {
  kind: 'sample' | 'file';
  /** Sample path (JSON mode) or an object URL preview (upload mode). */
  url: string;
  label: string;
  isDicom: boolean;
  /** Present only for uploads; used to build the multipart request. */
  file?: File;
}

interface BreastSlot {
  laterality: Laterality;
  cc: ViewSource | null;
  mlo: ViewSource | null;
}

/** Resolve a ViewSource into a multipart File (samples are fetched). */
async function toFile(source: ViewSource): Promise<File> {
  if (source.kind === 'file' && source.file) return source.file;
  const response = await fetch(source.url);
  const blob = await response.blob();
  return new File([blob], source.label, {
    type: blob.type || 'image/png',
  });
}

/** Minimal StudyCase so a prediction image gets the full viewer controls. */
function previewCaseFor(url: string, fileName: string): StudyCase {
  return {
    imageId: fileName,
    patient: { id: '—', sex: 'F' },
    study: {
      studyInstanceUid: 'prediction-input',
      date: new Date().toISOString().slice(0, 10),
      description: 'Prediction input',
      accessionNumber: '—',
    },
    acquisition: { laterality: 'R', view: 'CC' },
    image: { type: isDicomName(fileName) ? 'dicom' : 'png', url },
    ai: {
      biradsGrade: '1',
      predictedClass: {
        index: 0,
        name: 'Normal',
        range: 'BI-RADS 1',
      },
      confidence: 0,
      gradeProbabilities: {
        '0': 0,
        '1': 0,
        '2': 0,
        '3': 0,
        '4A': 0,
        '4B': 0,
        '4C': 0,
        '5': 0,
        '6': 0,
      },
      classProbabilities: {
        normal: 0,
        benignLeaning: 0,
        suspicious: 0,
      },
      findings: [],
      model: '',
      modelVersion: '',
      runAt: new Date().toISOString(),
    },
  };
}

/** Horizontal probability bar for one class. */
function ProbabilityBar({
  label,
  range,
  tone,
  value,
  isTop,
}: {
  label: string;
  range: string;
  tone: Tone;
  value: number;
  isTop: boolean;
}) {
  const classes = toneClasses(tone);
  const pct = Math.round(value * 100);
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`size-1.5 shrink-0 rounded-full ${classes.dot}`} />
          <span
            className={[
              'truncate',
              isTop ? 'font-semibold text-slate-100' : 'text-slate-300',
            ].join(' ')}
          >
            {label}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-slate-500">
            {range}
          </span>
        </span>
        <span
          className={[
            'shrink-0 font-mono',
            isTop ? 'text-slate-100' : 'text-slate-400',
          ].join(' ')}
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={[
            'h-full rounded-full transition-[width] duration-500',
            classes.dot,
          ].join(' ')}
          style={{ width: `${Math.max(1, pct)}%` }}
        />
      </div>
    </li>
  );
}

/** One row of the per-fold breakdown. */
function FoldRow({
  fold,
  label,
  probabilities,
}: {
  fold: number;
  label: number;
  probabilities: number[];
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2 py-1 text-[11px]">
      <span className="font-mono text-slate-500">fold {fold}</span>
      <span className="font-mono text-slate-400">
        {probabilities.map((p) => `${Math.round(p * 100)}`).join(' / ')}
      </span>
      <span className="text-slate-300">
        {CLASS_INFO[label] ? t(CLASS_INFO[label].labelKey) : '—'}
      </span>
    </li>
  );
}

/**
 * One CC/MLO input: lets the user either upload a local file or select one of
 * the bundled samples. Produces a {@link ViewSource} or clears it.
 */
function ViewInput({
  labelKey,
  samples,
  value,
  onChange,
}: {
  labelKey: TranslationKey;
  samples: string[];
  value: ViewSource | null;
  onChange: (next: ViewSource | null) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      onChange({
        kind: 'file',
        url: URL.createObjectURL(file),
        label: file.name,
        isDicom: isDicomName(file.name),
        file,
      });
    },
    [onChange]
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-slate-400">{t(labelKey)}</span>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            title={t('predict.clearSelection')}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-slate-200"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg,.dcm,.dicom,image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={[
          'flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
          value
            ? 'border-slate-700 bg-slate-900 text-slate-300'
            : 'border-dashed border-slate-700 bg-slate-950 text-slate-400 hover:border-sky-500/60 hover:text-slate-200',
        ].join(' ')}
      >
        <Upload className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          {value ? (
            <span className="font-mono text-[11px] text-sky-200">
              {value.label}
            </span>
          ) : (
            <span className="text-[11px]">{t('predict.uploadOrSample')}</span>
          )}
        </span>
      </button>

      <div className="flex items-center gap-1">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-600">
          {t('predict.bundledSamples')}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {samples.map((sample) => {
            const isSelected = value?.kind === 'sample' && value.url === sample;
            return (
              <button
                key={sample}
                type="button"
                title={sample}
                onClick={() =>
                  onChange(
                    isSelected
                      ? null
                      : {
                          kind: 'sample',
                          url: sample,
                          label: basenameOf(sample),
                          isDicom: isDicomName(sample),
                        }
                  )
                }
                className={[
                  'max-w-full truncate rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                  isSelected
                    ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                    : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300',
                ].join(' ')}
              >
                {basenameOf(sample)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** One breast slot: laterality toggle + CC + MLO inputs. */
function BreastField({
  index,
  slot,
  samples,
  canRemove,
  onLaterality,
  onSource,
  onRemove,
}: {
  index: number;
  slot: BreastSlot;
  samples: string[];
  canRemove: boolean;
  onLaterality: (index: number, laterality: Laterality) => void;
  onSource: (index: number, view: 'cc' | 'mlo', source: ViewSource | null) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  const sideLabel = slot.laterality === 'L' ? t('predict.left') : t('predict.right');
  return (
    <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t('predict.breast')}
          </label>
          {canRemove ? (
            <div className="flex -space-x-px overflow-hidden rounded-md border border-slate-700">
              {(['L', 'R'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => onLaterality(index, side)}
                  className={[
                    'px-2 py-0.5 text-[11px] font-semibold transition-colors',
                    slot.laterality === side
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'bg-slate-900 text-slate-500 hover:text-slate-300',
                  ].join(' ')}
                >
                  {side === 'L' ? 'L' : 'R'}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[11px] font-semibold text-slate-300">
              {sideLabel}
            </span>
          )}
          <span className="font-mono text-[10px] text-slate-600">
            #{index + 1}
          </span>
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(index)}
            title={t('predict.removeBreast')}
            className="inline-flex size-5 items-center justify-center rounded text-slate-500 transition-colors hover:text-rose-300"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <ViewInput
        labelKey="predict.ccView"
        samples={samples}
        value={slot.cc}
        onChange={(source) => onSource(index, 'cc', source)}
      />
      <ViewInput
        labelKey="predict.mloView"
        samples={samples}
        value={slot.mlo}
        onChange={(source) => onSource(index, 'mlo', source)}
      />
    </section>
  );
}

/** Everything the radiologist sign-off card needs to render and act. */
export interface ApprovalState {
  /** True when the scored breast belongs to the review worklist. */
  canApprove: boolean;
  isApproving: boolean;
  approvedImageId: string | null;
  error: string | null;
  onApprove: () => void;
  /** "Back to review" target, when the user arrived from review mode. */
  backHref: string | null;
}

/** One breast's assessment card. */
function BreastResultCard({
  result,
}: {
  result: PredictBreastResult;
}) {
  const { t } = useTranslation();

  if (!result.ok) {
    return (
      <section className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
          {t('predict.resultFor', {
            side: result.laterality === 'L' ? t('predict.left') : t('predict.right'),
          })}
        </p>
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-rose-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {result.error ?? t('predict.failed')}
        </p>
      </section>
    );
  }

  const top = CLASS_INFO[result.label] ?? CLASS_INFO[0];
  const topClasses = toneClasses(top.tone);
  const sideLabel =
    result.laterality === 'L' ? t('predict.left') : t('predict.right');

  return (
    <section className="space-y-3 rounded-xl border border-slate-700/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {t('predict.resultFor', { side: sideLabel })}
        </h3>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
          {result.laterality}
        </span>
      </div>

      <div className={`rounded-xl border border-slate-700/40 p-4 ring-1 ring-inset ${topClasses.badge}`}>
        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
          {t('predict.predictedAssessment')}
        </p>
        <p className="mt-1 text-2xl font-black leading-tight">
          {t(top.labelKey)}
        </p>
        <p className="mt-0.5 font-mono text-xs opacity-90">
          {result.biradsRange}
        </p>
        <p className="mt-2 text-[11px] opacity-90">
          {t('predict.ensembleConfidence')}{' '}
          <span className="font-mono">
            {Math.round(result.confidence * 100)}%
          </span>
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {t('predict.classProbabilities')}
        </h2>
        <ul className="space-y-2.5">
          {CLASS_INFO.map((info, index) => (
            <ProbabilityBar
              key={info.key}
              label={t(info.labelKey)}
              range={info.range}
              tone={info.tone}
              value={result.probabilities[info.key]}
              isTop={index === result.label}
            />
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {t('predict.perFold', { count: result.folds.length })}
        </h2>
        <ul className="space-y-1">
          {result.folds.map((fold) => (
            <FoldRow
              key={fold.fold}
              fold={fold.fold}
              label={fold.label}
              probabilities={fold.probabilities}
            />
          ))}
        </ul>
        <p className="text-[10px] leading-relaxed text-slate-600">
          {t('predict.perFoldNote')}
        </p>
      </div>

      <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[10px] leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-400">{t('predict.model')}</p>
        <p className="font-mono">{result.model}</p>
        <p className="font-mono">{result.modelVersion}</p>
        <p className="pt-1">
          {t('predict.inputLabel')}:{' '}
          <span className="font-mono">
            {result.input.fileCC} / {result.input.fileMLO}
          </span>{' '}
          · age {result.input.age} · density code {result.input.densityCode}
        </p>
        <p>
          {t('predict.inference')}: {result.elapsedMs} ms
        </p>
      </div>
    </section>
  );
}

/** Right-hand results column: one card per breast + sign-off. */
function ResultPanel({
  result,
  approval,
}: {
  result: PredictResponse | null;
  approval: ApprovalState;
}) {
  const { t } = useTranslation();
  if (!result) {
    return (
      <aside className="flex w-96 shrink-0 flex-col items-center justify-center gap-3 border-l border-slate-800 bg-slate-900/40 p-8 text-center">
        <FileScan className="size-8 text-slate-600" />
        <p className="text-sm font-semibold text-slate-300">
          {t('predict.noResultTitle')}
        </p>
        <p className="max-w-56 text-xs leading-relaxed text-slate-500">
          {t('predict.noResultHint')}
        </p>
      </aside>
    );
  }

  const first = result.breasts[0];

  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900/40">
      <div className="space-y-4 p-4">
        {result.breasts.map((breast, index) => (
          <BreastResultCard key={breast.laterality || index} result={breast} />
        ))}

        {approval.canApprove && first ? (
          <section className="space-y-2.5 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
              {t('predict.signoffTitle')}
            </h2>
            {approval.approvedImageId ? (
              <>
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-emerald-200">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {t('predict.approvedNote', {
                      imageId: approval.approvedImageId,
                    })}
                  </span>
                </p>
                {approval.backHref ? (
                  <Link
                    href={approval.backHref}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-100 ring-1 ring-inset ring-slate-700 transition-colors hover:bg-slate-700"
                  >
                    {t('predict.backToReview')}
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {t('predict.signoffBody', { label: first.labelName })}
                </p>
                <Button
                  variant="success"
                  size="md"
                  className="w-full"
                  loading={approval.isApproving}
                  leftIcon={<CheckCircle2 className="size-4" />}
                  onClick={approval.onApprove}
                >
                  {approval.isApproving
                    ? t('common.saving')
                    : t('predict.approve')}
                </Button>
              </>
            )}
            {approval.error ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {approval.error}
              </p>
            ) : null}
          </section>
        ) : null}

        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-[10px] leading-relaxed text-amber-200/90">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {t('predict.disclaimer')}
        </p>
      </div>
    </aside>
  );
}

/** Mode 1 workspace: score one or both breasts (2 or 4 images). */
export function PredictWorkbench() {
  const { t } = useTranslation();
  const [samples, setSamples] = useState<string[]>([]);
  const [workerNote, setWorkerNote] = useState<string | null>(null);
  const [slots, setSlots] = useState<BreastSlot[]>(() => [
    { laterality: 'R', cc: null, mlo: null },
  ]);
  const [age, setAge] = useState('55');
  const [density, setDensity] = useState<DensityChoice>('C');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Radiologist sign-off (dataset images only) */
  const [datasetImageId, setDatasetImageId] = useState<string | null>(null);
  const [cameFromReview, setCameFromReview] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvedImageId, setApprovedImageId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const reviewer = useWorkbenchStore((state) => state.reviewer);
  const refreshSession = useWorkbenchStore((state) => state.refreshSession);

  const initialisedRef = useRef(false);

  /* Warm the Python worker and fetch the bundled sample list on first paint. */
  useEffect(() => {
    let cancelled = false;
    fetchPredictHealth()
      .then((health) => {
        if (cancelled) return;
        setSamples(health.samples ?? []);
        const worker = health.worker;
        setWorkerNote(
          worker && worker.loaded > 0
            ? t('predict.workerReady', {
                count: worker.loaded,
                folds: worker.folds.join(', '),
                features: worker.selectedFeatures[0] ?? '?',
              })
            : (health.message ?? t('predict.workerUnavailable'))
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setWorkerNote(
          err instanceof Error ? err.message : t('predict.workerUnavailable')
        );
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  /* Deep link from review mode: /predict?sample=…&mlo=…&laterality=…&imageId=…&from=review */
  useEffect(() => {
    if (initialisedRef.current) return;
    initialisedRef.current = true;
    void refreshSession();
    const sample = searchParams.get('sample');
    if (!sample) return;
    const mlo = searchParams.get('mlo');
    const lateralityRaw = searchParams.get('laterality');
    const laterality: Laterality =
      lateralityRaw?.toUpperCase() === 'L' ? 'L' : 'R';
    const makeSource = (path: string): ViewSource => ({
      kind: 'sample',
      url: path,
      label: basenameOf(path),
      isDicom: isDicomName(path),
    });
    setSlots([
      {
        laterality,
        cc: makeSource(sample),
        mlo: mlo ? makeSource(mlo) : null,
      },
    ]);
    setDatasetImageId(
      searchParams.get('imageId') ?? basenameOf(sample) ?? null
    );
    setCameFromReview(searchParams.get('from') === 'review');
  }, [refreshSession, searchParams]);

  /* A new image or prediction invalidates any previous sign-off. */
  useEffect(() => {
    setApprovedImageId(null);
    setApproveError(null);
  }, [slots, result]);

  const setLaterality = useCallback(
    (index: number, laterality: Laterality) => {
      setSlots((prev) => {
        const previous = prev[index]?.laterality;
        const next = prev.map((slot, i) =>
          i === index ? { ...slot, laterality } : slot
        );
        if (next.length === 2 && previous && next[0].laterality === next[1].laterality) {
          const other = index === 0 ? 1 : 0;
          next[other] = { ...next[other], laterality: previous };
        }
        return next;
      });
      setResult(null);
      setError(null);
    },
    []
  );

  const setSource = useCallback(
    (index: number, view: 'cc' | 'mlo', source: ViewSource | null) => {
      setSlots((prev) =>
        prev.map((slot, i) => (i === index ? { ...slot, [view]: source } : slot))
      );
      setResult(null);
      setError(null);
    },
    []
  );

  const addBreast = useCallback(() => {
    setSlots((prev) => {
      if (prev.length >= 2) return prev;
      const laterality: Laterality = prev[0].laterality === 'L' ? 'R' : 'L';
      return [...prev, { laterality, cc: null, mlo: null }];
    });
    setResult(null);
  }, []);

  const removeBreast = useCallback((index: number) => {
    setSlots((prev) =>
      prev.length === 2 && index === 1 ? [prev[0]] : prev
    );
    setResult(null);
  }, []);

  const readyBreasts = slots.filter((slot) => slot.cc && slot.mlo);

  const runPrediction = useCallback(async () => {
    if (readyBreasts.length === 0) {
      setError(t('predict.missingView'));
      return;
    }
    if (readyBreasts.some((slot) => !slot.cc || !slot.mlo)) {
      setError(t('predict.perBreastMissing'));
      return;
    }
    const parsedAge = Number(age);
    if (!Number.isFinite(parsedAge) || parsedAge <= 0 || parsedAge > 120) {
      setError(t('predict.ageError'));
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const anyFile = readyBreasts.some(
        (slot) => slot.cc?.kind === 'file' || slot.mlo?.kind === 'file'
      );
      let prediction: PredictResponse;
      if (anyFile) {
        const uploads = await Promise.all(
          readyBreasts.map(async (slot) => ({
            laterality: slot.laterality,
            cc: await toFile(slot.cc!),
            mlo: await toFile(slot.mlo!),
          }))
        );
        prediction = await predictBreastsUpload(
          parsedAge,
          density,
          uploads
        );
      } else {
        prediction = await predictBreasts(
          parsedAge,
          density,
          readyBreasts.map((slot) => ({
            laterality: slot.laterality,
            sampleCC: slot.cc!.url,
            sampleMLO: slot.mlo!.url,
          }))
        );
      }
      setResult(prediction);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : t('predict.failed'));
    } finally {
      setIsRunning(false);
    }
  }, [readyBreasts, age, density, t]);

  /**
   * Radiologist sign-off: store the predicted label for a dataset image so the
   * worklist shows it as approved.
   */
  const approveLabel = useCallback(async () => {
    const breast = result?.breasts[0];
    if (!result || !breast || !datasetImageId) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      const record: ValidationRecord = {
        imageId: datasetImageId,
        radiologistId: reviewer?.id ?? 'UNKNOWN',
        originalLabel: 'Unlabeled',
        finalLabel: breast.labelName,
        status: 'APPROVED',
        notes:
          `Label produced by the ensemble in /predict (${breast.biradsRange}, ` +
          `${Math.round(breast.confidence * 100)}% confidence) and approved by the reviewer.`,
        timestamp: new Date().toISOString(),
      };
      const response = await submitValidation(record);
      if (!response.ok) {
        throw new Error(response.message ?? t('predict.failed'));
      }
      setApprovedImageId(datasetImageId);
    } catch (err) {
      setApproveError(
        err instanceof Error ? err.message : t('predict.saveFailed')
      );
    } finally {
      setIsApproving(false);
    }
  }, [result, datasetImageId, reviewer, t]);

  const previewSource =
    slots[0]?.cc ?? slots[0]?.mlo ?? slots[1]?.cc ?? slots[1]?.mlo ?? null;
  const previewCase = useMemo(
    () =>
      previewSource
        ? previewCaseFor(previewSource.url, previewSource.label)
        : null,
    [previewSource]
  );
  const previewLabel = previewSource?.label ?? '';

  return (
    <div className="flex min-h-0 flex-1">
      {/* ---------------- breast pickers + clinical inputs ---------------- */}
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900/40">
        <div className="space-y-4 p-4">
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              1 · {t('predict.imageSection')}
            </h2>

            {slots.map((slot, index) => (
              <BreastField
                key={index}
                index={index}
                slot={slot}
                samples={samples}
                canRemove={slots.length > 1}
                onLaterality={setLaterality}
                onSource={setSource}
                onRemove={removeBreast}
              />
            ))}

            {slots.length < 2 ? (
              <button
                type="button"
                onClick={addBreast}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 text-xs font-semibold text-slate-400 transition-colors hover:border-sky-500/60 hover:text-sky-200"
              >
                <Plus className="size-3.5" />
                {t('predict.addBreast')}
              </button>
            ) : null}

            <p className="text-[10px] leading-relaxed text-slate-600">
              {t('predict.pairHint')}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              2 · {t('predict.clinicalSection')}
            </h2>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">{t('predict.age')}</span>
              <input
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">
                {t('predict.density')}
              </span>
              <select
                value={density}
                onChange={(event) =>
                  setDensity(event.target.value as DensityChoice)
                }
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                {DENSITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[10px] leading-relaxed text-slate-600">
              {t('predict.inputsNote')}
            </p>
          </section>

          <section className="space-y-2">
            <Button
              variant="primary"
              size="md"
              className="w-full"
              disabled={readyBreasts.length === 0}
              loading={isRunning}
              leftIcon={<Play className="size-4" />}
              onClick={() => void runPrediction()}
            >
              {isRunning ? t('predict.scoring') : t('predict.run')}
            </Button>
            {isRunning ? (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <LoaderCircle className="size-3.5 animate-spin" />
                {t('predict.runningNote')}
              </p>
            ) : null}
            {error ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-2 text-[11px] leading-relaxed text-rose-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            ) : null}
          </section>

          <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-400">
              {t('predict.ensemble')}
            </span>
            <br />
            {workerNote ?? t('predict.connecting')}
          </p>
        </div>
      </aside>

      {/* ---------------- image stage ---------------- */}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {previewCase ? (
          <ImageViewer
            key={previewCase.imageId}
            caseStudy={previewCase}
            annotation={{
              badge: 'AI',
              title: previewLabel,
              subtitle: isDicomName(previewLabel)
                ? t('predict.annotationDicom')
                : t('predict.annotationImage'),
            }}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <ImageIcon className="size-8 text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">
              {t('predict.emptyTitle')}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-slate-500">
              {t('predict.emptyHint')}
            </p>
          </div>
        )}
      </main>

      <ResultPanel
        result={result}
        approval={{
          canApprove: Boolean(cameFromReview && datasetImageId),
          isApproving,
          approvedImageId,
          error: approveError,
          onApprove: () => void approveLabel(),
          backHref: cameFromReview ? '/review' : null,
        }}
      />
    </div>
  );
}