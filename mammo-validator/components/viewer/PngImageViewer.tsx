'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyCase } from '@/lib/types';
import type { ViewerTool } from './ViewerToolbar';
import type { ViewerPhase } from './ImageViewer';

/**
 * Canvas renderer for standard web images (PNG/JPG exports of mammograms).
 *
 * Implements the same reading gestures as the DICOM viewport:
 *  - wheel ......... zoom anchored at the cursor
 *  - left-drag ..... depends on the active tool:
 *       window ......... vertical = brightness, horizontal = contrast
 *       pan ............ move the image
 *       zoom ........... vertical drag zooms
 *  - double-click / Fit button -> reset to fit window
 */

type PointerMode = 'pan' | 'zoom' | 'window';

interface Camera {
  sx: number;
  ox: number;
  oy: number;
  fitScale: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

interface PngImageViewerProps {
  caseStudy: StudyCase;
  tool: ViewerTool;
  resetNonce: number;
  onPhaseChange: (phase: ViewerPhase) => void;
  onFormatChange: (caption: string | undefined) => void;
}

export function PngImageViewer({
  caseStudy,
  tool,
  resetNonce,
  onPhaseChange,
  onFormatChange,
}: PngImageViewerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const cameraRef = useRef<Camera>({ sx: 1, ox: 0, oy: 0, fitScale: 1 });
  const windowRef = useRef({ brightness: 100, contrast: 100 });
  const dragRef = useRef<{
    active: boolean;
    mode: PointerMode;
    lastX: number;
    lastY: number;
  }>({ active: false, mode: 'pan', lastX: 0, lastY: 0 });
  const pointerModeRef = useRef<PointerMode>('pan');

  const [zoomPct, setZoomPct] = useState(100);

  pointerModeRef.current =
    tool === 'pan' ? 'pan' : tool === 'zoom' ? 'zoom' : 'window';

  /* ---------------- drawing ---------------- */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !image.naturalWidth) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth === 0 || cssHeight === 0) return;

    if (canvas.width !== Math.round(cssWidth * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
    }
    if (canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.height = Math.round(cssHeight * dpr);
    }

    const cam = cameraRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#040506';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter =
      `brightness(${windowRef.current.brightness}%) ` +
      `contrast(${windowRef.current.contrast}%)`;
    ctx.drawImage(
      image,
      cam.ox,
      cam.oy,
      image.naturalWidth * cam.sx,
      image.naturalHeight * cam.sx
    );
    ctx.filter = 'none';

    const pct = Math.round((cam.sx / cam.fitScale) * 100);
    setZoomPct((prev) => (prev === pct ? prev : pct));
  }, []);

  /* ---------------- camera ops ---------------- */

  const fitToWindow = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !image.naturalWidth) return;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth === 0 || cssHeight === 0) return;

    const fitScale = Math.min(
      (cssWidth - 24) / image.naturalWidth,
      (cssHeight - 24) / image.naturalHeight
    );
    const cam = cameraRef.current;
    cam.fitScale = fitScale;
    cam.sx = fitScale;
    cam.ox = (cssWidth - image.naturalWidth * fitScale) / 2;
    cam.oy = (cssHeight - image.naturalHeight * fitScale) / 2;
    windowRef.current = { brightness: 100, contrast: 100 };
    draw();
  }, [draw]);

  /** Scale the image around the canvas point (cx, cy) by `factor`. */
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    const cam = cameraRef.current;
    const imageX = (cx - cam.ox) / cam.sx;
    const imageY = (cy - cam.oy) / cam.sx;
    const nextScale = clamp(
      cam.sx * factor,
      cam.fitScale * 0.1,
      cam.fitScale * 60
    );
    cam.sx = nextScale;
    cam.ox = cx - imageX * cam.sx;
    cam.oy = cy - imageY * cam.sx;
  }, []);

  /* ---------------- image lifecycle ---------------- */

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      fitToWindow();
      onPhaseChange('ready');
      onFormatChange(
        `${image.naturalWidth}×${image.naturalHeight} · 8-bit PNG`
      );
    };
    image.onerror = () => {
      if (cancelled) return;
      onPhaseChange('error');
    };
    image.src = caseStudy.image.url;
    onPhaseChange('loading');

    return () => {
      cancelled = true;
      image.src = '';
      imageRef.current = null;
    };
  }, [caseStudy.image.url, fitToWindow, onFormatChange, onPhaseChange]);

  /* ---------------- pointer / wheel / reset wiring ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const el: HTMLCanvasElement = canvas;

    const toLocal = (event: PointerEvent | WheelEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    function onPointerDown(event: PointerEvent) {
      el.setPointerCapture(event.pointerId);
      const { x, y } = toLocal(event);
      dragRef.current = {
        active: true,
        mode: pointerModeRef.current,
        lastX: x,
        lastY: y,
      };
      el.style.cursor =
        pointerModeRef.current === 'pan' ? 'grabbing' : 'crosshair';
      event.preventDefault();
    }

    function onPointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag.active) return;
      const { x, y } = toLocal(event);
      const dx = x - drag.lastX;
      const dy = y - drag.lastY;
      drag.lastX = x;
      drag.lastY = y;
      const cam = cameraRef.current;

      if (drag.mode === 'pan') {
        cam.ox += dx;
        cam.oy += dy;
      } else if (drag.mode === 'zoom') {
        zoomAt(x, y, Math.pow(1.012, -dy * 2));
      } else {
        const w = windowRef.current;
        w.brightness = clamp(w.brightness + dy * 0.7, 25, 320);
        w.contrast = clamp(w.contrast + dx * 0.5, 10, 250);
      }
      draw();
      event.preventDefault();
    }

    function onPointerUp(event: PointerEvent) {
      dragRef.current.active = false;
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const { x, y } = toLocal(event);
      zoomAt(x, y, Math.exp(-event.deltaY * 0.0016));
      draw();
    }

    function onDoubleClick(event: MouseEvent) {
      event.preventDefault();
      fitToWindow();
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDoubleClick);

    const resizeObserver = new ResizeObserver(() => fitToWindow());
    resizeObserver.observe(wrap);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDoubleClick);
      resizeObserver.disconnect();
    };
  }, [fitToWindow, draw, zoomAt]);

  /* cursor + reset driven by props */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dragRef.current.active) return;
    canvas.style.cursor =
      tool === 'pan' ? 'grab' : tool === 'zoom' ? 'zoom-in' : 'crosshair';
  }, [tool]);

  useEffect(() => {
    if (resetNonce > 0) fitToWindow();
  }, [resetNonce, fitToWindow]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-slate-950/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 backdrop-blur">
        {zoomPct}%
      </div>
    </div>
  );
}
