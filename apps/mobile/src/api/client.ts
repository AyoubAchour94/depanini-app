import type { z } from 'zod';

import { env } from '@/config/env';
import { getCurrentIdToken } from '@/firebase/firebase';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiRequestOptions extends RequestInit {
  /** HTTP statuses besides 2xx whose body still matches `schema` (e.g. 503 from /health). */
  acceptStatuses?: number[];
}

/**
 * Calls the Depanini API and validates the response with a schema from
 * `@depanini/shared`. Attaches the Firebase ID token when a user is signed in.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  { acceptStatuses = [], headers, ...init }: ApiRequestOptions = {},
): Promise<T> {
  if (!env.apiUrl) throw new ApiError('EXPO_PUBLIC_API_URL is not set');

  const token = await getCurrentIdToken();
  const response = await fetch(new URL(path, env.apiUrl), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok && !acceptStatuses.includes(response.status)) {
    throw new ApiError(`${init.method ?? 'GET'} ${path} failed`, response.status);
  }
  return schema.parse(await response.json());
}
