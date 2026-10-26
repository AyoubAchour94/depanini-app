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
    /** Most Postgres connections the API opens. */
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    /** How long a request waits for a free connection before failing with `503`. */
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
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
    /**
     * How many proxies sit in front of the API and append to `X-Forwarded-For`. The
     * client IP (used for rate limits and logs) is read that many hops from the end of
     * the header. Cloud Run has one; set `0` when clients connect directly.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
    /** Window of the rate limits below, in milliseconds. */
    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
    /** Requests one user (or one IP when signed out) may make per window. */
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(300),
    /** Of those, how many may be writes (anything but `GET`, `HEAD` and `OPTIONS`). */
    THROTTLE_WRITE_LIMIT: z.coerce.number().int().positive().default(60),
    /** Document uploads one driver may make per rolling hour, counted in Postgres. */
    UPLOAD_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),
    /** Document uploads one driver may make per rolling day. */
    UPLOAD_LIMIT_PER_DAY: z.coerce.number().int().positive().default(60),
    /** A handler still running after this long answers `503`. Uploads are exempt. */
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    /** Lowest level written to the log (JSON lines; pretty-printed in development). */
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
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
