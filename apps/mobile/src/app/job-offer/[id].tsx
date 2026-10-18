import { useLocalSearchParams } from 'expo-router';

import { RequestDetailsScreen } from '@/features/driver/RequestDetailsScreen';

export default function JobOfferRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RequestDetailsScreen id={id} />;
}
