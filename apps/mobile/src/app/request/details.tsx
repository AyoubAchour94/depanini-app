import { Redirect, router } from 'expo-router';

import { DetailsStep } from '@/features/request/DetailsStep';
import { useRequestFlow } from '@/features/request/RequestFlowContext';

export default function DetailsRoute() {
  const { dropoff, vehicleType, problemType, note, setDetails } = useRequestFlow();
  if (!dropoff) return <Redirect href="/request/pickup" />;
  return (
    <DetailsStep
      initial={{ vehicleType, problemType, note }}
      onConfirm={(details) => {
        setDetails(details);
        router.navigate('/request/fare');
      }}
    />
  );
}
