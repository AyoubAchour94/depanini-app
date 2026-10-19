import { Redirect, router } from 'expo-router';

import { DropoffStep } from '@/features/request/DropoffStep';
import { useRequestFlow } from '@/features/request/RequestFlowContext';

export default function DropoffRoute() {
  const { pickup, dropoff, setDropoff } = useRequestFlow();
  if (!pickup) return <Redirect href="/request/pickup" />;
  return (
    <DropoffStep
      pickup={pickup}
      initial={dropoff}
      onBack={() => router.back()}
      onConfirm={(place) => {
        setDropoff(place);
        router.navigate('/request/details');
      }}
    />
  );
}
