import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';

import type { Options } from 'pino-http';

import type { Env } from '../config/env.js';

/** Header that carries the request id, read from the client and echoed on the response. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Request ids longer than this, or with other characters, are replaced by a fresh one. */
const SAFE_REQUEST_ID = /^[\w.:/-]{1,128}$/;

/** Never written to the log: ID tokens, cookies and anything else that grants access. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["proxy-authorization"]',
  'req.headers["sec-websocket-protocol"]',
  'res.headers["set-cookie"]',
];

/**
 * The request id: the client's `x-request-id`, else the trace id Cloud Run's load balancer
 * puts in `x-cloud-trace-context` (`TRACE_ID/SPAN_ID;o=1`), else a new UUID.
 */
export function requestIdFrom(headers: IncomingHttpHeaders): string {
  const given = headers[REQUEST_ID_HEADER];
  if (typeof given === 'string' && SAFE_REQUEST_ID.test(given)) return given;
  const trace = headers['x-cloud-trace-context'];
  const traceId = typeof trace === 'string' ? trace.split('/')[0] : undefined;
  if (traceId && SAFE_REQUEST_ID.test(traceId)) return traceId;
  return randomUUID();
}

/** pino levels as Cloud Logging severities, so the console can filter by level. */
const SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/**
 * `pino-http` options for `nestjs-pino`: one JSON line per log, each with the request id
 * (`reqId`), credentials redacted. Development pretty-prints instead.
 */
export function pinoHttpOptions(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Options {
  const pretty = env.NODE_ENV === 'development';
  return {
    level: env.LOG_LEVEL,
    // Behind Fastify the request already has its id (`createFastifyAdapter`), which wins.
    genReqId: (req: IncomingMessage) => requestIdFrom(req.headers),
    // Logs written while handling a request carry `reqId` rather than the whole request.
    quietReqLogger: true,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    customLogLevel: (_req, res, error) =>
      error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    // Uptime checks hit /health every minute; their lines would drown the rest.
    // Nest mounts this as middleware, which sees `url` relative to its mount point.
    autoLogging: {
      ignore: (req) => ((req as { originalUrl?: string }).originalUrl ?? req.url) === '/health',
    },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {
          messageKey: 'message',
          formatters: { level: (label: string) => ({ severity: SEVERITY[label] ?? 'DEFAULT' }) },
        }),
  };
}
