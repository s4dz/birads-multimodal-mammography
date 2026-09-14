'use client';

import { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { useWorkbenchStore } from '@/store/workbench-store';

/** Stored `value` stays stable (it is the audit value); only the label is translated. */
const SPECIALTIES: { value: string; labelKey: TranslationKey }[] = [
  { value: 'Breast Imaging', labelKey: 'setup.specialtyBreast' },
  { value: 'General Radiology', labelKey: 'setup.specialtyGeneral' },
  { value: 'Other', labelKey: 'setup.specialtyOther' },
];

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
  const { t } = useTranslation();
  const setReviewer = useWorkbenchStore((state) => state.setReviewer);

  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState<string>(SPECIALTIES[0].value);
  const [id, setId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setId(generateReviewerId());
  }, []);

  const blocker =
    name.trim().length === 0
      ? t('setup.nameBlocker')
      : specialty.length === 0
        ? t('setup.specialtyBlocker')
        : id.trim().length === 0
          ? t('setup.idBlocker')
          : null;
  const canSubmit = blocker === null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError(t('setup.nameRequired'));
      return;
    }
    if (specialty.length === 0) {
      setError(t('setup.specialtyRequired'));
      return;
    }
    if (id.trim().length === 0) {
      setError(t('setup.idRequired'));
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
            {t('app.name')}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            {t('setup.brandSub')}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl"
      >
        <h1 className="text-sm font-semibold text-slate-100">
          {t('setup.title')}
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {t('setup.localNote')}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="reviewer-name"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              {t('setup.name')} <span className="text-slate-600">{t('setup.required')}</span>
            </label>
            <input
              id="reviewer-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('setup.namePlaceholder')}
              autoComplete="name"
              className={INPUT_CLASSES}
            />
          </div>

          <div>
            <label
              htmlFor="reviewer-specialty"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              {t('setup.specialty')} <span className="text-slate-600">{t('setup.required')}</span>
            </label>
            <select
              id="reviewer-specialty"
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              className={INPUT_CLASSES}
            >
              {SPECIALTIES.map(({ value, labelKey }) => (
                <option key={value} value={value}>
                  {t(labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="reviewer-id"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              {t('setup.id')} <span className="text-slate-600">{t('setup.editable')}</span>
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
              {t('setup.idHint')}
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
          title={blocker ?? t('setup.enterHint')}
        >
          {t('setup.enter')}
        </Button>
      </form>
    </div>
  );
}