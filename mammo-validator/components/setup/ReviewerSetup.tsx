'use client';

import { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkbenchStore } from '@/store/workbench-store';

const SPECIALTIES = ['Breast Imaging', 'General Radiology', 'Other'] as const;

const INPUT_CLASSES =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';

function generateReviewerId(): string {
  const year = new Date().getFullYear();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `RAD-${year}-${suffix}`;
}

/**
 * First-run reviewer setup: collects the radiologist identity (name,
 * specialty and reviewer ID) before the workbench is shown.
 */
export function ReviewerSetup() {
  const setReviewer = useWorkbenchStore((state) => state.setReviewer);

  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState<string>(SPECIALTIES[0]);
  const [id, setId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setId(generateReviewerId());
  }, []);

  const blocker =
    name.trim().length === 0
      ? 'Add a reviewer name.'
      : specialty.length === 0
        ? 'Pick a specialty.'
        : id.trim().length === 0
          ? 'Enter a reviewer ID.'
          : null;
  const canSubmit = blocker === null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError('Reviewer name is required.');
      return;
    }
    if (specialty.length === 0) {
      setError('Specialty is required.');
      return;
    }
    if (id.trim().length === 0) {
      setError('Reviewer ID is required.');
      return;
    }
    setError(null);
    setReviewer({
      id: id.trim(),
      name: name.trim(),
      specialty,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-slate-950 p-6 text-slate-200 antialiased">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 shadow">
          <ScanLine className="size-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight text-slate-100">
            Mammo QA Workbench
          </div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Reviewer setup
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl"
      >
        <h1 className="text-sm font-semibold text-slate-100">
          Reviewer setup
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          This identity is stored locally in this browser only, and its
          reviewer ID is stamped on every validation decision recorded in this
          session.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="reviewer-name"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              Reviewer name <span className="text-slate-600">(required)</span>
            </label>
            <input
              id="reviewer-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Dr. Nguyen Van A"
              autoComplete="name"
              className={INPUT_CLASSES}
            />
          </div>

          <div>
            <label
              htmlFor="reviewer-specialty"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              Specialty <span className="text-slate-600">(required)</span>
            </label>
            <select
              id="reviewer-specialty"
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              className={INPUT_CLASSES}
            >
              {SPECIALTIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="reviewer-id"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              Reviewer ID <span className="text-slate-600">(editable)</span>
            </label>
            <input
              id="reviewer-id"
              type="text"
              value={id}
              onChange={(event) => setId(event.target.value)}
              aria-describedby="reviewer-id-hint"
              className={`${INPUT_CLASSES} font-mono`}
            />
            <p
              id="reviewer-id-hint"
              className="mt-1 text-[10px] text-slate-600"
            >
              Auto-generated — you can edit it if your institution assigns an ID.
            </p>
          </div>
        </div>

        {error ? <p className="mt-3 text-xs text-rose-400">{error}</p> : null}

        {blocker ? (
          <p className="mt-3 text-[10px] text-slate-600">{blocker}</p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-5 w-full"
          disabled={!canSubmit}
          title={blocker ?? 'Enter the workbench as this reviewer'}
        >
          Enter workbench
        </Button>
      </form>
    </div>
  );
}