import { type Report, type ReportInput, reportSchema } from '@depanini/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';

export const REPORTS_KEY = ['tow-requests', 'reports'] as const;

/** `GET /tow-requests/:id/reports`: my own reports on a trip, newest first. 404 for a stranger. */
export function useTripReports(requestId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...REPORTS_KEY, requestId],
    queryFn: (): Promise<Report[]> =>
      apiRequest(`/tow-requests/${requestId}/reports`, z.array(reportSchema)),
    enabled,
  });
}

/**
 * `POST /tow-requests/:id/reports`. Fails with an `ApiError`: 400 for a bad
 * body, 404 for a stranger, 409 when the trip is active, past its window, or
 * already has an open report of mine. Settling refetches my reports.
 */
export function useSubmitReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ReportInput): Promise<Report> =>
      apiRequest(`/tow-requests/${id}/reports`, reportSchema, { method: 'POST', json: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}
