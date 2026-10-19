import {
  type DriverJob,
  driverJobSchema,
  type TowRequest,
  type WsServerMessage,
} from '@depanini/shared';
import type { QueryClient } from '@tanstack/react-query';

import { JOB_KEY, NEARBY_KEY, OFFERS_KEY as DRIVER_OFFERS_KEY } from '@/api/driver';
import { ACTIVE_KEY, HISTORY_KEY, OFFERS_KEY as CUSTOMER_OFFERS_KEY } from '@/api/towRequests';

export type RealtimeRole = 'customer' | 'driver';

const isOver = (request: TowRequest) => request.status !== 'open' && request.status !== 'assigned';

/**
 * Puts a pushed message into the query cache, where the screens already read.
 * The pushes and the REST endpoints carry the same payloads, so a push is
 * just a faster answer to the same question. Which payload a `request.updated`
 * is depends on who receives it, hence the role (it is the app variant).
 */
export function applyRealtimeMessage(
  queryClient: QueryClient,
  message: WsServerMessage,
  role: RealtimeRole,
) {
  switch (message.type) {
    case 'request.updated': {
      const request = message.request;
      if (role === 'driver') {
        const job = driverJobSchema.safeParse(request);
        // A cancelled or completed job is gone from `GET /driver/job`: clearing it also stops the fast presence.
        const current = queryClient.getQueryData<DriverJob | null>(JOB_KEY);
        if (job.success) queryClient.setQueryData(JOB_KEY, job.data);
        else if (!current || current.id === request.id) queryClient.setQueryData(JOB_KEY, null);
        void queryClient.invalidateQueries({ queryKey: NEARBY_KEY });
        void queryClient.invalidateQueries({ queryKey: DRIVER_OFFERS_KEY });
      } else {
        // An account with both profiles also gets its driver pushes (with the customer's contact): not ours.
        if ('customer' in request) return;
        const current = queryClient.getQueryData<TowRequest | null>(ACTIVE_KEY);
        // A late end of an older request must not replace the one open now.
        const stale = current && current.id !== request.id && !isOver(current) && isOver(request);
        if (!stale) queryClient.setQueryData(ACTIVE_KEY, request);
        void queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
        void queryClient.invalidateQueries({ queryKey: CUSTOMER_OFFERS_KEY });
      }
      return;
    }
    case 'offer.updated': {
      void queryClient.invalidateQueries({
        queryKey: role === 'driver' ? DRIVER_OFFERS_KEY : CUSTOMER_OFFERS_KEY,
      });
      return;
    }
    case 'nearby.changed': {
      // A hint for the driver app only: the customer app has no nearby list.
      if (role === 'driver') void queryClient.invalidateQueries({ queryKey: NEARBY_KEY });
      return;
    }
    case 'driver.location': {
      queryClient.setQueryData<TowRequest | null | undefined>(ACTIVE_KEY, (current) =>
        current && current.id === message.requestId
          ? {
              ...current,
              driverLocation: { ...message.location, updatedAt: new Date().toISOString() },
              etaMin: message.etaMin,
            }
          : current,
      );
      return;
    }
    default:
      return;
  }
}
