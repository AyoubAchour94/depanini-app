import { resolveVariant } from './variant';

describe('resolveVariant', () => {
  it('user variant has the customer identity', () => {
    const config = resolveVariant({ appVariant: 'user' });
    expect(config).toMatchObject({
      variant: 'user',
      appName: 'Depanini',
      bundleId: 'com.depanini.app',
      brandColor: '#1565C0',
      isDriverApp: false,
    });
  });

  it('driver variant has the driver identity', () => {
    const config = resolveVariant({ appVariant: 'driver' });
    expect(config).toMatchObject({
      variant: 'driver',
      appName: 'Depanini Driver',
      bundleId: 'com.depanini.driver',
      brandColor: '#F9A825',
      isDriverApp: true,
    });
  });

  it('falls back to the user variant when the build carries no valid variant', () => {
    expect(resolveVariant(undefined).variant).toBe('user');
    expect(resolveVariant({ appVariant: 'admin' }).variant).toBe('user');
  });
});
