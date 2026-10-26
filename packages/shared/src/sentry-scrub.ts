/**
 * Removes personal data from an error report before it leaves the device or the server.
 * Used as the `beforeSend` of the Sentry SDK in the API, the mobile app and the admin app,
 * next to `sendDefaultPii: false`. No Sentry types here: it works on any plain event.
 *
 * - request credentials, cookies, the client address and the request body (a document upload
 *   is a request body) are dropped;
 * - the user is reduced to the id;
 * - emails, phone numbers, IP addresses, bearer tokens, bare JWTs and `token=`/`key=` URL
 *   parameters in any text are masked, and keys that hold such values are dropped wherever
 *   they are.
 *
 * Masking text is a best effort that avoids prices, uuids and receipt numbers. A local
 * Tunisian number is only recognised when written in groups (`20 123 456`, `2012-3456`) or
 * after a word like "tel"; eight bare digits are left alone because they look like ids.
 */

const SENSITIVE_HEADERS =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-forwarded-for|x-real-ip|x-api-key|forwarded)$/i;
const SENSITIVE_KEYS =
  /^(email|e-mail|phone|phone_?number|password|token|id_?token|access_?token|refresh_?token|ip|ip_address|authorization)$/i;

const EMAIL = /[^\s@/=&?]+@[^\s@/=&?]+\.[a-z]{2,}/gi;
// `+216` and 8 digits (spaces, dots or dashes between), also url-encoded (`%2B`); then any other international number.
const PHONE = /(?:\+|%2B)216(?:[\s.-]?\d){8}|(?:\+|%2B)\d(?:[\s.-]?\d){7,14}/gi;
const BEARER = /Bearer\s+[\w.~+/=-]+/gi;
// Three base64url parts, the first two starting `eyJ` (`{"`): a JWT outside a Bearer header.
const JWT = /\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]*/g;
// The value of a URL parameter whose name ends in token, key, secret or password.
const URL_SECRET = /([?&;#][\w.-]*?(?:token|key|secret|password)=)[^&\s#;'"]*/gi;
// Local Tunisian numbers start with 2, 4, 5, 7 or 9: grouped 2-3-3, 2-2-2-2 or 4-4, or bare after a label.
const LOCAL_PHONE =
  /(?<![\w.+-])(?:[2-579]\d[ .-]\d{3}[ .-]\d{3}|[2-579]\d[ .-]\d{2}[ .-]\d{2}[ .-]\d{2}|[2-579]\d{3}[ .-]\d{4})(?![\w-]|\.\d)|(?<=\b(?:tel|t\u00e9l|phone|gsm|mobile|call)\b\W{0,3})[2-579]\d{7}(?!\w)/gi;
const IPV4 =
  /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\w]|\.\d)/g;
// Full, or compressed with `::`. Plain `12:30:45` times and `Foo::bar` paths do not match.
const IPV6 =
  /(?<![\w:])(?:(?:[\da-f]{1,4}:){7}[\da-f]{1,4}|(?:[\da-f]{1,4}:){1,7}:(?:[\da-f]{1,4}(?::[\da-f]{1,4}){0,6})?|::[\da-f]{1,4}(?::[\da-f]{1,4}){0,6})(?![\w:])/gi;

const MAX_DEPTH = 12;

export function scrubText(text: string): string {
  return text
    .replace(BEARER, 'Bearer [token]')
    .replace(JWT, '[token]')
    .replace(URL_SECRET, '$1[token]')
    .replace(PHONE, '[phone]')
    .replace(LOCAL_PHONE, '[phone]')
    .replace(IPV6, '[ip]')
    .replace(IPV4, '[ip]')
    .replace(EMAIL, '[email]');
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
