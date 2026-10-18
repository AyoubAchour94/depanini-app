import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { ENV } from './config/env.module.js';

// Local dev convenience: load apps/api/.env when present. In production
// (Cloud Run) variables are set on the service and no file exists.
try {
  process.loadEnvFile();
} catch {
  // no .env file, rely on the process environment
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);
  // @fastify/cors only allows GET, HEAD and POST by default.
  if (env.CORS_ORIGINS.length > 0) {
    app.enableCors({
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
    });
  }
  // 0.0.0.0 so the server is reachable inside a container and from devices on the LAN.
  await app.listen(env.PORT, '0.0.0.0');
}
await bootstrap();
