import { clampFare, towMinutes } from './fare';

describe('clampFare', () => {
  it('keeps a fare inside the bounds', () => {
    expect(clampFare(60, 52, 195)).toBe(60);
    expect(clampFare(40, 52, 195)).toBe(52);
    expect(clampFare(500, 52, 195)).toBe(195);
  });
});

describe('towMinutes', () => {
  it('rounds the driving time up, at least a minute', () => {
    expect(towMinutes(18_400)).toBe(28);
    expect(towMinutes(100)).toBe(1);
  });
});
