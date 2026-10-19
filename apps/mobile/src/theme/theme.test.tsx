import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import {
  loadThemePreference,
  THEME_PREFERENCE_KEY,
  ThemeProvider,
  useTheme,
  useThemeSetting,
} from './theme';

let mockSystemScheme: 'light' | 'dark' | null = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockSystemScheme,
}));

function Probe() {
  const theme = useTheme();
  const setting = useThemeSetting();
  return (
    <>
      <Text testID="probe">
        {theme.scheme}:{theme.color.brand}:{setting.preference}:{String(setting.ready)}
      </Text>
      <Pressable testID="pick-dark" onPress={() => setting.setPreference('dark')} />
      <Pressable testID="pick-system" onPress={() => setting.setPreference('system')} />
    </>
  );
}

const probe = () => screen.getByTestId('probe').props.children.join('');

beforeEach(async () => {
  mockSystemScheme = 'light';
  await AsyncStorage.clear();
});

describe('theme setting', () => {
  it('follows the phone when nothing is saved', async () => {
    mockSystemScheme = 'dark';
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(probe()).toMatch(/true$/));
    expect(probe()).toBe('dark:#2563EB:system:true');
  });

  it('applies a forced scheme over the phone and saves it', async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(probe()).toMatch(/true$/));
    await fireEvent.press(screen.getByTestId('pick-dark'));
    expect(probe()).toBe('dark:#2563EB:dark:true');
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(THEME_PREFERENCE_KEY)).toBe('dark'),
    );
  });

  it('restores the saved preference on the next start', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'dark');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(probe()).toBe('dark:#2563EB:dark:true'));
  });

  it('switches back to following the phone', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'dark');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(probe()).toMatch(/dark:true$/));
    await fireEvent.press(screen.getByTestId('pick-system'));
    expect(probe()).toBe('light:#1463D9:system:true');
  });

  it('ignores a saved value it does not know', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'sepia');
    expect(await loadThemePreference()).toBe('system');
  });

  it('falls back to the phone without a provider', async () => {
    mockSystemScheme = 'dark';
    await render(<Probe />);
    expect(probe()).toBe('dark:#2563EB:system:true');
  });
});
