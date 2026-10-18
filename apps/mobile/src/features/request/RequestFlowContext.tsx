import type { Place, ProblemType, VehicleType } from '@depanini/shared';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

/** What the customer has entered so far; every field is empty until its step is confirmed. */
export interface RequestDraft {
  pickup: Place | null;
  dropoff: Place | null;
  vehicleType: VehicleType | null;
  problemType: ProblemType | null;
  note: string;
  /** Whole dinars; null until the customer changes the suggestion. */
  proposedFare: number | null;
}

const EMPTY_DRAFT: RequestDraft = {
  pickup: null,
  dropoff: null,
  vehicleType: null,
  problemType: null,
  note: '',
  proposedFare: null,
};

interface RequestFlow extends RequestDraft {
  setPickup: (pickup: Place) => void;
  /** A new drop-off changes the trip, so a fare chosen for the old one is dropped. */
  setDropoff: (dropoff: Place) => void;
  /** A new vehicle type changes the suggested fare, so a fare chosen for the old one is dropped. */
  setDetails: (details: {
    vehicleType: VehicleType;
    problemType: ProblemType;
    note: string;
  }) => void;
  setProposedFare: (fare: number) => void;
  /** Forgets everything entered (the request was sent or discarded). */
  reset: () => void;
  /** Ends the exit confirmation so the flow can be left on purpose; set by `useExitGuard`. */
  exitGuardRef: RefObject<(() => void) | null>;
}

const RequestFlowContext = createContext<RequestFlow | null>(null);

/**
 * What the customer has chosen so far while requesting a tow. Lives above the
 * navigator so going back to an earlier step keeps what was entered.
 */
export function RequestFlowProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** Starts the draft part-way through (tests). */
  initial?: Partial<RequestDraft>;
}) {
  const [draft, setDraft] = useState<RequestDraft>({ ...EMPTY_DRAFT, ...initial });
  const exitGuardRef = useRef<(() => void) | null>(null);

  const setPickup = useCallback((pickup: Place) => setDraft((d) => ({ ...d, pickup })), []);
  const setDropoff = useCallback(
    (dropoff: Place) => setDraft((d) => ({ ...d, dropoff, proposedFare: null })),
    [],
  );
  const setDetails = useCallback<RequestFlow['setDetails']>(
    ({ vehicleType, problemType, note }) =>
      setDraft((d) => ({
        ...d,
        vehicleType,
        problemType,
        note,
        proposedFare: vehicleType === d.vehicleType ? d.proposedFare : null,
      })),
    [],
  );
  const setProposedFare = useCallback(
    (proposedFare: number) => setDraft((d) => ({ ...d, proposedFare })),
    [],
  );
  const reset = useCallback(() => setDraft(EMPTY_DRAFT), []);

  const value = useMemo(
    () => ({ ...draft, setPickup, setDropoff, setDetails, setProposedFare, reset, exitGuardRef }),
    [draft, setPickup, setDropoff, setDetails, setProposedFare, reset],
  );
  return <RequestFlowContext.Provider value={value}>{children}</RequestFlowContext.Provider>;
}

export function useRequestFlow(): RequestFlow {
  const flow = useContext(RequestFlowContext);
  if (!flow) throw new Error('useRequestFlow must be used inside a RequestFlowProvider');
  return flow;
}
