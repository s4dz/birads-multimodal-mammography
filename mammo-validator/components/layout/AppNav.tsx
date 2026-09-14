'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ClipboardCheck,
  ScanSearch,
  TriangleAlert,
} from 'lucide-react';
import { APP_CONFIG } from '@/lib/config';
import { HelpModal } from '@/components/help/HelpModal';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { Language, TranslationKey } from '@/lib/i18n/dictionary';

interface NavMode {
  href: string;
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  icon: typeof ScanSearch;
}

const MODES: NavMode[] = [
  {
    href: '/predict',
    labelKey: 'nav.predict',
    hintKey: 'nav.predictHint',
    icon: ScanSearch,
  },
  {
    href: '/review',
    labelKey: 'nav.review',
    hintKey: 'nav.reviewHint',
    icon: ClipboardCheck,
  },
];

/** The two language buttons shown at the top-right of the UI. */
const LANGUAGE_BUTTONS: {
  code: Language;
  label: string;
  hintKey: TranslationKey;
}[] = [
  { code: 'en', label: 'EN', hintKey: 'lang.switchToEnglish' },
  { code: 'vi', label: 'VI', hintKey: 'lang.switchToVietnamese' },
];

/**
 * Shared top bar: brand, the two mode tabs, a help button and the language
 * switcher (EN / VI) at the top-right.
 */
export function AppNav() {
  const pathname = usePathname() ?? '';
  const { language, setLanguage, t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);

  const activeMode =
    MODES.find((mode) => pathname.startsWith(mode.href)) ?? MODES[0];
  const ActiveIcon = activeMode.icon;

  return (
    <>
      <nav className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-sky-500/15 ring-1 ring-inset ring-sky-400/30">
            <ActiveIcon className="size-4 text-sky-300" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-slate-100 sm:inline">
            {t('app.name')}
          </span>
          <span className="hidden rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 lg:inline">
            v{APP_CONFIG.version}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          {MODES.map(({ href, labelKey, hintKey, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={t(hintKey)}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                ].join(' ')}
              >
                <Icon className="size-3.5" />
                {t(labelKey)}
              </Link>
            );
          })}
        </div>

        {/* Right-hand controls */}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[11px] text-amber-300/80 2xl:flex">
            <TriangleAlert className="size-3.5" />
            {t('nav.disclaimer')}
          </span>

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title={t('help.openHint')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <BookOpen className="size-3.5" />
            <span className="hidden xl:inline">{t('help.open')}</span>
          </button>

          {/* Language switcher — EN / VI */}
          <div
            className="flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/60 p-0.5"
            role="group"
            aria-label="Language"
          >
            {LANGUAGE_BUTTONS.map(({ code, label, hintKey }) => {
              const isActive = language === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  title={t(hintKey)}
                  aria-pressed={isActive}
                  className={[
                    'inline-flex h-7 w-9 items-center justify-center rounded-md font-mono text-[11px] font-bold transition-colors',
                    isActive
                      ? 'bg-sky-500/25 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
