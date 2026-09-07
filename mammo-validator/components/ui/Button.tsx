import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'success'
  | 'secondary'
  | 'ghost'
  | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-sky-500 text-white hover:bg-sky-400 active:bg-sky-600 shadow-sm shadow-sky-950/50',
  success:
    'bg-emerald-500 text-emerald-950 hover:bg-emerald-400 active:bg-emerald-600 shadow-sm shadow-emerald-950/40 font-semibold',
  secondary:
    'bg-slate-800 text-slate-100 ring-1 ring-inset ring-slate-700 hover:bg-slate-700',
  ghost:
    'bg-transparent text-slate-300 hover:bg-white/5 hover:text-slate-100',
  danger:
    'bg-rose-600/90 text-white hover:bg-rose-500 active:bg-rose-700',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swap the label for a small inline spinner. */
  loading?: boolean;
  leftIcon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  leftIcon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const disabledState = disabled || loading;
  return (
    <button
      type="button"
      disabled={disabledState}
      className={[
        'inline-flex select-none items-center justify-center rounded-lg font-medium',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leftIcon
      )}
      {children}
    </button>
  );
}

interface KbdProps {
  children: ReactNode;
}

/** Small keyboard-hint chip, e.g. <Kbd>A</Kbd>. */
export function Kbd({ children }: KbdProps) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-white/20 bg-white/5 px-1 font-mono text-[10px] font-semibold text-slate-300">
      {children}
    </kbd>
  );
}
