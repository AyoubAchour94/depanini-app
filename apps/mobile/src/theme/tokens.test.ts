import { APP_VARIANTS } from '@/variant/variants';

import { contrastRatio } from './contrast';
import { buildTheme, SCHEMES, type Colors } from './tokens';

describe('buildTheme', () => {
  it('resolves the brand colors from the design for every scheme and variant', () => {
    const brand = (scheme: 'light' | 'dark', variant: 'user' | 'driver') =>
      buildTheme(scheme, variant).color.brand;
    expect(brand('light', 'user')).toBe('#1463D9');
    expect(brand('light', 'driver')).toBe('#F5A300');
    expect(brand('dark', 'user')).toBe('#4C8DFF');
    expect(brand('dark', 'driver')).toBe('#FFB000');
  });

  it('uses the dark surfaces of the design in dark mode', () => {
    const { color } = buildTheme('dark', 'user');
    expect([color.background, color.surface, color.surface2, color.line]).toEqual([
      '#0B0D10',
      '#16191E',
      '#1F232A',
      '#2A2F37',
    ]);
  });

  it('shares the neutral colors between the two variants and differs only in the brand', () => {
    for (const scheme of SCHEMES) {
      const user = buildTheme(scheme, 'user').color;
      const driver = buildTheme(scheme, 'driver').color;
      expect(user.surface).toBe(driver.surface);
      expect(user.text).toBe(driver.text);
      expect(user.brand).not.toBe(driver.brand);
      expect(user.brandTint).not.toBe(driver.brandTint);
    }
  });

  it('keeps the old flat fields working for screens not restyled yet', () => {
    const theme = buildTheme('light', 'user');
    expect(theme.brand).toBe(theme.color.brand);
    expect(theme.onBrand).toBe(theme.color.onBrand);
    expect(theme.background).toBe(theme.color.background);
    expect(theme.text).toBe(theme.color.text);
    expect(theme.textMuted).toBe(theme.color.muted);
    expect(theme.surface).toBe(theme.color.surface2);
  });

  it('exposes spacing, radius, type and shadows', () => {
    const t = buildTheme('light', 'driver');
    expect(t.space[4]).toBe(16);
    expect(t.radius.lg).toBe(16);
    expect(t.type.title).toMatchObject({ fontSize: 24, fontFamily: 'Inter_700Bold' });
    expect(t.type.figure.fontVariant).toContain('tabular-nums');
    expect(t.shadow.float).toEqual(expect.any(String));
    expect(t.scheme).toBe('light');
    expect(t.variant).toBe('driver');
  });
});

describe('contrast', () => {
  const pairs: [string, (c: Colors) => [string, string]][] = [
    ['text on brand', (c) => [c.onBrand, c.brand]],
    ['text on danger', (c) => [c.onDanger, c.danger]],
    ['text on background', (c) => [c.text, c.background]],
    ['text on surface', (c) => [c.text, c.surface]],
    ['text on surface2', (c) => [c.text, c.surface2]],
    ['muted text on surface', (c) => [c.muted, c.surface]],
    ['success text on surface', (c) => [c.successText, c.surface]],
    ['warning text on surface', (c) => [c.warning, c.surface]],
  ];

  for (const scheme of SCHEMES) {
    for (const variant of APP_VARIANTS) {
      it.each(pairs)(`${scheme} ${variant}: %s is at least 4.5:1`, (_name, pick) => {
        const [fg, bg] = pick(buildTheme(scheme, variant).color);
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('measures known ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});
