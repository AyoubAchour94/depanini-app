import { adminDriverPageSchema } from '@depanini/shared';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient } from './client';

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
