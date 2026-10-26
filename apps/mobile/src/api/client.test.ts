import { z } from 'zod';

import {
  ApiError,
  ApiTimeoutError,
  apiRequest,
  REQUEST_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
} from './client';

jest.mock('@/config/env', () => ({ env: { apiUrl: 'http://api.test' } }));
jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'tok' }));

const schema = z.object({ ok: z.boolean() });

/** A fetch that never answers; it rejects with an AbortError when its signal aborts. */
function hangingFetch() {
  return jest.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort);
      }),
  );
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('apiRequest timeouts', () => {
  it('returns the body of a request that answers in time', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: true }))) as never;
    await expect(apiRequest('/x', schema)).resolves.toEqual({ ok: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('fails with an ApiTimeoutError (a TypeError, like a network failure) after 15 s', async () => {
    global.fetch = hangingFetch() as never;
    const result = apiRequest('/x', schema).catch((e: unknown) => e);
    await flush();
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
    await flush();
    jest.advanceTimersByTime(1);
    const error = await result;
    expect(error).toBeInstanceOf(ApiTimeoutError);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('gives a FormData upload 60 s', async () => {
    global.fetch = hangingFetch() as never;
    const result = apiRequest('/x', schema, { method: 'POST', body: new FormData() }).catch(
      (e: unknown) => e,
    );
    await flush();
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
    await flush();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS - REQUEST_TIMEOUT_MS);
    expect(await result).toBeInstanceOf(ApiTimeoutError);
  });

  it('takes a per-call timeout', async () => {
    global.fetch = hangingFetch() as never;
    const result = apiRequest('/x', schema, { timeoutMs: 500 }).catch((e: unknown) => e);
    await flush();
    jest.advanceTimersByTime(500);
    expect(await result).toBeInstanceOf(ApiTimeoutError);
  });

  it('keeps the abort error, not a timeout, when the caller cancels', async () => {
    const fetchMock = hangingFetch();
    global.fetch = fetchMock as never;
    const caller = new AbortController();
    const result = apiRequest('/x', schema, { signal: caller.signal }).catch((e: unknown) => e);
    await flush();
    caller.abort();
    const error = await result;
    expect(error).not.toBeInstanceOf(ApiTimeoutError);
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not send a request whose signal is already aborted', async () => {
    global.fetch = hangingFetch() as never;
    const caller = new AbortController();
    caller.abort();
    const error = await apiRequest('/x', schema, { signal: caller.signal }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ name: 'AbortError' });
  });
});
