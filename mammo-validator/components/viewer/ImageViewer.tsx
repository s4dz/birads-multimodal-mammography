'use client';

import { useState } from 'react';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import type { StudyCase } from '@/lib/types';
import { DicomViewer } from './DicomViewer';
import { PngImageViewer } from './PngImageViewer';
import { DISPLAY_NEUTRAL, ViewerToolbar } from './ViewerToolbar';

export type ViewerPhase = 'loading' | 'ready' | 'error';

/** A zoom step requested from the toolbar, applied around the viewport centre. */
export interface ZoomRequest {
  /** Monotonic id so repeated requests (even the same direction) still fire. */
  nonce: number;
  /** Multiplicative zoom factor, e.g. 1.25 to zoom in, 0.8 to zoom out. */
  factor: number;
}

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
  return null;
}

/** Overlay text shown in the top-left corner of the image stage. */
export interface StageAnnotationText {
  badge: string;
  title: string;
  /** Optional second line, e.g. the renderer / source caption. */
  subtitle?: string;
}

/** Watermark annotation in the top-left of the stage. */
function StageAnnotation({ badge, title, subtitle }: StageAnnotationText) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-start gap-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-slate-950/70 font-mono text-base font-black text-sky-200 backdrop-blur">
        {badge}
      </div>
      <div className="rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-[11px] leading-tight text-slate-300 backdrop-blur">
        <div className="font-semibold">{title}</div>
        {subtitle ? (
          <div className="font-mono text-[10px] text-slate-500">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Subtle bottom-right metadata overlay (format caption + usage hint). */
function StageMetadata({ formatCaption }: { formatCaption?: string }) {
  if (!formatCaption) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-10 text-[10px] leading-relaxed text-slate-500">
      <span className="font-mono">{formatCaption}</span>
      <span className="mx-1.5 hidden text-slate-700 xl:inline">·</span>
      <span className="hidden xl:inline">drag to pan · scroll to zoom</span>
    </div>
  );
}

interface ImageViewerProps {
  caseStudy: StudyCase;
  /** Optional overlay text; defaults to the study's laterality / view. */
  annotation?: StageAnnotationText;
}

/**
 * Central image canvas: routes to the native Cornerstone DICOM renderer or the
 * canvas-based PNG renderer and hosts the shared floating control bar.
 *
 * The parent (Workbench) mounts one instance per image id (`key={imageId}`) so
 * every new study starts with a clean viewport, default display and full reset.
 */
export function ImageViewer({ caseStudy, annotation }: ImageViewerProps) {
  const [resetNonce, setResetNonce] = useState(0);
  const [brightness, setBrightness] = useState(DISPLAY_NEUTRAL);
  const [contrast, setContrast] = useState(DISPLAY_NEUTRAL);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest>({
    nonce: 0,
    factor: 1,
  });
  const [phase, setPhase] = useState<ViewerPhase>('loading');
  const [formatCaption, setFormatCaption] = useState<string | undefined>();

  const isDicom = caseStudy.image.type === 'dicom';

  const requestZoom = (factor: number) =>
    setZoomRequest((previous) => ({ nonce: previous.nonce + 1, factor }));

  const handleReset = () => {
    setBrightness(DISPLAY_NEUTRAL);
    setContrast(DISPLAY_NEUTRAL);
    setResetNonce((nonce) => nonce + 1);
  };

  const viewerProps = {
    caseStudy,
    brightness,
    contrast,
    zoomRequest,
    resetNonce,
    onZoomChange: setZoomPercent,
    onPhaseChange: setPhase,
    onFormatChange: setFormatCaption,
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        {isDicom ? (
          <DicomViewer {...viewerProps} />
        ) : (
          <PngImageViewer {...viewerProps} />
        )}
      </div>

      <StageAnnotation
        {...(annotation ?? {
          badge: caseStudy.acquisition.laterality,
          title: `${caseStudy.acquisition.view} view · ${caseStudy.study.description}`,
          subtitle:
            caseStudy.image.type === 'dicom'
              ? 'Native DICOM · Cornerstone3D'
              : 'Web image · canvas',
        })}
      />
      <StageStatus phase={phase} />
      <StageMetadata formatCaption={formatCaption} />

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <div className="pointer-events-auto">
          <ViewerToolbar
            brightness={brightness}
            contrast={contrast}
            onBrightnessChange={setBrightness}
            onContrastChange={setContrast}
            zoomPercent={zoomPercent}
            onZoomIn={() => requestZoom(1.25)}
            onZoomOut={() => requestZoom(0.8)}
            onReset={handleReset}
          />
        </div>
      </div>
    </div>
  );
}
