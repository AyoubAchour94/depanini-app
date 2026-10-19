/** A snap point: a name, a percentage of the available height ('40%') or pixels. */
export type SnapPoint = 'peek' | 'half' | 'full' | `${number}%` | number;

const NAMED = { peek: 0.3, half: 0.55, full: 1 } as const;

/** How far ahead (ms) a release velocity throws the sheet before it settles. */
const THROW_MS = 150;

/**
 * Pixel heights of the snap points, one per point and in the same order (callers
 * list them ascending, so an index means the same snap everywhere). Each is
 * kept between `minHeight` (handle and pinned footer, so the action is never
 * clipped) and `available`.
 */
export function resolveSnapHeights(
  snapPoints: readonly SnapPoint[],
  { available, minHeight }: { available: number; minHeight: number },
): number[] {
  return snapPoints.map((point) => {
    let height: number;
    if (typeof point === 'number') height = point;
    else if (point in NAMED) height = NAMED[point as keyof typeof NAMED] * available;
    else height = (parseFloat(point) / 100) * available;
    return Math.round(Math.min(available, Math.max(minHeight, height)));
  });
}

/**
 * The snap index to settle on after a drag released at `height` with vertical
 * `velocityY` (px/ms, positive = moving down): the snap closest to where the
 * sheet would coast to, so a fast fling skips ahead and a slow release stays.
 */
export function nearestSnap(heights: readonly number[], height: number, velocityY: number): number {
  const projected = height - velocityY * THROW_MS;
  let closest = 0;
  heights.forEach((h, i) => {
    if (Math.abs(h - projected) < Math.abs(heights[closest]! - projected)) closest = i;
  });
  return closest;
}

/** How far the keyboard covers the bottom of a container (0 when the window already resized). */
export function keyboardOverlap(keyboardTop: number, containerBottom: number): number {
  return Math.max(0, containerBottom - keyboardTop);
}
