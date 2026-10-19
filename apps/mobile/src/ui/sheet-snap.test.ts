import { keyboardOverlap, nearestSnap, resolveSnapHeights } from './sheet-snap';

describe('resolveSnapHeights', () => {
  it('resolves names, percentages and pixels against the available height', () => {
    expect(resolveSnapHeights(['peek', 'half', 'full'], { available: 800, minHeight: 0 })).toEqual([
      240, 440, 800,
    ]);
    expect(resolveSnapHeights(['40%', 500], { available: 800, minHeight: 0 })).toEqual([320, 500]);
  });

  it('never goes below the pinned footer and never above the available height', () => {
    expect(resolveSnapHeights(['peek', 900], { available: 800, minHeight: 300 })).toEqual([
      300, 800,
    ]);
  });

  it('keeps one height per snap point, in order, even when clamping makes two equal', () => {
    expect(
      resolveSnapHeights(['peek', 'half', 'full'], { available: 500, minHeight: 300 }),
    ).toEqual([300, 300, 500]);
  });
});

describe('nearestSnap', () => {
  const heights = [200, 400, 800];

  it('snaps to the closest height when released at rest', () => {
    expect(nearestSnap(heights, 430, 0)).toBe(1);
    expect(nearestSnap(heights, 700, 0)).toBe(2);
  });

  it('a fast upward fling (negative velocity) skips ahead', () => {
    expect(nearestSnap(heights, 250, -1.5)).toBe(1);
  });

  it('a fast downward fling goes down', () => {
    expect(nearestSnap(heights, 700, 1.5)).toBe(1);
  });
});

describe('keyboardOverlap', () => {
  it('is how far the keyboard covers the bottom of the container', () => {
    expect(keyboardOverlap(500, 844)).toBe(344);
  });

  it('is zero when the window already resized for the keyboard', () => {
    expect(keyboardOverlap(500, 480)).toBe(0);
  });
});
