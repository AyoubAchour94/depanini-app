import { router } from 'expo-router';

import { PickupStep } from '@/features/request/PickupStep';
import { useRequestFlow } from '@/features/request/RequestFlowContext';
import { useExitGuard } from '@/features/request/useExitGuard';

export default function PickupRoute() {
  const { setPickup } = useRequestFlow();
  useExitGuard();
  return (
    <PickupStep
      onBack={() => router.back()}
      onConfirm={(pickup) => {
        setPickup(pickup);
        router.navigate('/request/dropoff');
      }}
    />
  );
}
