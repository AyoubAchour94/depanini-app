import { usePreventRemove } from 'expo-router';
import { useEffect } from 'react';

import { confirmDiscard } from './confirm';
import { useRequestFlow } from './RequestFlowContext';

/**
 * Use on the first step of the flow: leaving it (back button or gesture)
 * leaves the whole request, so once something has been entered it asks before
 * throwing that away. Going back between later steps never asks. The flow
 * ends without asking through `exitGuardRef` (see `RequestFlowContext`).
 */
export function useExitGuard() {
  const { pickup, reset, exitGuardRef } = useRequestFlow();

  const disablePrevention = usePreventRemove(pickup !== null, ({ repeat }) => {
    void confirmDiscard().then((discard) => {
      if (!discard) return;
      reset();
      repeat();
    });
  });

  useEffect(() => {
    exitGuardRef.current = disablePrevention;
    return () => {
      exitGuardRef.current = null;
    };
  }, [exitGuardRef, disablePrevention]);
}
