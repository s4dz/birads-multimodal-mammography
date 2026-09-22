'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, ScanLine, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { login } from '@/lib/api-client';
import { APP_CONFIG } from '@/lib/config';
import { useTranslation } from '@/lib/i18n/LanguageProvider';

const INPUT_CLASSES =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';

/** Demo credentials so the reviewer knows what to type locally. */
const DEMO_HINT = [
  { role: 'Admin', username: 'admin', password: 'admin123' },
  { role: 'Radiologist', username: 'radiologist_01', password: 'rad123' },
];

/**
 * `/login` — backend-authenticated entry point. Replaces the old
 * localStorage-based reviewer setup: identity is now decided server-side.
 */
export function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const next = searchParams.get('next') ?? '';

  /* Already signed in? Skip the form. */
  useEffect(() => {
    let cancelled = false;
    import('@/lib/api-client')
      .then(({ fetchMe }) => fetchMe())
      .then((user) => {
        if (cancelled || !user) return;
        router.replace(next || (user.role === 'admin' ? '/admin' : '/review'));
      })
      .catch(() => {
        /* stay on the login screen */
      });
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (username.trim().length === 0 || password.length === 0) {
      setError(t('auth.errorRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      router.replace(
        next || (user.role === 'admin' ? '/admin' : '/review')
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('auth.errorRequired')
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-slate-950 p-6 text-slate-200 antialiased">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 shadow">
          <ScanLine className="size-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight text-slate-100">
            {APP_CONFIG.name}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            {t('auth.brandSub')}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl"
      >
        <h1 className="text-sm font-semibold text-slate-100">
          {t('auth.signInTitle')}
        </h1>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              {t('auth.username')}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t('auth.usernamePlaceholder')}
              autoComplete="username"
              className={INPUT_CLASSES}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              autoComplete="current-password"
              className={INPUT_CLASSES}
            />
          </div>
        </div>

        {error ? (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-rose-400">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-5 w-full"
          disabled={submitting}
          leftIcon={<LogIn className="size-4" />}
        >
          {submitting ? t('auth.signingIn') : t('auth.signIn')}
        </Button>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {t('auth.demoHint')}
          </p>
          <ul className="mt-2 space-y-1.5">
            {DEMO_HINT.map((account) => (
              <li key={account.username} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUsername(account.username);
                    setPassword(account.password);
                  }}
                  className="rounded border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
                >
                  {account.username}
                </button>
                <span className="font-mono text-[10px] text-slate-600">
                  {account.password}
                </span>
                <span className="ml-auto text-[10px] text-slate-600">
                  {account.role}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </form>
    </div>
  );
}