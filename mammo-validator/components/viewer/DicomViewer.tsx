'use client';

import { useEffect, useRef, useState } from 'react';
import type { Types } from '@cornerstonejs/core';
import type { StudyCase } from '@/lib/types';
import type { ViewerTool } from './ViewerToolbar';
import type { ViewerPhase } from './ImageViewer';

/**
 * Native DICOM renderer powered by Cornerstone3D v5.
 *
 * Each mounted instance owns one RenderingEngine + StackViewport and a tool
 * group configured for mammography reading:
 *   - Wheel ............... ZoomTool (native mouseWheelCallback)
 *   - Right-drag .......... ZoomTool
 *   - Middle-drag ......... PanTool
 *   - Left-drag ........... the active toolbar tool (Window/Level, Pan, Zoom)
 *
 * DICOM P10 files are fetched from `/public/samples` and registered with the
 * DICOM image loader's `wadouri.fileManager` (imageId scheme `dicomfile:`).
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

type StackViewportLike = {
  setStack(imageIds: string[]): Promise<unknown>;
  render(): void;
  resetCamera(): void;
  resetProperties(): void;
};

type ToolGroupLike = {
  addTool(toolName: string): void;
  setToolActive(
    toolName: string,
    options: { bindings: { mouseButton: number }[] }
  ): void;
  setToolDisabled(toolName: string): void;
  addViewport(viewportId: string, renderingEngineId: string): void;
};

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
  tool: ViewerTool;
  resetNonce: number;
  onPhaseChange: (phase: ViewerPhase) => void;
  onFormatChange: (caption: string | undefined) => void;
}

export function DicomViewer({
  caseStudy,
  tool,
  resetNonce,
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
  const [loaded, setLoaded] = useState(false);

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

        // 2. Tool group (Window/Level · Pan · Zoom)
        const toolGroup =
          cs.tools.ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) {
          throw new Error('Could not create Cornerstone tool group.');
        }
        toolGroup.addTool(cs.tools.ZoomTool.toolName);
        toolGroup.addTool(cs.tools.PanTool.toolName);
        toolGroup.addTool(cs.tools.WindowLevelTool.toolName);
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
        setLoaded(true);
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

  /* ---------------- tool mode + reset wiring ---------------- */

  useEffect(() => {
    const cs = csRef.current;
    const toolGroup = toolGroupRef.current;
    if (!cs || !toolGroup) return;

    const { MouseBindings } = cs.tools.Enums;
    const { WindowLevelTool, PanTool, ZoomTool } = cs.tools;
    const primary = [{ mouseButton: MouseBindings.Primary }];
    const wheelAndSecondary = [
      { mouseButton: MouseBindings.Wheel },
      { mouseButton: MouseBindings.Secondary },
    ];

    if (tool === 'window') {
      toolGroup.setToolDisabled(PanTool.toolName);
      toolGroup.setToolDisabled(ZoomTool.toolName);
      toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: primary });
      // keep pan on the middle button & zoom on wheel/right-click available
      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [{ mouseButton: MouseBindings.Auxiliary }],
      });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: wheelAndSecondary,
      });
    } else if (tool === 'pan') {
      toolGroup.setToolDisabled(WindowLevelTool.toolName);
      toolGroup.setToolDisabled(ZoomTool.toolName);
      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [
          { mouseButton: MouseBindings.Primary },
          { mouseButton: MouseBindings.Auxiliary },
        ],
      });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: wheelAndSecondary,
      });
    } else {
      toolGroup.setToolDisabled(WindowLevelTool.toolName);
      toolGroup.setToolDisabled(PanTool.toolName);
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [
          { mouseButton: MouseBindings.Primary },
          ...wheelAndSecondary,
        ],
      });
    }
  }, [tool, loaded, caseStudy.imageId]);

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
  }, [resetNonce, loaded, caseStudy.imageId]);

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
