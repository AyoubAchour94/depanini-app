import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { parseEnv } from './config/env.js';
import { configureApp, createFastifyAdapter } from './http/configure-app.js';

// Local dev convenience: load apps/api/.env when present. In production
// (Cloud Run) variables are set on the service and no file exists.
try {
  process.loadEnvFile();
} catch {
  // no .env file, rely on the process environment
}

async function bootstrap() {
  // Parsed here too because the adapter is built before the app (and its ENV provider).
  const env = parseEnv(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createFastifyAdapter(env),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await configureApp(app, env);
  // 0.0.0.0 so the server is reachable inside a container and from devices on the LAN.
  await app.listen(env.PORT, '0.0.0.0');
}
await bootstrap();
