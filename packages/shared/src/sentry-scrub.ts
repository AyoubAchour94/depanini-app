/**
 * Removes personal data from an error report before it leaves the device or the server.
 * Used as the `beforeSend` of the Sentry SDK in the API, the mobile app and the admin app,
 * next to `sendDefaultPii: false`. No Sentry types here: it works on any plain event.
 *
 * - request credentials, cookies, the client address and the request body (a document upload
 *   is a request body) are dropped;
 * - the user is reduced to the id;
 * - emails, phone numbers and bearer tokens in any text are masked, and keys that hold such
 *   values are dropped wherever they are.
 */

const SENSITIVE_HEADERS =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-forwarded-for|x-real-ip|x-api-key|forwarded)$/i;
const SENSITIVE_KEYS =
  /^(email|e-mail|phone|phone_?number|password|token|id_?token|access_?token|refresh_?token|ip|ip_address|authorization)$/i;

const EMAIL = /[^\s@/=&?]+@[^\s@/=&?]+\.[a-z]{2,}/gi;
// `+216` and 8 digits (spaces, dots or dashes between), also url-encoded (`%2B`); then any other international number.
const PHONE = /(?:\+|%2B)216(?:[\s.-]?\d){8}|(?:\+|%2B)\d(?:[\s.-]?\d){7,14}/gi;
const BEARER = /Bearer\s+[\w.~+/=-]+/gi;

const MAX_DEPTH = 12;

export function scrubText(text: string): string {
  return text.replace(BEARER, 'Bearer [token]').replace(PHONE, '[phone]').replace(EMAIL, '[email]');
}

function scrub(value: unknown, key: string | undefined, depth: number): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  // Also what ends circular references.
  if (depth > MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => scrub(item, key, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [name, inner] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(name)) continue;
    if (key === 'headers' && SENSITIVE_HEADERS.test(name)) continue;
    // The body and the cookies of the HTTP request.
    if (key === 'request' && (name === 'data' || name === 'cookies' || name === 'body')) continue;
    out[name] = scrub(inner, name, depth + 1);
  }
  return out;
}

export function scrubSentryEvent<T extends object>(event: T): T {
  const copy = scrub(event, undefined, 0) as Record<string, unknown>;
  const user = (event as { user?: { id?: unknown } }).user;
  if (user) {
    if (user.id === undefined) delete copy.user;
    else copy.user = { id: user.id };
  }
  return copy as T;
}
