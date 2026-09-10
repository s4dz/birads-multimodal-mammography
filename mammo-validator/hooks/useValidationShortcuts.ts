'use client';

import { useEffect } from 'react';
import { useWorkbenchStore, selectActivePatientGroup } from '@/store/workbench-store';

/**
 * Global keyboard shortcuts for the validation workbench:
 *
 *   A                      approve the AI label for the active image
 *   R                      open the relabel dialog
 *   ← / →                  navigate views within current patient
 *   Shift+← / Shift+→      navigate between patients
 *   Home / End             jump to first / last image (global)
 *
 * Typing inside inputs/textareas and the relabel modal (which has its own
 * Escape handling) are ignored.
 */
export function useValidationShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const store = useWorkbenchStore.getState();
      if (store.isLoadingCases || store.cases.length === 0) return;

      // While the relabel modal is open only Escape should reach it.
      if (store.isRelabelOpen) return;

      const activeGroup = selectActivePatientGroup(store);
      const activeIndex = store.activeIndex;
      const viewIndex = activeGroup ? activeIndex - activeGroup.startIndex : 0;

      const isShift = event.shiftKey;

      switch (event.key) {
        case 'a':
        case 'A':
          event.preventDefault();
          void store.approveActive();
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          store.openRelabel();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (isShift) {
            store.goToPrevPatientGroup();
          } else if (activeGroup && viewIndex > 0) {
            store.goToIndex(activeIndex - 1);
          } else {
            store.goToPrev();
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (isShift) {
            store.goToNextPatientGroup();
          } else if (activeGroup && viewIndex < activeGroup.cases.length - 1) {
            store.goToIndex(activeIndex + 1);
          } else {
            store.goToNext();
          }
          break;
        case 'Home':
          event.preventDefault();
          store.goToIndex(0);
          break;
        case 'End':
          event.preventDefault();
          store.goToIndex(store.cases.length - 1);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
