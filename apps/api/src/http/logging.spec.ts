import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';

import { pinoHttp } from 'pino-http';

import { pinoHttpOptions, requestIdFrom } from './logging.js';

describe('requestIdFrom', () => {
  it('keeps the client x-request-id', () => {
    expect(requestIdFrom({ 'x-request-id': 'abc-123' })).toBe('abc-123');
  });

  it('falls back to the Cloud Run trace id', () => {
    expect(requestIdFrom({ 'x-cloud-trace-context': '105445aa7843bc8bf206b120001000/1;o=1' })).toBe(
      '105445aa7843bc8bf206b120001000',
    );
  });

  it('generates a UUID otherwise, or when the given id is unsafe', () => {
    const uuid = /^[0-9a-f-]{36}$/;
    expect(requestIdFrom({})).toMatch(uuid);
    expect(requestIdFrom({ 'x-request-id': 'bad id\nwith newline' })).toMatch(uuid);
    expect(requestIdFrom({ 'x-request-id': 'x'.repeat(200) })).toMatch(uuid);
  });
});

describe('pinoHttpOptions', () => {
  let server: Server;
  let lines: Record<string, unknown>[];

  beforeEach(async () => {
    lines = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
        done();
      },
    });
    const logger = pinoHttp(pinoHttpOptions({ NODE_ENV: 'production', LOG_LEVEL: 'info' }), sink);
    server = createServer((req, res) => {
      logger(req, res);
      req.log.info('handling');
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const call = (path: string, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, { headers });

  it('tags every line with the request id', async () => {
    await call('/trips', { 'x-request-id': 'req-42' });

    await vi.waitFor(() => expect(lines).toHaveLength(2));
    expect(lines[0]).toMatchObject({ message: 'handling', reqId: 'req-42', severity: 'INFO' });
    expect(lines[1]).toMatchObject({ message: 'request completed', req: { id: 'req-42' } });
  });

  it('never logs the bearer token or cookies', async () => {
    await call('/trips', { authorization: 'Bearer secret-token', cookie: 'session=secret' });

    await vi.waitFor(() => expect(lines).toHaveLength(2));
    const text = JSON.stringify(lines);
    expect(text).not.toContain('secret');
    expect(lines[1]).toMatchObject({
      req: { headers: { authorization: '[redacted]', cookie: '[redacted]' } },
    });
  });

  it('does not log /health checks', async () => {
    await call('/health');
    await call('/trips');

    await vi.waitFor(() => expect(lines.filter((l) => l.req)).toHaveLength(1));
    expect(lines.find((l) => l.req)).toMatchObject({ req: { url: '/trips' } });
  });
});
