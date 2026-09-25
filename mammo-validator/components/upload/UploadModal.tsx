'use client';

import { useCallback, useRef, useState } from 'react';
import { Database, FileUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { uploadCases } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { Laterality, UploadCasesResponse } from '@/lib/types';

interface Slot {
  laterality: Laterality;
  cc: File | null;
  mlo: File | null;
}

interface FileFieldProps {
  labelKey: 'upload.ccView' | 'upload.mloView';
  file: File | null;
  onPick: (file: File | null) => void;
}

function FileField({ labelKey, file, onPick }: FileFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-slate-400">{t(labelKey)}</span>
        {file ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            aria-label="Clear selection"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:text-slate-200"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.dcm,.dicom,image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) onPick(picked);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={[
          'flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
          file
            ? 'border-slate-700 bg-slate-900 text-slate-300'
            : 'border-dashed border-slate-700 bg-slate-950 text-slate-400 hover:border-sky-500/60 hover:text-slate-200',
        ].join(' ')}
      >
        <FileUp className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          {file ? (
            <span className="font-mono text-[11px] text-sky-200">{file.name}</span>
          ) : (
            <span className="text-[11px]">{t('upload.pickFile')}</span>
          )}
        </span>
      </button>
    </div>
  );
}

function BreastSlotField({
  slot,
  index,
  canRemove,
  onChange,
}: {
  slot: Slot;
  index: number;
  canRemove: boolean;
  onChange: (next: Slot) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t('upload.breast')}
          </label>
          <div className="flex -space-x-px overflow-hidden rounded-md border border-slate-700">
            {(['L', 'R'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => onChange({ ...slot, laterality: side })}
                className={[
                  'px-2 py-0.5 text-[11px] font-semibold transition-colors',
                  slot.laterality === side
                    ? 'bg-sky-500/20 text-sky-200'
                    : 'bg-slate-900 text-slate-500 hover:text-slate-300',
                ].join(' ')}
              >
                {side}
              </button>
            ))}
          </div>
          <span className="font-mono text-[10px] text-slate-600">#{index + 1}</span>
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={() => onChange({ ...slot, cc: null, mlo: null })}
            title={t('upload.removeBreast')}
            className="inline-flex size-5 items-center justify-center rounded text-slate-500 transition-colors hover:text-rose-300"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <FileField
        labelKey="upload.ccView"
        file={slot.cc}
        onPick={(file) => onChange({ ...slot, cc: file })}
      />
      <FileField
        labelKey="upload.mloView"
        file={slot.mlo}
        onPick={(file) => onChange({ ...slot, mlo: file })}
      />
    </section>
  );
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful upload so the worklist can reload. */
  onDone: (result: UploadCasesResponse) => void;
}

/** Admin-only "upload images into the dataset" dialog shown in review mode. */
export function UploadModal({ open, onClose, onDone }: UploadModalProps) {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<Slot[]>([{ laterality: 'R', cc: null, mlo: null }]);
  const [patientId, setPatientId] = useState('');
  const [sex, setSex] = useState<'F' | 'M'>('F');
  const [age, setAge] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSlot = useCallback((index: number, next: Slot) => {
    setSlots((previous) => {
      const updated = previous.map((slot, i) => (i === index ? next : slot));
      if (previous.length === 2) {
        const other = index === 0 ? 1 : 0;
        if (previous[other].laterality === next.laterality && previous[index].laterality !== next.laterality) {
          updated[other] = { ...updated[other], laterality: previous[index].laterality };
        }
      }
      return updated;
    });
    setError(null);
  }, []);

  const addBreast = useCallback(() => {
    setSlots((previous) => {
      if (previous.length >= 2) return previous;
      const laterality: Laterality = previous[0].laterality === 'L' ? 'R' : 'L';
      return [...previous, { laterality, cc: null, mlo: null }];
    });
    setError(null);
  }, []);

  const removeBreast = useCallback(() => {
    setSlots((previous) => (previous.length === 2 ? [previous[0]] : previous));
    setError(null);
  }, []);

  const parsedAge = Number.parseInt(age, 10);
  const submit = useCallback(async () => {
    const ready = slots.filter((slot) => slot.cc && slot.mlo);
    if (ready.length === 0) {
      setError(t('upload.missingBreast'));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await uploadCases({
        patient: {
          id: patientId.trim() || undefined,
          sex,
          age:
            Number.isFinite(parsedAge) && parsedAge > 0 && parsedAge <= 120
              ? parsedAge
              : undefined,
        },
        breasts: ready.map((slot) => ({
          laterality: slot.laterality,
          cc: slot.cc!,
          mlo: slot.mlo!,
        })),
      });
      if (!result.ok) {
        throw new Error(t('upload.errorDefault'));
      }
      onDone(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('upload.errorDefault'));
    } finally {
      setIsSubmitting(false);
    }
  }, [slots, patientId, sex, parsedAge, t, onDone, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('upload.title')}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="success"
            size="md"
            loading={isSubmitting}
            leftIcon={<Database className="size-4" />}
            onClick={() => void submit()}
          >
            {isSubmitting ? t('common.saving') : t('upload.upload')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {t('upload.patientSection')}
          </h2>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">{t('upload.patientId')}</span>
            <input
              type="text"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              placeholder="auto"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">{t('upload.sex')}</span>
              <select
                value={sex}
                onChange={(event) => setSex(event.target.value as 'F' | 'M')}
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="F">F</option>
                <option value="M">M</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">{t('upload.age')}</span>
              <input
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {t('upload.imagesSection')}
          </h2>
          {slots.map((slot, index) => (
            <BreastSlotField
              key={index}
              slot={slot}
              index={index}
              canRemove={slots.length > 1}
              onChange={(next) => updateSlot(index, next)}
            />
          ))}
          {slots.length < 2 ? (
            <button
              type="button"
              onClick={addBreast}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 text-xs font-semibold text-slate-400 transition-colors hover:border-sky-500/60 hover:text-sky-200"
            >
              <Plus className="size-3.5" />
              {t('upload.addBreast')}
            </button>
          ) : (
            <button
              type="button"
              onClick={removeBreast}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-800 text-xs font-semibold text-slate-500 transition-colors hover:text-rose-300"
            >
              <X className="size-3.5" />
              {t('upload.removeBreast')}
            </button>
          )}
          <p className="text-[10px] leading-relaxed text-slate-600">
            {t('upload.breastHint')}
          </p>
        </section>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-2 text-[11px] leading-relaxed text-rose-200">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}