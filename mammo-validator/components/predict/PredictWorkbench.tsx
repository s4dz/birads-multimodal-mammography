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
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ImageViewer } from '@/components/viewer/ImageViewer';
import {
  fetchPredictHealth,
  predictSample,
  predictUpload,
  submitValidation,
} from '@/lib/api-client';
import { toneClasses } from '@/lib/taxonomy';
import { useWorkbenchStore } from '@/store/workbench-store';
import type {
  DensityChoice,
  PredictResponse,
  StudyCase,
  Tone,
  ValidationRecord,
} from '@/lib/types';

/**
 * Mode 1 — Predict.
 *
 * Score a single PNG or DICOM mammogram with the 4-fold SwinV2 + CatBoost
 * ensemble (`/api/predict` -> `ml/predict.py`). The image is previewed with the
 * same viewer used in review mode, so pan / zoom / brightness / contrast work
 * identically while you inspect the finding.
 */

/** The three classes the model was trained on (BI-RADS collapsed). */
const CLASS_INFO: {
  key: 'normal' | 'benignLeaning' | 'suspicious';
  label: string;
  range: string;
  tone: Tone;
}[] = [
  { key: 'normal', label: 'Normal', range: 'BI-RADS 1', tone: 'positive' },
  {
    key: 'benignLeaning',
    label: 'Benign-leaning',
    range: 'BI-RADS 2-3',
    tone: 'watch',
  },
  { key: 'suspicious', label: 'Suspicious', range: 'BI-RADS 4-5', tone: 'critical' },
];

const DENSITY_OPTIONS: { value: DensityChoice; label: string }[] = [
  { value: 'A', label: 'A — mostly fatty' },
  { value: 'B', label: 'B — scattered fibroglandular' },
  { value: 'C', label: 'C — heterogeneously dense' },
  { value: 'D', label: 'D — extremely dense' },
];

const ACCEPTED_TYPES = '.png,.jpg,.jpeg,.dcm,.dicom';

type PredictionSource =
  | { kind: 'sample'; path: string }
  | { kind: 'upload'; file: File }
  | null;

function isDicomName(name: string): boolean {
  return /\.(dcm|dicom)$/i.test(name);
}

function fileNameOf(source: PredictionSource): string {
  if (!source) return '';
  if (source.kind === 'upload') return source.file.name;
  return source.path.split('/').pop() ?? source.path;
}

/** Minimal StudyCase so the prediction image gets the full viewer controls. */
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
    acquisition: { laterality: 'L', view: 'CC' },
    image: { type: isDicomName(fileName) ? 'dicom' : 'png', url },
    ai: {
      biradsGrade: '1',
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
  return (
    <li className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2 py-1 text-[11px]">
      <span className="font-mono text-slate-500">fold {fold}</span>
      <span className="font-mono text-slate-400">
        {probabilities.map((p) => `${Math.round(p * 100)}`).join(' / ')}
      </span>
      <span className="text-slate-300">{CLASS_INFO[label]?.label ?? '—'}</span>
    </li>
  );
}

/** Everything the radiologist sign-off card needs to render and act. */
export interface ApprovalState {
  /** True when the scored image belongs to the review worklist. */
  canApprove: boolean;
  isApproving: boolean;
  approvedImageId: string | null;
  error: string | null;
  onApprove: () => void;
  /** "Back to review" target, when the user arrived from review mode. */
  backHref: string | null;
}

