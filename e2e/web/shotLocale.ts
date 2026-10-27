import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

/**
 * The language the screenshot specs show the apps in: E2E_LOCALE ("fr", "en").
 * Unset means English, which is also what the end-to-end test reads.
 *
 * The specs are written with the English copy. For another language they
 * still say "Sign in"; this module sets the app to that language and
 * translates the texts the specs look for (getByText, getByRole name,
 * getByLabel, aria-label selectors) from `locales/en` to `locales/<code>`,
 * so the specs do not need a copy of every message.
 */
export const SHOT_LOCALE = process.env.E2E_LOCALE ?? 'en';

const LOCALES_DIR = path.resolve(__dirname, '../../apps/mobile/src/i18n/locales');
const LANGUAGE_PREFERENCE_KEY = 'depanini.languagePreference';

type Pair = { en: string; fr: string };

function flatten(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') return [[prefix.slice(0, -1), value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => flatten(child, `${prefix}${key}.`));
  }
  return [];
}

function loadPairs(): { fixed: Map<string, string>; templates: Pair[] } {
  const fixed = new Map<string, string>();
  const templates: Pair[] = [];
  if (SHOT_LOCALE === 'en') return { fixed, templates };
  for (const file of readdirSync(path.join(LOCALES_DIR, 'en')).filter((f) => f.endsWith('.json'))) {
    const read = (code: string) =>
      new Map(
        flatten(JSON.parse(readFileSync(path.join(LOCALES_DIR, code, file), 'utf8'))).map(
          ([key, text]) => [key, text],
        ),
      );
    const target = read(SHOT_LOCALE);
    for (const [key, en] of read('en')) {
      const fr = target.get(key);
      if (fr === undefined) continue;
      if (en.includes('{{')) templates.push({ en, fr });
      else if (!fixed.has(en)) fixed.set(en, fr);
    }
  }
  // The most specific template first: "{{amount}} TND" would swallow "Offer 95 TND".
  const literal = (template: Pair) => template.en.replace(/{{\w+}}/g, '').length;
  templates.sort((a, b) => literal(b) - literal(a));
  return { fixed, templates };
}

const { fixed, templates } = loadPairs();

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The part of a template before its first placeholder. */
const prefixOf = (template: string) => template.slice(0, template.indexOf('{{'));

/** A text the spec looks for, in the language of the run. */
export function translateText(text: string): string {
  if (SHOT_LOCALE === 'en') return text;
  const direct = fixed.get(text);
  if (direct !== undefined) return direct;
  for (const { en, fr } of templates) {
    const names: string[] = [];
    const pattern = escapeRegExp(en).replace(/\\\{\\\{(\w+)\\\}\\\}/g, (_all, name: string) => {
      names.push(name);
      return '(.+?)';
    });
    const match = new RegExp(`^${pattern}$`).exec(text);
    if (!match) continue;
    return fr.replace(/{{(\w+)}}/g, (_all, name: string) => match[names.indexOf(name) + 1] ?? '');
  }
  return text;
}

/** A pattern the spec looks for, rewritten in the language of the run. */
export function translatePattern(pattern: RegExp): RegExp {
  if (SHOT_LOCALE === 'en') return pattern;
  const anchoredStart = pattern.source.startsWith('^');
  const anchoredEnd = pattern.source.endsWith('$');
  const literal = pattern.source
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\\d\+/g, '\u0000')
    .replace(/\\(.)/g, '$1');
  const wrap = (body: string) =>
    new RegExp(`${anchoredStart ? '^' : ''}${body}${anchoredEnd ? '$' : ''}`, pattern.flags);
  const rest = (text: string) =>
    escapeRegExp(text)
      .replace(/\\\{\\\{\w+\\\}\\\}/g, '.+?')
      .replace(/\u0000/g, '\\d+');

  // The same text as a whole message, e.g. /Completed/.
  const whole = fixed.get(literal);
  if (whole !== undefined) return wrap(escapeRegExp(whole));
  // The start of a message, e.g. /Under review/ or /^View request: Avenue/.
  for (const [en, fr] of fixed) if (en.startsWith(literal)) return wrap(escapeRegExp(fr));
  for (const { en, fr } of templates) {
    const head = prefixOf(en);
    if (head && literal.startsWith(head)) {
      return wrap(rest(prefixOf(fr) + literal.slice(head.length)));
    }
  }
  for (const [en, fr] of fixed) if (en.includes(literal)) return wrap(escapeRegExp(fr));
  return pattern;
}

const translateArg = (arg: unknown) =>
  typeof arg === 'string'
    ? translateText(arg)
    : arg instanceof RegExp
      ? translatePattern(arg)
      : arg;

/** `{ name: "Sign in" }` role options, `{ name: /Sign/ }` too. */
const translateOptions = (options: unknown) => {
  if (!options || typeof options !== 'object' || !('name' in options)) return options;
  return { ...options, name: translateArg(options.name) };
};

const patched = new WeakSet<object>();

function patch(proto: Record<string, unknown>) {
  if (patched.has(proto)) return;
  patched.add(proto);
  const wrap = (method: string, translate: (args: unknown[]) => unknown[]) => {
    const original = proto[method] as (...args: unknown[]) => unknown;
    proto[method] = function (this: unknown, ...args: unknown[]) {
      return original.apply(this, translate(args));
    };
  };
  wrap('getByText', ([text, ...rest]) => [translateArg(text), ...rest]);
  wrap('getByLabel', ([text, ...rest]) => [translateArg(text), ...rest]);
  wrap('getByPlaceholder', ([text, ...rest]) => [translateArg(text), ...rest]);
  wrap('getByRole', ([role, options, ...rest]) => [role, translateOptions(options), ...rest]);
  // `[aria-label="Email"]:visible`
  wrap('locator', ([selector, ...rest]) => [
    typeof selector === 'string'
      ? selector.replace(/\[aria-label="([^"]+)"\]/g, (_all, label: string) => {
          return `[aria-label="${translateText(label)}"]`;
        })
      : selector,
    ...rest,
  ]);
}

/**
 * Puts the page's app in the run's language and, for a language other than
 * English, makes the spec's English texts find their translations. Call it
 * once per page, right after creating it.
 */
export async function useShotLocale(page: Page) {
  await page.context().addInitScript(
    ([key, code]) => {
      try {
        window.localStorage.setItem(key!, code!);
      } catch {
        // No storage: the app falls back to the browser language.
      }
    },
    [LANGUAGE_PREFERENCE_KEY, SHOT_LOCALE],
  );
  if (SHOT_LOCALE === 'en') return;
  patch(Object.getPrototypeOf(page));
  patch(Object.getPrototypeOf(page.locator('body')));
}
