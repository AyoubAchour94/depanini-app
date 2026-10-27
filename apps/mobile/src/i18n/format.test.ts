import { i18n } from '.';
import {
  formatCoordinates,
  formatDateTime,
  formatDistance,
  formatKilometres,
  formatMinutes,
  formatMoney,
  formatTime,
  minutesUnit,
} from './format';

describe('formatting in English', () => {
  it('writes dinars as whole numbers followed by TND', () => {
    expect(formatMoney(85)).toBe('85 TND');
    expect(formatMoney(1250)).toBe('1250 TND');
  });

  it('writes metres below a kilometre and kilometres above', () => {
    expect(formatDistance(347)).toBe('350 m');
    expect(formatDistance(999)).toBe('1.0 km');
    expect(formatDistance(12_500)).toBe('12.5 km');
    expect(formatKilometres(4000)).toBe('4.0 km');
  });

  it('writes minutes', () => expect(formatMinutes(12)).toBe('12 min'));

  it('gives the minutes unit alone', () => expect(minutesUnit()).toBe('min'));

  it('writes the time of day and the date', () => {
    expect(formatTime('2026-01-01T10:05:00.000Z')).toMatch(/^\d{2}:\d{2}/);
    expect(formatDateTime('2026-01-01T10:05:00.000Z', 'en', 'UTC')).toMatch(
      /^Jan 1, 2026, 10:05\sAM$/,
    );
  });
});

describe('formatting in another language', () => {
  it('writes coordinates with a decimal point in every language', async () => {
    await i18n.changeLanguage('fr');
    try {
      expect(formatCoordinates({ latitude: 36.8065, longitude: 10.1815 })).toBe(
        '36.80650, 10.18150',
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('uses the locale of that language', () => {
    expect(formatKilometres(12_500, 'fr')).toBe('12,5 km');
    expect(formatDateTime('2026-01-01T10:05:00.000Z', 'fr', 'UTC')).toMatch(/^1 janv\. 2026/);
  });
});
