import type { z } from 'zod';

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

export interface ApiClient {
  /** GET, with the response checked against a `@depanini/shared` schema. */
  get<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>>;
  /** POST a JSON body, with the response checked against a schema. */
  post<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>>;
  /** GET a file (with the auth header, which `<img src>` cannot send). */
  blob(path: string): Promise<Blob>;
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

  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = await getToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await fetchFn(`${root}${path}`, { ...init, headers });
    if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
    return response;
  }

  async function parse<S extends z.ZodType>(response: Response, schema: S): Promise<z.output<S>> {
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error('The API sent an unexpected response.');
    return parsed.data;
  }

  return {
    async get(path, schema) {
      return parse(await send(path), schema);
    },
    async post(path, body, schema) {
      const response = await send(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return parse(response, schema);
    },
    async blob(path) {
      return (await send(path)).blob();
    },
  };
}

async function errorMessage(response: Response): Promise<string> {
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
