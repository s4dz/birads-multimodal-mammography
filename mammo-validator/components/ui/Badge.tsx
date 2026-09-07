import type { ReactNode } from 'react';
import { toneClasses } from '@/lib/taxonomy';
import type { Tone } from '@/lib/types';

interface ToneBadgeProps {
  tone: Tone;
  children: ReactNode;
  className?: string;
}

/** Severity-coloured pill used for BI-RADS labels & statuses. */
export function ToneBadge({ tone, children, className = '' }: ToneBadgeProps) {
  const palette = toneClasses(tone);
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        palette.badge,
        className,
      ].join(' ')}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${palette.dot}`} />
      {children}
    </span>
  );
}

interface NeutralBadgeProps {
  children: ReactNode;
  className?: string;
}

export function NeutralBadge({ children, className = '' }: NeutralBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-slate-400 ring-1 ring-inset ring-white/10',
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
