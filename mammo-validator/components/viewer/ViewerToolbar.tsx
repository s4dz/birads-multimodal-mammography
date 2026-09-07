'use client';

import {
  Hand,
  RotateCcw,
  ScanLine,
  SunMedium,
  ZoomIn,
} from 'lucide-react';

export type ViewerTool = 'window' | 'pan' | 'zoom';

interface ToolDefinition {
  id: ViewerTool;
  label: string;
  icon: typeof Hand;
}

const TOOLS: ToolDefinition[] = [
  { id: 'window', label: 'Window / Level', icon: SunMedium },
  { id: 'pan', label: 'Pan', icon: Hand },
  { id: 'zoom', label: 'Zoom', icon: ZoomIn },
];

const HINTS: Record<ViewerTool, string> = {
  window: 'drag left to adjust window/level · wheel zooms',
  pan: 'drag to pan · wheel zooms',
  zoom: 'drag or wheel to zoom',
};

interface ViewerToolbarProps {
  tool: ViewerTool;
  onToolChange: (tool: ViewerTool) => void;
  onReset: () => void;
  /** e.g. "16-bit DICOM" / "8-bit PNG". */
  formatCaption?: string;
}

/** Floating dark toolbar overlaid at the bottom of the image stage. */
export function ViewerToolbar({
  tool,
  onToolChange,
  onReset,
  formatCaption,
}: ViewerToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950/85 px-1.5 py-1 shadow-2xl backdrop-blur">
      {TOOLS.map(({ id, label, icon: Icon }) => {
        const active = tool === id;
        return (
          <button
            key={id}
            type="button"
            title={`${label}${active ? ' (active)' : ''}`}
            aria-pressed={active}
            onClick={() => onToolChange(id)}
            className={[
              'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
              active
                ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/50'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
            ].join(' ')}
          >
            <Icon className="size-4" />
            <span className="hidden lg:inline">{label}</span>
          </button>
        );
      })}

      <div className="mx-1 h-5 w-px bg-slate-700/70" />

      <button
        type="button"
        title="Reset view / fit to window"
        onClick={onReset}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
      >
        <RotateCcw className="size-4" />
        <span className="hidden lg:inline">Fit / Reset</span>
      </button>

      <div className="mx-1 h-5 w-px bg-slate-700/70" />

      <div className="hidden max-w-56 items-center gap-1.5 pr-1.5 text-[11px] text-slate-500 sm:flex">
        <ScanLine className="size-3.5 shrink-0" />
        <span className="truncate">{HINTS[tool]}</span>
        {formatCaption ? (
          <span className="ml-1 shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {formatCaption}
          </span>
        ) : null}
      </div>
    </div>
  );
}
