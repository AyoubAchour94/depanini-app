import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { consumeDriverOnboardingDone } from './onboarding';
import { OnboardingScreen } from './OnboardingScreen';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({ env: { apiUrl: 'http://api.test', environment: 'dev' } }));
jest.mock('@/variant/variant', () => ({
  variant: { isDriverApp: true, brandColor: '#F59E0B', appName: 'Depanini Driver' },
}));
jest.mock('@/auth/useSignOut', () => ({ useSignOut: () => ({ mutate: jest.fn() }) }));
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signed-in', user: { uid: 'u1' } }),
}));

afterEach(() => jest.restoreAllMocks());

it('marks the driver onboarding as done once the truck details are saved', async () => {
  const profile = {
    fullName: 'Karim B',
    phone: '+21655666777',
    truckType: 'flatbed',
    plateNumber: '123 TU 4567',
  };
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(profile));
  await render(
    <QueryClientProvider client={createTestQueryClient()}>
      <OnboardingScreen />
    </QueryClientProvider>,
  );

  await fireEvent.changeText(screen.getByLabelText('Full name'), profile.fullName);
  await fireEvent.changeText(screen.getByLabelText('Phone'), profile.phone);
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await fireEvent.press(await screen.findByRole('radio', { name: 'Flatbed' }));
  await fireEvent.changeText(screen.getByLabelText('Plate number'), profile.plateNumber);
  await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));

  await waitFor(() => {
    expect(consumeDriverOnboardingDone()).toBe(true);
  });
  expect(consumeDriverOnboardingDone()).toBe(false);
});
