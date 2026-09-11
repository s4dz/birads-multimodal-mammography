'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Types } from '@cornerstonejs/core';
import type { StudyCase } from '@/lib/types';
import type { ViewerPhase, ZoomRequest } from './ImageViewer';

/**
 * Native DICOM renderer powered by Cornerstone3D v5.
 *
 * Reading gestures — no mode switching:
 *   - drag (left / middle) ... pan
 *   - wheel / right-drag ..... zoom
 *
 * Window/Level is driven by the toolbar brightness & contrast sliders (mapped
 * onto the viewport VOI range), so the doctor never drags on the image to
 * change the display.
 *
 * NOTE: all Cornerstone modules are imported dynamically so none of their
 * browser-only assumptions leak into SSR.
 */

type CornerstoneModules = {
  core: Awaited<typeof import('@cornerstonejs/core')>;
  tools: Awaited<typeof import('@cornerstonejs/tools')>;
  loader: Awaited<
    typeof import('@cornerstonejs/dicom-image-loader')
  >['default'];
};

interface VoIRange {
  lower: number;
  upper: number;
}

type StackViewportLike = {
  setStack(imageIds: string[]): Promise<unknown>;
  render(): void;
  resetCamera(): void;
  resetProperties(): void;
  getProperties?: () => { voiRange?: VoIRange } | undefined;
  setProperties?: (properties: { voiRange: VoIRange }) => void;
  getZoom?: () => number;
  setZoom?: (zoom: number) => void;
};

