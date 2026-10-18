import { act, renderHook } from '@testing-library/react-native';

import { formatRemaining, useCountdown } from './countdown';

describe('formatRemaining', () => {
  it.each([
    [15 * 60_000, '15:00'],
    [61_000, '1:01'],
    [59_001, '1:00'],
    [1, '0:01'],
    [0, '0:00'],
    [-5, '0:00'],
  ])('shows %i ms as %s', (ms, text) => {
    expect(formatRemaining(ms)).toBe(text);
  });
});

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('counts down and calls onElapsed once at zero', async () => {
    const onElapsed = jest.fn();
    const { result } = await renderHook(() => useCountdown('2026-01-01T10:00:03.000Z', onElapsed));
    expect(result.current).toBe(3000);

    await act(async () => jest.advanceTimersByTime(2000));
    expect(result.current).toBe(1000);
    expect(onElapsed).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it('calls onElapsed right away for a date in the past', async () => {
    const onElapsed = jest.fn();
    const { result } = await renderHook(() => useCountdown('2026-01-01T09:00:00.000Z', onElapsed));
    await act(async () => jest.advanceTimersByTime(0));
    expect(result.current).toBe(0);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it('has nothing to count without a date', async () => {
    const { result } = await renderHook(() => useCountdown(undefined, jest.fn()));
    expect(result.current).toBeNull();
  });
});
