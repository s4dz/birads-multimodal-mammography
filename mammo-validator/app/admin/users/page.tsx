'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw, UserRound } from 'lucide-react';
import { createAdminUser, fetchAdminUsers, updateUserActive } from '@/lib/api-client';
import type { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { AppUser, UserRole } from '@/lib/types';

const INPUT_CLASSES =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';

interface UserForm {
  username: string;
  name: string;
  password: string;
  role: UserRole;
  specialty: string;
}

const EMPTY_FORM: UserForm = {
  username: '',
  name: '',
  password: '',
  role: 'radiologist',
  specialty: 'Breast Imaging',
};

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setUsers(await fetchAdminUsers());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (
      form.username.trim().length === 0 ||
      form.name.trim().length === 0 ||
      form.password.length === 0
    ) {
      setFormError('username, name and password are required.');
      return;
    }
    setSaving(true);
    try {
      await createAdminUser({
        username: form.username.trim(),
        name: form.name.trim(),
        password: form.password,
        role: form.role,
        specialty: form.specialty,
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: AppUser) => {
    setToggling(user.id);
    try {
      await updateUserActive(user.id, !user.active);
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, active: !item.active } : item
        )
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
      >
        <h2 className="text-sm font-semibold text-slate-100">
          {t('admin.createUser')}
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">{t('auth.username')}</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="radiologist_05" className={INPUT_CLASSES} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">{t('admin.name')}</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Nguyen Van A" className={INPUT_CLASSES} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">{t('auth.password')}</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className={INPUT_CLASSES} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">{t('admin.role')}</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={INPUT_CLASSES}>
              <option value="radiologist">Radiologist</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">{t('admin.specialty')}</label>
            <input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Breast Imaging" className={INPUT_CLASSES} />
          </div>
        </div>
        {formError ? <p className="mt-3 text-xs text-rose-400">{formError}</p> : null}
        <div className="mt-4 flex items-center gap-2">
          <Button variant="primary" type="submit" loading={saving} leftIcon={<Plus className="size-4" />}>
            {saving ? t('common.saving') : t('admin.createUser')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setForm(EMPTY_FORM); setFormError(null); }}>
            <RotateCcw className="size-3.5" />
            {t('admin.reset')}
          </Button>
        </div>
      </form>

      {/* User table */}
      {loading ? (
        <p className="py-8 text-center text-xs text-slate-500">{t('admin.loading')}</p>
      ) : error ? (
        <button type="button" onClick={() => void load()} className="text-xs text-rose-400 hover:underline">
          {t('admin.loadError')} — {t('admin.retry')}
        </button>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t('admin.name')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('auth.username')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('admin.role')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('admin.specialty')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('admin.status')}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 bg-slate-950/40">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 text-slate-200">
                      <UserRound className="size-3.5 text-slate-500" />
                      {user.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-400">{user.username}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${user.role === 'admin' ? 'bg-indigo-500/10 text-indigo-300 ring-indigo-400/30' : 'bg-sky-500/10 text-sky-300 ring-sky-400/30'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{user.specialty}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${user.active ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30' : 'bg-rose-500/10 text-rose-300 ring-rose-400/30'}`}>
                      {user.active ? t('admin.active') : t('admin.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {user.role === 'radiologist' ? (
                      <button
                        type="button"
                        disabled={toggling === user.id}
                        onClick={() => void toggleActive(user)}
                        className="rounded-md border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:opacity-50"
                      >
                        {user.active ? t('admin.deactivate') : t('admin.activate')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}