type ToolGroupLike = {
  addTool(toolName: string): void;
  setToolActive(
    toolName: string,
    options: { bindings: { mouseButton: number }[] }
  ): void;
  addViewport(viewportId: string, renderingEngineId: string): void;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

let cornerstonePromise: Promise<CornerstoneModules> | null = null;

/** Lazily loads + initializes Cornerstone3D once per page load (v5 order). */
function getCornerstoneModules(): Promise<CornerstoneModules> {
  if (!cornerstonePromise) {
    cornerstonePromise = (async () => {
      const [core, tools, loaderModule, metadata] = await Promise.all([
        import('@cornerstonejs/core'),
        import('@cornerstonejs/tools'),
        import('@cornerstonejs/dicom-image-loader'),
        import('@cornerstonejs/metadata'),
      ]);
      const loader = loaderModule.default;

      metadata.registerDefaultProviders();
      loader.init({ maxWebWorkers: 1 });
      core.init({ debug: { statsOverlay: false } });
      tools.init();
      return { core, tools, loader };
    })().catch((error) => {
      cornerstonePromise = null;
      throw error;
    });
  }
  return cornerstonePromise;
}

interface DicomViewerProps {
  caseStudy: StudyCase;
  brightness: number;
  contrast: number;
  zoomRequest: ZoomRequest;
  resetNonce: number;
  onZoomChange: (percent: number) => void;
  onPhaseChange: (phase: ViewerPhase) => void;
  onFormatChange: (caption: string | undefined) => void;
}

export function DicomViewer({
  caseStudy,
  brightness,
  contrast,
  zoomRequest,
  resetNonce,
  onZoomChange,
  onPhaseChange,
  onFormatChange,
}: DicomViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const csRef = useRef<CornerstoneModules | null>(null);
  const engineRef = useRef<{
    resize(immediate: boolean, preserveViewport: boolean): void;
    destroy(): void;
  } | null>(null);
  const toolGroupRef = useRef<ToolGroupLike | null>(null);
  const viewportRef = useRef<StackViewportLike | null>(null);
  const baseVoiRef = useRef<VoIRange | null>(null);
  const fitZoomRef = useRef(1);
  const onZoomChangeRef = useRef(onZoomChange);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  /** Remember the DICOM default window + fit zoom as the reset baseline. */
  const captureBaseline = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const range = viewport.getProperties?.()?.voiRange;
    if (range && range.upper > range.lower) {
      baseVoiRef.current = { lower: range.lower, upper: range.upper };
    }
    const zoom = viewport.getZoom?.();
    if (zoom && zoom > 0) fitZoomRef.current = zoom;
  }, []);

  /* ---------------- engine lifecycle (mount per image) ---------------- */

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let cancelled = false;
    const engineId = `engine-${caseStudy.imageId}`;
    const viewportId = `vp-${caseStudy.imageId}`;
    const toolGroupId = `tg-${caseStudy.imageId}`;

    onPhaseChange('loading');
    onFormatChange(undefined);

    async function mount() {
      try {
        const cs = await getCornerstoneModules();
        if (cancelled || !element) return;
        csRef.current = cs;

        // 1. Rendering engine + stack viewport
        const engine = new cs.core.RenderingEngine(engineId);
        engine.enableElement({
          viewportId,
          type: cs.core.Enums.ViewportType.STACK,
          element,
          defaultOptions: { background: [0, 0, 0] },
        });
        const viewport = engine.getViewport(viewportId) as Types.IStackViewport;
        engineRef.current = engine;
        viewportRef.current = viewport;

        // 2. Tool group (Pan on drag · Zoom on wheel / right-drag)
        const toolGroup =
          cs.tools.ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) {
          throw new Error('Could not create Cornerstone tool group.');
        }
        toolGroup.addTool(cs.tools.ZoomTool.toolName);
        toolGroup.addTool(cs.tools.PanTool.toolName);
        toolGroup.addViewport(viewportId, engineId);
        toolGroupRef.current = toolGroup;

        // 3. Fetch the DICOM P10 buffer and register it with the loader
        const response = await fetch(caseStudy.image.url, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch DICOM (HTTP ${response.status}).`);
        }
        const buffer = await response.arrayBuffer();
        const file = new File([buffer], `${caseStudy.imageId}.dcm`, {
          type: 'application/dicom',
        });
        const imageId = cs.loader.wadouri.fileManager.add(file);

        await viewport.setStack([imageId]);
        if (cancelled) return;
        viewport.render();

        // 4. Publish parsed pixel metadata for the stage caption
        const pixel = cs.core.metaData.get('imagePixelModule', imageId) as
          | { rows?: number; columns?: number; bitsStored?: number }
          | undefined;
        if (pixel?.rows) {
          onFormatChange(
            `DICOM ${pixel.bitsStored ?? 16}-bit · ${pixel.rows}×${pixel.columns}`
          );
        }

        // 5. Remember the default window + fit zoom as the reset baseline
        captureBaseline();
        setLoaded(true);
        onZoomChangeRef.current(100);
        onPhaseChange('ready');
      } catch (error) {
        if (!cancelled) {
          console.error('DICOM viewport error:', error);
          onPhaseChange('error');
        }
      }
    }

    void mount();

    // Keep the engine in sync with the element size.
    const resizeObserver = new ResizeObserver(() => {
      engineRef.current?.resize(true, false);
    });
    resizeObserver.observe(element);

    return () => {
      cancelled = true;
      setLoaded(false);
      resizeObserver.disconnect();
      viewportRef.current = null;
      toolGroupRef.current = null;
      try {
        engineRef.current?.destroy();
      } catch {
        /* already destroyed */
      }
      engineRef.current = null;
      if (csRef.current) {
        try {
          csRef.current.tools.ToolGroupManager.destroyToolGroup(toolGroupId);
        } catch {
          /* already gone */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseStudy.imageId, caseStudy.image.url]);

  /* ---------------- tool wiring (drag = pan, wheel = zoom) ---------------- */

  useEffect(() => {
    const cs = csRef.current;
    const toolGroup = toolGroupRef.current;
    if (!cs || !toolGroup) return;

    const { MouseBindings } = cs.tools.Enums;
    const { PanTool, ZoomTool } = cs.tools;

    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        { mouseButton: MouseBindings.Primary },
        { mouseButton: MouseBindings.Auxiliary },
      ],
    });
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [
        { mouseButton: MouseBindings.Wheel },
        { mouseButton: MouseBindings.Secondary },
      ],
    });
  }, [loaded, caseStudy.imageId]);

  /* ---------------- brightness / contrast -> viewport VOI ---------------- */

  useEffect(() => {
    const viewport = viewportRef.current;
    const base = baseVoiRef.current;
    if (!loaded || !viewport || !base) return;

    const baseWidth = base.upper - base.lower;
    if (!(baseWidth > 0)) return;
    const baseCenter = (base.upper + base.lower) / 2;

    // Contrast squeezes / stretches the window; brightness shifts its centre.
    const width = baseWidth * (100 / clamp(contrast, 25, 200));
    const center = baseCenter - ((brightness - 100) / 100) * baseWidth * 0.75;

    try {
      viewport.setProperties?.({
        voiRange: { lower: center - width / 2, upper: center + width / 2 },
      });
      viewport.render();
    } catch {
      /* this build may not expose programmatic VOI */
    }
  }, [brightness, contrast, loaded]);

  /* ---------------- toolbar zoom buttons ---------------- */

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!loaded || !viewport || zoomRequest.nonce === 0) return;
    const current = viewport.getZoom?.() ?? fitZoomRef.current;
    const next = clamp(current * zoomRequest.factor, 0.05, 50);
    try {
      viewport.setZoom?.(next);
      viewport.render();
    } catch {
      return;
    }
    const base = fitZoomRef.current || 1;
    onZoomChangeRef.current(Math.round((next / base) * 100));
  }, [zoomRequest, loaded]);

  /* ---------------- toolbar reset ---------------- */

  useEffect(() => {
    if (resetNonce === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.resetCamera();
    try {
      viewport.resetProperties();
    } catch {
      /* some viewport types don't expose properties reset */
    }
    viewport.render();
    captureBaseline();
    onZoomChangeRef.current(100);
  }, [resetNonce, loaded, caseStudy.imageId, captureBaseline]);

  return (
    <div
      className="absolute inset-0 bg-black"
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* Cornerstone3D mounts its canvases inside this element */}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
