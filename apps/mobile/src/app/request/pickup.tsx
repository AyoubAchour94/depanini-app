import { router } from 'expo-router';

import { PickupStep } from '@/features/request/PickupStep';
import { useRequestFlow } from '@/features/request/RequestFlowContext';

export default function PickupRoute() {
  const { setPickup } = useRequestFlow();
  return (
    <PickupStep
      onConfirm={(pickup) => {
        setPickup(pickup);
        // The drop-off step comes next (a later slice); until then, back home.
        router.back();
      }}
    />
  );
}
