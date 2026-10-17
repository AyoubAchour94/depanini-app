import { z } from 'zod';

/**
 * Environment contract for the API. Validated once at boot: a missing or
 * malformed variable fails fast with a readable error instead of surfacing
 * later as an obscure runtime failure.
 *
 * Locally values come from `apps/api/.env` (see `.env.example`); on Cloud Run
 * they are set on the service.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  /** Firebase project whose ID tokens we accept (e.g. `depanini-dev`). */
  FIREBASE_PROJECT_ID: z.string().min(1),
  /**
   * Comma-separated browser origins allowed to call the API (CORS), e.g. the
   * Expo web dev server. Native apps don't need CORS; leave unset in production.
   */
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
