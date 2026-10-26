import { DRIVER_NOT_APPROVED } from '@depanini/shared';
import type { z } from 'zod';

import { env } from '@/config/env';
import { getCurrentIdToken } from '@/firebase/firebase';

/** Request time limits, in one place. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** Uploads (a multipart body) get longer, since photos go over mobile data. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** One failing field of a 400 response. */
export interface ApiIssue {
  path: (string | number)[];
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** The `issues` of a 400 response, when it names the failing fields. */
    readonly issues: ApiIssue[] = [],
    /** The `code` of the error body, when the API sends one (e.g. `driver_not_approved`). */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * A request that ran past its time limit. It is a `TypeError` like the one `fetch`
 * throws when the network is down, so screens show the same error and retry state.
 */
export class ApiTimeoutError extends TypeError {
  constructor(readonly timeoutMs: number) {
    super(`Network request timed out after ${timeoutMs} ms`);
    this.name = 'ApiTimeoutError';
  }
}

let onDriverNotApproved: (() => void) | undefined;

/**
 * Registers what happens when any call fails with `403 driver_not_approved` (the app
 * refetches the verification state). Pass `undefined` to unregister.
 */
export function setDriverNotApprovedHandler(handler: (() => void) | undefined) {
  onDriverNotApproved = handler;
}

interface ApiRequestOptions extends RequestInit {
  /** HTTP statuses besides 2xx whose body still matches `schema` (e.g. 503 from /health). */
  acceptStatuses?: number[];
  /** Sent as the JSON request body. */
  json?: unknown;
  /** Abort after this many ms. Defaults to 15 s, or 60 s for a `FormData` upload. */
  timeoutMs?: number;
}

/**
 * Calls the Depanini API and validates the response with a schema from
 * `@depanini/shared`. Attaches the Firebase ID token when a user is signed in.
 * A request past its time limit fails with an `ApiTimeoutError`; one cancelled
 * through `signal` (React Query cancelling a query) keeps its own abort error.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  { acceptStatuses = [], json, headers, timeoutMs, signal, ...init }: ApiRequestOptions = {},
): Promise<T> {
  if (!env.apiUrl) throw new ApiError('EXPO_PUBLIC_API_URL is not set');

  const limit =
    timeoutMs ?? (init.body instanceof FormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, limit);
  const onCallerAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onCallerAbort();
  else signal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    const token = await getCurrentIdToken();
    const response = await fetch(new URL(path, env.apiUrl), {
      ...init,
      signal: controller.signal,
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      headers: {
        Accept: 'application/json',
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

    if (!response.ok && !acceptStatuses.includes(response.status)) {
      const { issues, code } = await readErrorBody(response);
      if (response.status === 403 && code === DRIVER_NOT_APPROVED) onDriverNotApproved?.();
      throw new ApiError(`${init.method ?? 'GET'} ${path} failed`, response.status, issues, code);
    }
    // 204 No Content has no body to parse.
    return schema.parse(response.status === 204 ? undefined : await response.json());
  } catch (error) {
    if (timedOut && !signal?.aborted) throw new ApiTimeoutError(limit);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

/** The failing fields of a 400 and the `code` of a 400, 403 or 429, when the body has them. */
async function readErrorBody(response: Response): Promise<{ issues: ApiIssue[]; code?: string }> {
  if (![400, 403, 429].includes(response.status)) return { issues: [] };
  try {
    const body = (await response.json()) as { issues?: unknown; code?: unknown } | null;
    return {
      issues: Array.isArray(body?.issues) ? (body.issues as ApiIssue[]) : [],
      code: typeof body?.code === 'string' ? body.code : undefined,
    };
  } catch {
    return { issues: [] };
  }
}
