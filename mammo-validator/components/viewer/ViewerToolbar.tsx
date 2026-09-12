'use client';

import {
  Contrast,
  RotateCcw,
  SunMedium,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

/** Neutral (100%) position for the brightness / contrast bars. */
export const DISPLAY_NEUTRAL = 100;

const BRIGHTNESS_LIMITS = { min: 40, max: 200 } as const;
const CONTRAST_LIMITS = { min: 25, max: 200 } as const;

interface SliderBarProps {
  icon: typeof SunMedium;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** A labelled horizontal bar (native range input) for one display control. */
function SliderBar({
  icon: Icon,
  label,
  value,
  min,
  max,
  onChange,
}: SliderBarProps) {
  const modified = value !== DISPLAY_NEUTRAL;
  return (
    <label className="inline-flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
      <span className="hidden text-xs font-medium text-slate-400 sm:inline">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        title={`${label} ${value}% — double-click to reset`}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => onChange(DISPLAY_NEUTRAL)}
        className="h-1.5 w-24 cursor-pointer accent-sky-400 lg:w-32"
      />
      <span
        className={[
          'w-9 shrink-0 text-right font-mono text-[10px]',
          modified ? 'text-sky-300' : 'text-slate-500',
        ].join(' ')}
      >
        {value}%
      </span>
    </label>
  );
}

interface ViewerToolbarProps {
  brightness: number;
  contrast: number;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

/**
 * Floating control bar over the image stage.
 *
 * Brightness and contrast are adjusted with explicit sliders (bars) so the
 * doctor never has to drag on the mammogram to change the display — drag always
 * pans and the wheel always zooms.
 */
export function ViewerToolbar({
  brightness,
  contrast,
  onBrightnessChange,
  onContrastChange,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onReset,
}: ViewerToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-700/80 bg-slate-950/85 px-3 py-1.5 shadow-2xl backdrop-blur">
      <SliderBar
        icon={SunMedium}
        label="Brightness"
        value={brightness}
        min={BRIGHTNESS_LIMITS.min}
        max={BRIGHTNESS_LIMITS.max}
        onChange={onBrightnessChange}
      />

      <div className="hidden h-5 w-px bg-slate-700/70 sm:block" />

      <SliderBar
        icon={Contrast}
        label="Contrast"
        value={contrast}
        min={CONTRAST_LIMITS.min}
        max={CONTRAST_LIMITS.max}
        onChange={onContrastChange}
      />

      <div className="h-5 w-px bg-slate-700/70" />

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title="Zoom out"
          onClick={onZoomOut}
          className="inline-flex size-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ZoomOut className="size-4" />
        </button>
        <span className="min-w-10 text-center font-mono text-[10px] text-slate-400">
          {zoomPercent}%
        </span>
        <button
          type="button"
          title="Zoom in"
          onClick={onZoomIn}
          className="inline-flex size-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ZoomIn className="size-4" />
        </button>
      </div>

      <div className="h-5 w-px bg-slate-700/70" />

      <button
        type="button"
        title="Reset brightness, contrast, zoom and pan"
        onClick={onReset}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
      >
        <RotateCcw className="size-3.5" />
        Reset
      </button>
    </div>
  );
}
