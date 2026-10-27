import { currentLanguage, translate } from '.';

/**
 * The `Intl` locale of a language. Arabic is written as in Tunisia, with
 * Western digits ("12,5" rather than "١٢٫٥").
 */
export function intlLocale(language: string): string {
  return language === 'ar' ? 'ar-TN-u-nu-latn' : language;
}

/** A number as the language writes it; no digit grouping, as the app has always shown. */
function number(value: number, locale: string, fractionDigits?: number): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    useGrouping: false,
    ...(fractionDigits === undefined
      ? {}
      : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }),
  }).format(value);
}

/** A number as the active language writes it, e.g. "12" or "3.5". */
export function formatNumber(value: number, locale = currentLanguage()): string {
  return number(value, locale);
}

/** An amount of dinars, e.g. "85 TND". The currency's placement comes from the `common:money` message. */
export function formatMoney(amount: number, locale = currentLanguage()): string {
  return translate('common:money', { amount: number(amount, locale) });
}

/** A distance in metres: "850 m" below a kilometre, else "12.5 km". */
export function formatDistance(meters: number, locale = currentLanguage()): string {
  if (meters < 995) {
    return translate('common:distance.meters', {
      value: number(Math.round(meters / 10) * 10, locale),
    });
  }
  return formatKilometres(meters, locale);
}

/** A distance in metres as kilometres with one decimal, e.g. "12.5 km". */
export function formatKilometres(meters: number, locale = currentLanguage()): string {
  return translate('common:distance.km', { value: number(meters / 1000, locale, 1) });
}

/** A number of minutes, e.g. "12 min". */
export function formatMinutes(minutes: number, locale = currentLanguage()): string {
  return translate('common:duration.minutes', { value: number(minutes, locale) });
}

/** The unit of `formatMinutes` alone, e.g. "min", for a `Num` that sets the unit smaller. */
export function minutesUnit(): string {
  return translate('common:duration.minutes', { value: '' }).trim();
}

/** A plain number with fixed decimals, for ratings and sizes. */
export function formatDecimal(value: number, digits = 1, locale = currentLanguage()): string {
  return number(value, locale, digits);
}

/**
 * A position as text when no address is known, e.g. "36.80650, 10.18150". Always
 * with a decimal point: a decimal comma ("36,80650, 10,18150") would be read as
 * four numbers, and the text is split on commas for display (`shortAddress`).
 */
export function formatCoordinates({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** The local time of day, e.g. "10:05". */
export function formatTime(iso: string, locale = currentLanguage()): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/** The date and time, e.g. "Jan 1, 2026, 10:05 AM", in the phone's time zone unless one is given. */
export function formatDateTime(iso: string, locale = currentLanguage(), timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
