import { clampFare } from './fare';

describe('clampFare', () => {
  it('keeps a fare inside the bounds', () => {
    expect(clampFare(60, 52, 195)).toBe(60);
    expect(clampFare(40, 52, 195)).toBe(52);
    expect(clampFare(500, 52, 195)).toBe(195);
  });
});
