import { z } from 'zod';

/**
 * Environment contract for the API. Validated once at boot: a missing or
 * malformed variable fails fast with a readable error instead of surfacing
 * later as an obscure runtime failure.
 *
 * Locally values come from `apps/api/.env` (see `.env.example`); on Cloud Run
 * they are set on the service.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    /** Firebase project whose ID tokens we accept (e.g. `depanini-dev`). */
    FIREBASE_PROJECT_ID: z.string().min(1),
    /**
     * Local development only: firebase-admin reads this itself and then accepts
     * the Auth emulator's unsigned tokens, so it is refused in production.
     */
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
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
    /** Who delivers pushes: `log` writes them to the log (dev, CI); `fcm` sends them through Firebase. */
    PUSH_PROVIDER: z.enum(['log', 'fcm']).default('log'),
    /**
     * `1` exposes the `log` sender's recent pushes at `GET /dev/push-inbox`, for the e2e
     * tests. Ignored in production.
     */
    PUSH_INBOX: z
      .string()
      .optional()
      .transform((value) => value === '1'),
    /** Path to a service-account key file (read by firebase-admin); one of the two is needed for `fcm`. */
    GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),
    /** The service-account key itself, as JSON, for hosts where a file is awkward. */
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  })
  .refine(
    (env) =>
      env.PUSH_PROVIDER !== 'fcm' ||
      Boolean(env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_SERVICE_ACCOUNT_JSON),
    {
      message:
        'PUSH_PROVIDER=fcm needs GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON',
      path: ['PUSH_PROVIDER'],
    },
  )
  .refine((env) => !(env.NODE_ENV === 'production' && env.FIREBASE_AUTH_EMULATOR_HOST), {
    message: 'FIREBASE_AUTH_EMULATOR_HOST must not be set in production',
    path: ['FIREBASE_AUTH_EMULATOR_HOST'],
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
