import { shortAddress } from './address';

describe('shortAddress', () => {
  it('drops the country', () => {
    expect(shortAddress('Avenue Habib Bourguiba, Tunis, Tunisie')).toBe(
      'Avenue Habib Bourguiba, Tunis',
    );
    expect(shortAddress('La Marsa, Tunis, Tunisia')).toBe('La Marsa, Tunis');
  });

  it('drops the postal code', () => {
    expect(shortAddress('Avenue Habib Bourguiba 42, 1001 Tunis, Tunisie')).toBe(
      'Avenue Habib Bourguiba 42, Tunis',
    );
    expect(shortAddress('Rue du Lac, 1053, Tunis, Tunisie')).toBe('Rue du Lac, Tunis');
  });

  it('keeps the street and the area only', () => {
    expect(shortAddress('Rue Hédi Karray, Ariana Essoughra, Ariana, Tunisie')).toBe(
      'Rue Hédi Karray, Ariana Essoughra',
    );
  });

  it('does not repeat the area', () => {
    expect(shortAddress('Tunis, Tunis, Tunisie')).toBe('Tunis');
  });

  it('leaves short places and coordinates alone', () => {
    expect(shortAddress('Tunis')).toBe('Tunis');
    expect(shortAddress('Tunisie')).toBe('Tunisie');
    expect(shortAddress('36.85000, 10.20000')).toBe('36.85000, 10.20000');
  });

  it('does not fail on an empty or blank address', () => {
    expect(shortAddress('')).toBe('');
    expect(shortAddress('  ,  ')).toBe('');
  });
});
