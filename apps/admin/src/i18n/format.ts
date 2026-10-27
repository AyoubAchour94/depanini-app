import { currentLanguage, translate } from '.';

/** The date and time as the language writes it, e.g. "27 oct. 2026, 10:05"; "-" when unknown. */
export function formatDateTime(iso: string | null | undefined, locale = currentLanguage()): string {
  if (!iso) return '-';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** A number as the language writes it; `digits` fixes the decimals. */
export function formatNumber(value: number, digits?: number, locale = currentLanguage()): string {
  return new Intl.NumberFormat(
    locale,
    digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits },
  ).format(value);
}

/** Whole dinars as text, e.g. "85 TND"; "-" when unknown. The unit placement is a message. */
export function formatMoney(amount: number | null | undefined, locale = currentLanguage()): string {
  if (amount == null) return '-';
  return translate('common:money', { amount: formatNumber(amount, undefined, locale) });
}

/** A distance in metres as kilometres with one decimal, e.g. "12,5 km". */
export function formatKilometres(meters: number, locale = currentLanguage()): string {
  return translate('common:kilometres', { value: formatNumber(meters / 1000, 1, locale) });
}
