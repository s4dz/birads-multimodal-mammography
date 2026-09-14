'use client';

import type { ReactNode } from 'react';
import { Button, Kbd } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { TranslationKey } from '@/lib/i18n/dictionary';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Steps({ keys }: { keys: TranslationKey[] }) {
  const { t } = useTranslation();
  return (
    <ol className="space-y-1.5">
      {keys.map((key, index) => (
        <li key={key} className="flex gap-2 text-xs leading-relaxed text-slate-400">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-white/5 font-mono text-[9px] text-slate-400">
            {index + 1}
          </span>
          <span>{t(key)}</span>
        </li>
      ))}
    </ol>
  );
}

const SHORTCUTS: { keys: string[]; labelKey: TranslationKey }[] = [
  { keys: ['A'], labelKey: 'help.shortcuts.approve' },
  { keys: ['R'], labelKey: 'help.shortcuts.relabel' },
  { keys: ['←', '→'], labelKey: 'help.shortcuts.view' },
  { keys: ['↑', '↓'], labelKey: 'help.shortcuts.patient' },
  { keys: ['Home', 'End'], labelKey: 'help.shortcuts.jump' },
];

/**
 * Built-in instructions, shown in the language currently selected in the top bar.
 */
export function HelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('help.title')}
      widthClassName="max-w-2xl"
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('help.close')}
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-xs leading-relaxed text-slate-400">{t('help.intro')}</p>

        <Section title={t('help.mode1.title')}>
          <Steps
            keys={[
              'help.mode1.step1',
              'help.mode1.step2',
              'help.mode1.step3',
              'help.mode1.step4',
              'help.mode1.step5',
            ]}
          />
        </Section>

        <Section title={t('help.mode2.title')}>
          <Steps
            keys={[
              'help.mode2.step1',
              'help.mode2.step2',
              'help.mode2.step3',
              'help.mode2.step4',
            ]}
          />
        </Section>

        <Section title={t('help.unlabeled.title')}>
          <p className="text-xs leading-relaxed text-amber-200/90">
            {t('help.unlabeled.body')}
          </p>
        </Section>

        <Section title={t('help.viewer.title')}>
          <p className="text-xs leading-relaxed text-slate-400">
            {t('help.viewer.body')}
          </p>
        </Section>

        <Section title={t('help.shortcuts.title')}>
          <ul className="space-y-1.5">
            {SHORTCUTS.map(({ keys, labelKey }) => (
              <li
                key={labelKey}
                className="flex items-center gap-2 text-xs text-slate-400"
              >
                <span className="flex w-24 shrink-0 items-center gap-1">
                  {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </span>
                {t(labelKey)}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('help.models.title')}>
          <p className="text-xs leading-relaxed text-slate-400">
            {t('help.models.body')}
          </p>
        </Section>
      </div>
    </Modal>
  );
}
