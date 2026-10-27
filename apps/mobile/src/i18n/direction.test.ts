import { directionOf, type NativeDirection, syncNativeDirection } from './direction';

describe('directionOf', () => {
  it('is right to left for Arabic only', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('fr')).toBe('ltr');
    expect(directionOf('en')).toBe('ltr');
  });
});

/** A fake of the native side: React Native's direction applies only after a reload. */
function fakeNative(startRTL: boolean, { sticks = true } = {}) {
  let applied = startRTL;
  let pending = startRTL;
  let attempt: string | null = null;
  const native: NativeDirection & { reloads: number; reloadNow: () => void } = {
    reloads: 0,
    isRTL: () => applied,
    setRTL: (rtl) => {
      pending = rtl;
    },
    reload: async () => {
      native.reloads += 1;
    },
    reloadNow: () => {
      if (sticks) applied = pending;
    },
    readAttempt: async () => attempt,
    writeAttempt: async (value) => {
      attempt = value;
    },
  };
  return native;
}

describe('syncNativeDirection', () => {
  it('does nothing when the layout already has the direction', async () => {
    const native = fakeNative(false);
    await expect(syncNativeDirection('ltr', native)).resolves.toBe('applied');
    expect(native.reloads).toBe(0);
  });

  it('reloads the app once when the direction changes', async () => {
    const native = fakeNative(false);
    await expect(syncNativeDirection('rtl', native)).resolves.toBe('reloading');
    expect(native.reloads).toBe(1);
    native.reloadNow();
    await expect(syncNativeDirection('rtl', native)).resolves.toBe('applied');
    expect(native.reloads).toBe(1);
  });

  it('switches back to left to right the same way', async () => {
    const native = fakeNative(true);
    await expect(syncNativeDirection('ltr', native)).resolves.toBe('reloading');
    native.reloadNow();
    await expect(syncNativeDirection('ltr', native)).resolves.toBe('applied');
  });

  it('never reloads in a loop when the direction does not stick (Expo Go)', async () => {
    const native = fakeNative(false, { sticks: false });
    await syncNativeDirection('rtl', native);
    native.reloadNow();
    await expect(syncNativeDirection('rtl', native)).resolves.toBe('unsupported');
    expect(native.reloads).toBe(1);
  });

  it('tries again after a later switch that worked', async () => {
    const native = fakeNative(false);
    await syncNativeDirection('rtl', native);
    native.reloadNow();
    await syncNativeDirection('rtl', native);
    await syncNativeDirection('ltr', native);
    native.reloadNow();
    await syncNativeDirection('ltr', native);
    await expect(syncNativeDirection('rtl', native)).resolves.toBe('reloading');
    expect(native.reloads).toBe(3);
  });
});
