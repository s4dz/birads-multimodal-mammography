'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyCase } from '@/lib/types';
import type { ViewerPhase, ZoomRequest } from './ImageViewer';

/**
 * Canvas renderer for standard web images (PNG/JPG exports of mammograms).
 *
 * Reading gestures — no mode switching:
 *   - drag .......... pan
 *   - wheel ......... zoom anchored at the cursor
 *   - double-click .. fit to window
 *
 * Brightness / contrast come exclusively from the toolbar sliders, so the
 * mammogram itself is only ever panned or zoomed — never used as a slider.
 */

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
  brightness: number;
  contrast: number;
  zoomRequest: ZoomRequest;
  resetNonce: number;
  onZoomChange: (percent: number) => void;
  onPhaseChange: (phase: ViewerPhase) => void;
  onFormatChange: (caption: string | undefined) => void;
}

export function PngImageViewer({
  caseStudy,
  brightness,
  contrast,
  zoomRequest,
  resetNonce,
  onZoomChange,
  onPhaseChange,
  onFormatChange,
}: PngImageViewerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const cameraRef = useRef<Camera>({ sx: 1, ox: 0, oy: 0, fitScale: 1 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const displayRef = useRef({ brightness, contrast });
  const onZoomChangeRef = useRef(onZoomChange);

  const [zoomPct, setZoomPct] = useState(100);

  /* Keep the callback in a ref so `draw` stays referentially stable. */
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

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
    const display = displayRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#040506';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter =
      `brightness(${display.brightness}%) ` +
      `contrast(${display.contrast}%)`;
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
    onZoomChangeRef.current(pct);
  }, []);

  /* Brightness / contrast bars -> immediate redraw. */
  useEffect(() => {
    displayRef.current = { brightness, contrast };
    draw();
  }, [brightness, contrast, draw]);

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
    draw();
  }, [draw]);

  /** Scale the image around the canvas point (cx, cy) by `factor`. */
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    const cam = cameraRef.current;
    const imageX = (cx - cam.ox) / cam.sx;
    const imageY = (cy - cam.oy) / cam.sx;
    cam.sx = clamp(cam.sx * factor, cam.fitScale * 0.1, cam.fitScale * 60);
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
      dragRef.current = { active: true, lastX: x, lastY: y };
      event.preventDefault();
    }

    function onPointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag.active) return;
      const { x, y } = toLocal(event);
      const cam = cameraRef.current;
      cam.ox += x - drag.lastX;
      cam.oy += y - drag.lastY;
      drag.lastX = x;
      drag.lastY = y;
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

  /* Toolbar zoom buttons. */
  useEffect(() => {
    if (zoomRequest.nonce === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, zoomRequest.factor);
    draw();
  }, [zoomRequest, zoomAt, draw]);

  /* Toolbar reset. */
  useEffect(() => {
    if (resetNonce > 0) fitToWindow();
  }, [resetNonce, fitToWindow]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />
      <div className="pointer-events-none absolute bottom-14 left-3 rounded bg-slate-950/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 backdrop-blur">
        {zoomPct}%
      </div>
    </div>
  );
}
