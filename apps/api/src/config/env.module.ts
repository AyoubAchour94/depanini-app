import { Global, Module } from '@nestjs/common';

import { parseEnv } from './env.js';

/** Injection token for the validated {@link Env}. */
export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }],
  exports: [ENV],
})
export class EnvModule {}
