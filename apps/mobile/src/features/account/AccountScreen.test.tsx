import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { THEME_PREFERENCE_KEY, ThemeProvider } from '@/theme/theme';

import { AccountScreen } from './AccountScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/api/me', () => ({
  useMe: () => ({ data: undefined, isError: false }),
}));
jest.mock('@/auth/useSignOut', () => ({
  useSignOut: () => ({ mutate: jest.fn(), isPending: false }),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('AccountScreen appearance setting', () => {
  it('saves the chosen appearance on the device', async () => {
    await render(
      <ThemeProvider>
        <AccountScreen />
      </ThemeProvider>,
    );
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(THEME_PREFERENCE_KEY)).toBe('dark'),
    );
  });

  it('shows the saved appearance on the next start', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'light');
    await render(
      <ThemeProvider>
        <AccountScreen />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked());
  });
});
