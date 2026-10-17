import { z } from 'zod';

/**
 * Response of `GET /health` on the API.
 *
 * `status` is `ok` only when every dependency is reachable; the API still
 * answers (with `degraded`) when the database is down so clients and uptime
 * checks can tell "API unreachable" apart from "API up, DB down".
 */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  timestamp: z.iso.datetime(),
  db: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
