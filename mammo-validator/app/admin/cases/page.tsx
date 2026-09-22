'use client';

import { useCallback, useEffect, useState } from 'react';
import { LinkIcon, Images } from 'lucide-react';
import {
  fetchAdminCases,
  fetchAdminUsers,
  postAdminAssignment,
} from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { useTranslation } from '@/lib/i18n/LanguageProvider';
import type { AdminCaseView, AppUser } from '@/lib/types';

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id;
}

export default function AdminCasesPage() {
  const { t } = useTranslation();
  const [cases, setCases] = useState<AdminCaseView[]>([]);
  const [radiologists, setRadiologists] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [assigning, setAssigning] = useState<AdminCaseView | null>(null);
  const [busy, setBusy] = useState<{ imageId: string; radioId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [caseList, users] = await Promise.all([
        fetchAdminCases(),
        fetchAdminUsers(),
      ]);
      setCases(caseList);
      setRadiologists(users.filter((user) => user.role === 'radiologist' && user.active));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAssignment = async (imageId: string, radioId: string, currentlyAssigned: boolean) => {
    setBusy({ imageId, radioId });
    try {
      await postAdminAssignment({
        imageId,
        radiologistId: radioId,
        unassign: currentlyAssigned,
      });
      setCases((current) =>
        current.map((item) => {
          if (item.imageId !== imageId) return item;
          const assigned = currentlyAssigned
            ? item.assignedRadiologists.filter((id) => id !== radioId)
            : [...item.assignedRadiologists, radioId];
          return { ...item, assignedRadiologists: assigned };
        })
      );
      setToast(
        `${imageId} → ${currentlyAssigned ? 'unassigned' : 'assigned'}`
      );
      window.setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Assignment failed.');
      window.setTimeout(() => setToast(null), 3000);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p className="p-8 text-center text-xs text-slate-500">{t('admin.loading')}</p>;
  }
  if (error) {
    return (
      <button type="button" onClick={() => void load()} className="p-8 text-xs text-rose-400 hover:underline">
        {t('admin.loadError')} — {t('admin.retry')}
      </button>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {cases.length} {t('admin.statCases')}
        </p>
        {toast ? (
          <span className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-200">{toast}</span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">{t('admin.case')}</th>
              <th className="px-4 py-2.5 font-semibold">Patient</th>
              <th className="px-4 py-2.5 font-semibold">{t('admin.view')}</th>
              <th className="px-4 py-2.5 font-semibold">AI label</th>
              <th className="px-4 py-2.5 font-semibold">{t('admin.assignedTo')}</th>
              <th className="px-4 py-2.5 font-semibold">{t('admin.reviewStatus')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 bg-slate-950/40">
            {cases.map((item) => (
              <tr key={item.imageId}>
                <td className="max-w-52 truncate px-4 py-2.5 font-mono text-slate-300" title={item.imageId}>
                  {item.imageId}
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-slate-400">{shortId(item.patient.id)}</span>
                  <span className="ml-2 text-[10px] text-slate-600">
                    {item.patient.sex} · {item.patient.ageAtStudy ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-400">
                  {item.laterality}-{item.view}
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300 ring-1 ring-inset ring-sky-400/30">
                    {item.ai.predictedClass.name}
                    <span className="ml-1 text-sky-400/70">{item.ai.predictedClass.range}</span>
                  </span>
                  {item.needsPrediction ? (
                    <span className="ml-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 ring-1 ring-inset ring-amber-400/30">
                      needs AI
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  {item.assignedRadiologists.length === 0 ? (
                    <span className="text-slate-600">{t('admin.notAssigned')}</span>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {radiologists
                        .filter((r) => item.assignedRadiologists.includes(r.id))
                        .map((r) => r.username)
                        .join(', ') || item.assignedRadiologists.join(', ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={item.reviewStatus} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="secondary" size="sm" leftIcon={<LinkIcon className="size-3.5" />} onClick={() => setAssigning(item)}>
                    {t('admin.assign')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title={
          <span className="flex items-center gap-2">
            <Images className="size-4 text-sky-400" />
            {t('admin.assign')} — {shortId(assigning?.imageId ?? '')}
          </span>
        }
      >
        {assigning ? (
          <div className="space-y-2">
            {radiologists.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                {t('admin.noRadiologists')}
              </p>
            ) : (
              radiologists.map((radiologist) => {
                const assigned = assigning.assignedRadiologists.includes(radiologist.id);
                const isBusy =
                  busy?.imageId === assigning.imageId &&
                  busy.radioId === radiologist.id;
                return (
                  <div
                    key={radiologist.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-200">{radiologist.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">{radiologist.username}</div>
                    </div>
                    <Button
                      variant={assigned ? 'secondary' : 'primary'}
                      size="sm"
                      loading={isBusy}
                      onClick={() => void toggleAssignment(assigning.imageId, radiologist.id, assigned)}
                    >
                      {assigned ? t('admin.unassign') : t('admin.assign')}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}