import {
  availableHeight,
  CONTROLS_CLEARANCE,
  keyboardOverlap,
  nearestSnap,
  releaseVelocity,
  resolveSnapHeights,
} from './sheet-snap';

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

describe('availableHeight', () => {
  it('stops below the top controls row', () => {
    expect(availableHeight(844, { keyboardOverlap: 0, topInset: 47 })).toBe(
      844 - 47 - CONTROLS_CLEARANCE,
    );
    expect(CONTROLS_CLEARANCE).toBeGreaterThanOrEqual(12 + 48);
  });

  it('shrinks with the keyboard and never goes negative', () => {
    expect(availableHeight(844, { keyboardOverlap: 300, topInset: 0 })).toBe(
      844 - 300 - CONTROLS_CLEARANCE,
    );
    expect(availableHeight(10, { keyboardOverlap: 0, topInset: 0 })).toBe(0);
  });
});

describe('releaseVelocity', () => {
  it('keeps the velocity of a release right after a move', () => {
    expect(releaseVelocity(1.2, 16)).toBe(1.2);
  });

  it('ignores a stale velocity when the pointer rested before release', () => {
    expect(releaseVelocity(1.2, 300)).toBe(0);
    // Released at rest 400px down from full: the nearest snap, not a fling to peek.
    expect(nearestSnap([200, 460, 836], 436, releaseVelocity(1.2, 300))).toBe(1);
  });
});
