'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional semantic heading rendered in the modal header. */
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
}

/** Accessible, dark-theme modal shell used by the relabel dialog. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  widthClassName = 'max-w-xl',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={[
          'relative w-full rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl',
          widthClassName,
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
