import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { FareStep } from '@/features/request/FareStep';
import { useRequestFlow } from '@/features/request/RequestFlowContext';

export default function FareRoute() {
  const queryClient = useQueryClient();
  const { problemType, reset, exitGuardRef } = useRequestFlow();
  const [finished, setFinished] = useState(false);
  if (finished) return null;
  if (!problemType) return <Redirect href="/request/pickup" />;

  /** Ends the flow: forgets the draft, drops the steps from the stack and shows the open request. */
  const finish = (id?: string) => {
    setFinished(true);
    exitGuardRef.current?.();
    reset();
    router.dismissAll();
    router.push(id ? { pathname: '/request/active', params: { id } } : '/request/active');
  };

  return (
    <FareStep
      onBack={() => router.back()}
      onCreated={(request) => finish(request.id)}
      onAlreadyOpen={() => finish()}
      // The account says it has a customer profile but the API disagrees; refetching
      // it makes the root layout send the customer to onboarding.
      onNoProfile={() => void queryClient.invalidateQueries({ queryKey: ['me'] })}
    />
  );
}
