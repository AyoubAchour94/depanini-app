import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFakeApi, createFakeAuth } from '../test/fakes';
import { renderApp } from '../test/render';
import { i18n } from '.';
import { formatDateTime, formatKilometres, formatMoney } from './format';
import { LANGUAGE_KEY, loadLanguage } from './language';
import { en } from './locales/en';
import { fr } from './locales/fr';

/** Every message path of a namespace object, e.g. "drivers:detail.back". */
function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object'
      ? keys(child as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('messages', () => {
  it('has every English key in French, and no French key without an English one', () => {
    const english = keys(en);
    const french = keys(fr);
    expect(english.filter((key) => !french.includes(key))).toEqual([]);
    expect(french.filter((key) => !english.includes(key))).toEqual([]);
  });

  it('has a French text for every key, and the same placeholders as English', () => {
    const placeholders = (text: string) => (text.match(/{{\w+}}/g) ?? []).sort();
    for (const namespace of Object.keys(en) as (keyof typeof en)[]) {
      for (const key of keys(en[namespace])) {
        const english = i18n.getResource('en', namespace, key) as string;
        const french = i18n.getResource('fr', namespace, key) as string;
        expect(french, `${namespace}:${key}`).toBeTruthy();
        expect(placeholders(french), `${namespace}:${key}`).toEqual(placeholders(english));
      }
    }
  });
});

describe('formatting', () => {
  it('writes dates, numbers and money through Intl in the active language', async () => {
    expect(formatKilometres(12_500, 'en')).toBe('12.5 km');
    expect(formatKilometres(12_500, 'fr')).toBe('12,5 km');
    expect(formatDateTime('2026-01-01T10:05:00.000Z', 'fr')).toMatch(/janv\. 2026/);
    expect(formatDateTime('2026-01-01T10:05:00.000Z', 'en')).toMatch(/Jan 1, 2026/);
    expect(formatDateTime(null)).toBe('-');
    await i18n.changeLanguage('fr');
    expect(formatMoney(85)).toBe('85 TND');
    expect(formatMoney(undefined)).toBe('-');
  });
});

describe('language setting', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is French when nothing is saved, and survives storage that throws', () => {
    window.localStorage.removeItem(LANGUAGE_KEY);
    expect(loadLanguage()).toBe('fr');
    window.localStorage.setItem(LANGUAGE_KEY, 'ar');
    expect(loadLanguage()).toBe('fr');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadLanguage()).toBe('fr');
  });

  it('shows the sign-in page in French by default, switches, remembers, and sets <html lang>', async () => {
    window.localStorage.removeItem(LANGUAGE_KEY);
    renderApp({ auth: createFakeAuth({}), api: createFakeApi() });
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');

    await userEvent.selectOptions(screen.getByLabelText('Langue'), 'en');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe('en');
  });

  it('still switches when the browser refuses to store the choice', async () => {
    window.localStorage.removeItem(LANGUAGE_KEY);
    renderApp({ auth: createFakeAuth({}), api: createFakeApi() });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await userEvent.selectOptions(await screen.findByLabelText('Langue'), 'en');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
