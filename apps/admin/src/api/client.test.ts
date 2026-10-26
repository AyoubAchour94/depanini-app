import { adminDriverPageSchema } from '@depanini/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  ApiTimeoutError,
  createApiClient,
  FILE_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from './client';

function respond(status: number, body: unknown, init: ResponseInit = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    ...init,
  });
}

function setup(response: Response) {
  const fetchFn = vi.fn(async () => response);
  const api = createApiClient({
    baseUrl: 'http://api.test/',
    getToken: async () => 'tok',
    fetchFn,
  });
  return { api, fetchFn };
}

describe('api client', () => {
  it('sends the ID token and validates the response against its schema', async () => {
    const { api, fetchFn } = setup(respond(200, { items: [], nextCursor: null }));
    const page = await api.get('/admin/drivers?status=pending', adminDriverPageSchema);
    expect(page).toEqual({ items: [], nextCursor: null });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/admin/drivers?status=pending');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('rejects a response that does not match the schema', async () => {
    const { api } = setup(respond(200, { items: 'nope' }));
    await expect(api.get('/admin/drivers', adminDriverPageSchema)).rejects.toThrow(
      /unexpected response/i,
    );
  });

  it('turns an error status into an ApiError with the API message', async () => {
    const { api } = setup(respond(409, { statusCode: 409, message: 'Already reviewed' }));
    const error = await api.get('/x', adminDriverPageSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: 'Already reviewed' });
  });

  it('posts JSON', async () => {
    const { api, fetchFn } = setup(respond(200, { items: [], nextCursor: null }));
    await api.post('/admin/x', { decision: 'approve' }, adminDriverPageSchema);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"decision":"approve"}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('fetches a file as a blob', async () => {
    const { api } = setup(respond(200, 'abc', { headers: { 'content-type': 'image/png' } }));
    const blob = await api.blob('/admin/files/1');
    expect(blob.size).toBe(3);
  });
});

describe('api client timeouts', () => {
  function hanging() {
    return vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;
  }
  const make = (fetchFn: typeof fetch) =>
    createApiClient({ baseUrl: 'http://api.test', getToken: async () => 'tok', fetchFn });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fails with an ApiTimeoutError (a TypeError) after 15 s', async () => {
    const api = make(hanging());
    const result = api.get('/x', adminDriverPageSchema).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(1);
    const error = await result;
    expect(error).toBeInstanceOf(ApiTimeoutError);
    expect(error).toBeInstanceOf(TypeError);
  });

  it('gives a file download 60 s', async () => {
    const api = make(hanging());
    const result = api.blob('/admin/files/1').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(FILE_TIMEOUT_MS - REQUEST_TIMEOUT_MS);
    expect(await result).toBeInstanceOf(ApiTimeoutError);
  });

  it('times out a body that never finishes', async () => {
    // Like a real fetch, the body stream errors once the request's signal aborts.
    const stalled = (async (_url: unknown, init?: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener('abort', () =>
              controller.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
      )) as unknown as typeof fetch;
    const api = make(stalled);
    const result = api.get('/x', adminDriverPageSchema).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await result).toBeInstanceOf(ApiTimeoutError);
  });

  it('keeps the abort error, not a timeout, when the caller cancels', async () => {
    const api = make(hanging());
    const caller = new AbortController();
    const result = api
      .get('/x', adminDriverPageSchema, { signal: caller.signal })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    caller.abort();
    const error = await result;
    expect(error).not.toBeInstanceOf(ApiTimeoutError);
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows a friendly message for 429', async () => {
    const api = make((async () =>
      respond(429, {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      })) as never);
    const error = await api.get('/x', adminDriverPageSchema).catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 429,
      message: 'Too many requests. Wait a moment and try again.',
    });
  });
});
