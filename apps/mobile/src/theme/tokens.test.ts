import { APP_VARIANTS } from '@/variant/variants';

import { contrastRatio } from './contrast';
import { buildTheme, SCHEMES, type Colors } from './tokens';

describe('buildTheme', () => {
  it('resolves the action fill and the accent from the design for every scheme and variant', () => {
    const c = (scheme: 'light' | 'dark', variant: 'user' | 'driver') =>
      buildTheme(scheme, variant).color;
    expect([c('light', 'user').brand, c('light', 'user').brandAccent]).toEqual([
      '#1463D9',
      '#1463D9',
    ]);
    expect([c('light', 'driver').brand, c('light', 'driver').brandAccent]).toEqual([
      '#F5A300',
      '#F5A300',
    ]);
    // Dark customer: a deeper fill for white text, the bright blue as the accent.
    expect([c('dark', 'user').brand, c('dark', 'user').brandAccent]).toEqual([
      '#2563EB',
      '#4C8DFF',
    ]);
    expect([c('dark', 'driver').brand, c('dark', 'driver').onBrand]).toEqual([
      '#FFB000',
      '#0A0A0A',
    ]);
    expect(c('dark', 'user').dangerFill).toBe('#DC2626');
    expect(c('dark', 'user').danger).toBe('#F97066');
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
  const surfaces = ['background', 'surface', 'surface2'] as const;
  const pairs: [string, (c: Colors) => [string, string]][] = [
    ['text on brand', (c) => [c.onBrand, c.brand]],
    ['text on danger fill', (c) => [c.onDanger, c.dangerFill]],
    ...surfaces.flatMap((surface): [string, (c: Colors) => [string, string]][] => [
      [`text on ${surface}`, (c) => [c.text, c[surface]]],
      [`muted text on ${surface}`, (c) => [c.muted, c[surface]]],
      [`brand text on ${surface}`, (c) => [c.brandText, c[surface]]],
      [`danger text on ${surface}`, (c) => [c.danger, c[surface]]],
      [`success text on ${surface}`, (c) => [c.successText, c[surface]]],
      [`warning text on ${surface}`, (c) => [c.warning, c[surface]]],
    ]),
  ];

  it('keeps the bright accent legible on every dark surface', () => {
    for (const variant of APP_VARIANTS) {
      const c = buildTheme('dark', variant).color;
      for (const surface of surfaces) {
        expect(contrastRatio(c.brandAccent, c[surface])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

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
