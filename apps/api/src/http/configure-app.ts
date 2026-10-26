import type { IncomingMessage } from 'node:http';

import helmet from '@fastify/helmet';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';

import type { Env } from '../config/env.js';
import { registerMultipart } from '../files/multipart.js';
import { REQUEST_ID_HEADER, requestIdFrom } from './logging.js';

/**
 * The Fastify adapter. `TRUST_PROXY_HOPS` proxies are trusted, so `request.ip` is the
 * client's address taken from `X-Forwarded-For` rather than the proxy's. Fastify assigns
 * the request id (see {@link requestIdFrom}); the request logs pick it up from there.
 */
export function createFastifyAdapter(env: Pick<Env, 'TRUST_PROXY_HOPS'>): FastifyAdapter {
  const hops = env.TRUST_PROXY_HOPS;
  return new FastifyAdapter({
    // A function, because Fastify's numeric `trustProxy` no longer trusts any hop. Counting
    // hops trusts the immediate peer without checking it, which is right on Cloud Run
    // (only Google's front end can reach the container); set 0 where clients connect directly.
    trustProxy: hops > 0 ? (_address: string, hop: number) => hop < hops : false,
    genReqId: (req: IncomingMessage) => requestIdFrom(req.headers),
  });
}

/**
 * Everything the app needs on the Fastify instance before `init()` / `listen()`: security
 * headers, uploads, the WebSocket adapter and CORS. Shared by `main.ts` and the e2e tests.
 */
export async function configureApp(app: NestFastifyApplication, env: Env): Promise<void> {
  // The API only serves JSON and files to apps, so helmet's defaults fit as they are.
  await app.register(helmet as never);
  // Lets a client quote the id of a failed call when reporting it.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (request, reply) => {
      reply.header(REQUEST_ID_HEADER, request.id);
    });
  await registerMultipart(app);
  // `/ws` (see src/realtime) shares the HTTP server and port.
  app.useWebSocketAdapter(new WsAdapter(app));
  // @fastify/cors only allows GET, HEAD and POST by default.
  if (env.CORS_ORIGINS.length > 0) {
    app.enableCors({
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
    });
  }
}
