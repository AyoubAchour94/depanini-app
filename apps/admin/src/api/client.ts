import type { z } from 'zod';

/** Request time limits, in one place. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** Downloading a document page can be slow, so it gets longer. */
export const FILE_TIMEOUT_MS = 60_000;

/** An error response from the API (`message` is the API's own text when it sent one). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * A request that ran past its time limit. It is a `TypeError` like the one `fetch`
 * throws when the network is down, so screens show their usual failure state.
 */
export class ApiTimeoutError extends TypeError {
  constructor(readonly timeoutMs: number) {
    super(`The API did not answer within ${timeoutMs / 1000} seconds.`);
    this.name = 'ApiTimeoutError';
  }
}

/** Per-call options. `signal` is React Query's: a cancelled query is not a timeout. */
export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  /** GET, with the response checked against a `@depanini/shared` schema. */
  get<S extends z.ZodType>(path: string, schema: S, options?: RequestOptions): Promise<z.output<S>>;
  /** POST a JSON body, with the response checked against a schema. */
  post<S extends z.ZodType>(
    path: string,
    body: unknown,
    schema: S,
    options?: RequestOptions,
  ): Promise<z.output<S>>;
  /** GET a file (with the auth header, which `<img src>` cannot send). */
  blob(path: string, options?: RequestOptions): Promise<Blob>;
}

interface Options {
  baseUrl: string;
  /** The signed-in admin's current ID token. */
  getToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
}

/** The API client every screen goes through: it attaches the ID token and validates responses. */
export function createApiClient({ baseUrl, getToken, fetchFn = fetch }: Options): ApiClient {
  const root = baseUrl.replace(/\/$/, '');

  /** Sends the request and reads the response with `read`, all within the time limit. */
  async function request<T>(
    path: string,
    init: RequestInit,
    timeoutMs: number,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    const { signal } = init;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) onCallerAbort();
    else signal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
      const headers = new Headers(init.headers);
      const token = await getToken();
      if (token) headers.set('authorization', `Bearer ${token}`);
      const response = await fetchFn(`${root}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
      return await read(response);
    } catch (error) {
      // Only our own timer is a timeout; a cancel by the caller keeps its abort error.
      if (timedOut && !signal?.aborted) throw new ApiTimeoutError(timeoutMs);
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  async function parse<S extends z.ZodType>(response: Response, schema: S): Promise<z.output<S>> {
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error('The API sent an unexpected response.');
    return parsed.data;
  }

  return {
    get(path, schema, { signal } = {}) {
      return request(path, { signal }, REQUEST_TIMEOUT_MS, (r) => parse(r, schema));
    },
    post(path, body, schema, { signal } = {}) {
      const init: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      };
      return request(path, init, REQUEST_TIMEOUT_MS, (r) => parse(r, schema));
    },
    blob(path, { signal } = {}) {
      return request(path, { signal }, FILE_TIMEOUT_MS, (r) => r.blob());
    },
  };
}

async function errorMessage(response: Response): Promise<string> {
  if (response.status === 429) return 'Too many requests. Wait a moment and try again.';
  try {
    const body: unknown = await response.json();
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  } catch {
    // not JSON: fall through
  }
  return `Request failed (${response.status})`;
}