/** Right-hand results column. */
function ResultPanel({
  result,
  approval,
}: {
  result: PredictResponse | null;
  approval: ApprovalState;
}) {
  if (!result) {
    return (
      <aside className="flex w-96 shrink-0 flex-col items-center justify-center gap-3 border-l border-slate-800 bg-slate-900/40 p-8 text-center">
        <FileScan className="size-8 text-slate-600" />
        <p className="text-sm font-semibold text-slate-300">No prediction yet</p>
        <p className="max-w-56 text-xs leading-relaxed text-slate-500">
          Choose a PNG or DICOM mammogram, fill in the clinical inputs and run the
          model to see its BI-RADS assessment.
        </p>
      </aside>
    );
  }

  const top = CLASS_INFO[result.label] ?? CLASS_INFO[0];
  const topClasses = toneClasses(top.tone);

  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900/40">
      <div className="space-y-4 p-4">
        <section
          className={`rounded-xl border border-slate-700/60 p-4 ring-1 ring-inset ${topClasses.badge}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
            Predicted assessment
          </p>
          <p className="mt-1 text-2xl font-black leading-tight">{top.label}</p>
          <p className="mt-0.5 font-mono text-xs opacity-90">
            {result.biradsRange}
          </p>
          <p className="mt-2 text-[11px] opacity-90">
            Ensemble confidence{' '}
            <span className="font-mono">
              {Math.round(result.confidence * 100)}%
            </span>
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Class probabilities
          </h2>
          <ul className="space-y-2.5">
            {CLASS_INFO.map((info, index) => (
              <ProbabilityBar
                key={info.key}
                label={info.label}
                range={info.range}
                tone={info.tone}
                value={result.probabilities[info.key]}
                isTop={index === result.label}
              />
            ))}
          </ul>
        </section>

        {approval.canApprove ? (
          <section className="space-y-2.5 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
              Radiologist sign-off
            </h2>
            {approval.approvedImageId ? (
              <>
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-emerald-200">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Label recorded for{' '}
                    <span className="font-mono">
                      {approval.approvedImageId}
                    </span>
                    . It now appears as approved in the worklist.
                  </span>
                </p>
                {approval.backHref ? (
                  <Link
                    href={approval.backHref}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-100 ring-1 ring-inset ring-slate-700 transition-colors hover:bg-slate-700"
                  >
                    Back to review
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Approving stores{' '}
                  <span className="text-slate-200">{result.labelName}</span> as
                  the reviewed label for this dataset image.
                </p>
                <Button
                  variant="success"
                  size="md"
                  className="w-full"
                  loading={approval.isApproving}
                  leftIcon={<CheckCircle2 className="size-4" />}
                  onClick={approval.onApprove}
                >
                  {approval.isApproving ? 'Saving…' : 'Approve this label'}
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

        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Per-fold breakdown ({result.folds.length})
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
            Numbers are percentages of Normal / Benign-leaning / Suspicious.
            Disagreement between folds is expected near decision boundaries.
          </p>
        </section>

        <section className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[10px] leading-relaxed text-slate-500">
          <p className="font-semibold text-slate-400">Model</p>
          <p className="font-mono">{result.model}</p>
          <p className="font-mono">{result.modelVersion}</p>
          <p className="pt-1">
            input: <span className="font-mono">{result.input.file}</span> · age{' '}
            {result.input.age} · density code {result.input.densityCode}
          </p>
          <p>inference: {result.elapsedMs} ms</p>
        </section>

        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-[10px] leading-relaxed text-amber-200/90">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          Research model trained on VinDr-Mammo. Output is a 3-class collapse
          (BI-RADS 1 / 2-3 / 4-5) and must not be used for diagnosis.
        </p>
      </div>
    </aside>
  );
}

/** Mode 1 workspace: pick an image, set clinical inputs, run the ensemble. */
export function PredictWorkbench() {
  const [samples, setSamples] = useState<string[]>([]);
  const [workerNote, setWorkerNote] = useState('Connecting to the prediction worker…');
  const [source, setSource] = useState<PredictionSource>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [age, setAge] = useState('55');
  const [density, setDensity] = useState<DensityChoice>('C');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  /* Radiologist sign-off (dataset images only) */
  const [datasetImageId, setDatasetImageId] = useState<string | null>(null);
  const [cameFromReview, setCameFromReview] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvedImageId, setApprovedImageId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const reviewer = useWorkbenchStore((state) => state.reviewer);
  const restoreReviewer = useWorkbenchStore((state) => state.restoreReviewer);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
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
            ? `${worker.loaded} fold model${worker.loaded === 1 ? '' : 's'} ready (folds ${worker.folds.join(', ')}, ${worker.selectedFeatures[0] ?? '?'} latent features)`
            : (health.message ?? 'Prediction worker unavailable.')
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setWorkerNote(
          err instanceof Error ? err.message : 'Prediction worker unavailable.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Deep link from review mode: /predict?sample=…&imageId=…&from=review */
  useEffect(() => {
    if (initialisedRef.current) return;
    initialisedRef.current = true;
    restoreReviewer();
    const sample = searchParams.get('sample');
    if (!sample) return;
    setSource({ kind: 'sample', path: sample });
    setDatasetImageId(
      searchParams.get('imageId') ?? sample.split('/').pop() ?? null
    );
    setCameFromReview(searchParams.get('from') === 'review');
  }, [restoreReviewer, searchParams]);

  /* A new image or prediction invalidates any previous sign-off. */
  useEffect(() => {
    setApprovedImageId(null);
    setApproveError(null);
  }, [source, result]);

  /* Release the preview blob URL on unmount. */
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const acceptFile = useCallback(
    (file: File) => {
      releaseObjectUrl();
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setObjectUrl(url);
      setSource({ kind: 'upload', file });
      setResult(null);
      setError(null);
    },
    [releaseObjectUrl]
  );

  const selectSample = useCallback(
    (path: string) => {
      releaseObjectUrl();
      setObjectUrl(null);
      setSource({ kind: 'sample', path });
      setResult(null);
      setError(null);
    },
    [releaseObjectUrl]
  );

  const clearSource = useCallback(() => {
    releaseObjectUrl();
    setObjectUrl(null);
    setSource(null);
    setResult(null);
    setError(null);
  }, [releaseObjectUrl]);

  const fileName = fileNameOf(source);
  const previewUrl =
    source?.kind === 'upload' ? objectUrl : (source?.path ?? null);
  const previewCase = useMemo(
    () =>
      previewUrl && fileName ? previewCaseFor(previewUrl, fileName) : null,
    [previewUrl, fileName]
  );

  const runPrediction = useCallback(async () => {
    if (!source) return;
    const parsedAge = Number(age);
    if (!Number.isFinite(parsedAge) || parsedAge <= 0 || parsedAge > 120) {
      setError('Enter a patient age between 1 and 120.');
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const prediction =
        source.kind === 'upload'
          ? await predictUpload(source.file, parsedAge, density)
          : await predictSample(source.path, parsedAge, density);
      setResult(prediction);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Prediction failed.');
    } finally {
      setIsRunning(false);
    }
  }, [source, age, density]);

  /**
   * Radiologist sign-off: store the predicted label for a dataset image so the
   * worklist shows it as approved.
   */
  const approveLabel = useCallback(async () => {
    if (!result || source?.kind !== 'sample' || !datasetImageId) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      const record: ValidationRecord = {
        imageId: datasetImageId,
        radiologistId: reviewer?.id ?? 'UNKNOWN',
        originalLabel: 'Unlabeled',
        finalLabel: result.labelName,
        status: 'APPROVED',
        notes:
          `Label produced by the ensemble in /predict (${result.biradsRange}, ` +
          `${Math.round(result.confidence * 100)}% confidence) and approved by the reviewer.`,
        timestamp: new Date().toISOString(),
      };
      const response = await submitValidation(record);
      if (!response.ok) {
        throw new Error(response.message ?? 'The server rejected the label.');
      }
      setApprovedImageId(datasetImageId);
    } catch (err) {
      setApproveError(
        err instanceof Error ? err.message : 'Could not save the label.'
      );
    } finally {
      setIsApproving(false);
    }
  }, [result, source, datasetImageId, reviewer]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) acceptFile(file);
    },
    [acceptFile]
  );

  return (
    <div className="flex min-h-0 flex-1">
      {/* ---------------- source + clinical inputs ---------------- */}
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900/40">
        <div className="space-y-4 p-4">
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              1 · Mammogram
            </h2>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={[
                'rounded-xl border-2 border-dashed p-4 text-center transition-colors',
                isDragging
                  ? 'border-sky-400/70 bg-sky-500/10'
                  : 'border-slate-700 bg-slate-950/40',
              ].join(' ')}
            >
              <Upload className="mx-auto size-6 text-slate-500" />
              <p className="mt-2 text-xs text-slate-400">
                Drop a PNG or DICOM here
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) acceptFile(file);
                  event.target.value = '';
                }}
              />
            </div>

            {source ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-950/50 px-2.5 py-2">
                <ImageIcon className="size-4 shrink-0 text-sky-300" />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300"
                  title={fileName}
                >
                  {fileName}
                </span>
                <button
                  type="button"
                  onClick={clearSource}
                  title="Clear selection"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-slate-200"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}

            {samples.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-slate-600">
                  or a bundled sample
                </p>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                  {samples.map((sample) => {
                    const isSelected =
                      source?.kind === 'sample' && source.path === sample;
                    return (
                      <button
                        key={sample}
                        type="button"
                        title={sample}
                        onClick={() => selectSample(sample)}
                        className={[
                          'max-w-full truncate rounded-md px-2 py-1 font-mono text-[10px] transition-colors',
                          isSelected
                            ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200',
                        ].join(' ')}
                      >
                        {sample.split('/').pop()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              2 · Clinical inputs
            </h2>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Patient age</span>
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
                Breast density (BI-RADS)
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
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[10px] leading-relaxed text-slate-600">
              Age and density are model inputs — they change the prediction, so
              use the patient&apos;s real values.
            </p>
          </section>

          <section className="space-y-2">
            <Button
              variant="primary"
              size="md"
              className="w-full"
              disabled={!source}
              loading={isRunning}
              leftIcon={<Play className="size-4" />}
              onClick={() => void runPrediction()}
            >
              {isRunning ? 'Scoring…' : 'Run prediction'}
            </Button>
            {isRunning ? (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <LoaderCircle className="size-3.5 animate-spin" />
                Running the 4-fold ensemble — about 10-20s on CPU.
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
            <span className="font-semibold text-slate-400">Ensemble</span>
            <br />
            {workerNote}
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
              title: fileName,
              subtitle: isDicomName(fileName)
                ? 'Prediction input · DICOM'
                : 'Prediction input · image',
            }}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <ImageIcon className="size-8 text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">
              No image selected
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-slate-500">
              Upload a PNG/JPG or DICOM mammogram — or pick a bundled sample — to
              score it with the model.
            </p>
          </div>
        )}
      </main>

      <ResultPanel
        result={result}
        approval={{
          canApprove: source?.kind === 'sample',
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

