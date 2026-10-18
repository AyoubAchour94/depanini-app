import type { Place } from '@depanini/shared';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

interface RequestFlow {
  /** Confirmed in the pickup step; null until then. */
  pickup: Place | null;
  setPickup: (pickup: Place) => void;
}

const RequestFlowContext = createContext<RequestFlow | null>(null);

/**
 * What the customer has chosen so far while requesting a tow. The next steps
 * (drop-off, vehicle, fare) add their fields here.
 */
export function RequestFlowProvider({ children }: { children: ReactNode }) {
  const [pickup, setPickup] = useState<Place | null>(null);
  const value = useMemo(() => ({ pickup, setPickup }), [pickup]);
  return <RequestFlowContext.Provider value={value}>{children}</RequestFlowContext.Provider>;
}

export function useRequestFlow(): RequestFlow {
  const flow = useContext(RequestFlowContext);
  if (!flow) throw new Error('useRequestFlow must be used inside a RequestFlowProvider');
  return flow;
}
