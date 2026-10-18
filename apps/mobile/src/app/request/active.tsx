import { ActiveRequestScreen } from '@/features/request/ActiveRequestScreen';

// The `id` param after a create is only a hint; the screen reads the active request itself.
export default function ActiveRequestRoute() {
  return <ActiveRequestScreen />;
}
