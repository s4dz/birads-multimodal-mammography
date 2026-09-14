import { Suspense } from 'react';
import { PredictWorkbench } from '@/components/predict/PredictWorkbench';

/**
 * `/predict` — score one PNG or DICOM mammogram with the model ensemble.
 * `useSearchParams` (used to accept `?sample=` deep links from review mode)
 * requires a Suspense boundary.
 */
export default function PredictPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-500">
          Loading predictor…
        </div>
      }
    >
      <PredictWorkbench />
    </Suspense>
  );
}