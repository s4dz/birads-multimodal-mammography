'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import type { StudyCase } from '@/lib/types';
import { DicomViewer } from './DicomViewer';
import { PngImageViewer } from './PngImageViewer';
import { ViewerToolbar, type ViewerTool } from './ViewerToolbar';

export type ViewerPhase = 'loading' | 'ready' | 'error';

/** Center stage status overlay (loading spinner / fatal error). */
export function StageStatus({ phase }: { phase: ViewerPhase }) {
  if (phase === 'loading') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
        <div className="flex items-center gap-3 rounded-lg bg-slate-950/80 px-4 py-3 text-sm text-slate-300 ring-1 ring-white/10">
          <LoaderCircle className="size-4.5 animate-spin text-sky-400" />
          Decoding mammogram…
        </div>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
        <div className="flex max-w-md items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-400" />
          <div>
            <p className="font-semibold">Could not display this image.</p>
            <p className="mt-0.5 text-rose-300/80">
              The file may be missing or malformed. Skip to the next case.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
      <CheckCircle2 className="size-3" /> rendered
    </div>
  );
}

/** Watermark annotation in the top-left of the stage. */
function StageAnnotation({ caseStudy }: { caseStudy: StudyCase }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-start gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950/70 font-mono text-lg font-black text-sky-200 ring-1 ring-inset ring-white/10 backdrop-blur">
        {caseStudy.acquisition.laterality}
      </div>
      <div className="rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-[11px] leading-tight text-slate-300 ring-1 ring-inset ring-white/10 backdrop-blur">
        <div className="font-semibold">
          {caseStudy.acquisition.view} view · {caseStudy.study.description}
        </div>
        <div className="font-mono text-[10px] text-slate-500">
          {caseStudy.image.type === 'dicom' ? 'Native DICOM · Cornerstone3D' : 'Web image · canvas'}
        </div>
      </div>
    </div>
  );
}

interface ImageViewerProps {
  caseStudy: StudyCase;
}

/**
 * Central image canvas: routes to the native Cornerstone DICOM renderer or the
 * canvas-based PNG renderer and hosts the shared floating toolbar.
 *
 * The parent (Workbench) mounts one instance per image id (`key={imageId}`) so
 * every new study starts with a clean viewport and full reset.
 */
export function ImageViewer({ caseStudy }: ImageViewerProps) {
  const [tool, setTool] = useState<ViewerTool>('window');
  const [resetNonce, setResetNonce] = useState(0);
  const [phase, setPhase] = useState<ViewerPhase>('loading');
  const [formatCaption, setFormatCaption] = useState<string | undefined>();

  const isDicom = caseStudy.image.type === 'dicom';

  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        {isDicom ? (
          <DicomViewer
            caseStudy={caseStudy}
            tool={tool}
            resetNonce={resetNonce}
            onPhaseChange={setPhase}
            onFormatChange={setFormatCaption}
          />
        ) : (
          <PngImageViewer
            caseStudy={caseStudy}
            tool={tool}
            resetNonce={resetNonce}
            onPhaseChange={setPhase}
            onFormatChange={setFormatCaption}
          />
        )}
      </div>

      <StageAnnotation caseStudy={caseStudy} />
      <StageStatus phase={phase} />

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <div className="pointer-events-auto">
          <ViewerToolbar
            tool={tool}
            onToolChange={setTool}
            onReset={() => setResetNonce((n) => n + 1)}
            formatCaption={formatCaption}
          />
        </div>
      </div>
    </div>
  );
}
