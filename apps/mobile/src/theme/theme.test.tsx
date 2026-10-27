import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { i18n } from '@/i18n';

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

describe('theme fonts', () => {
  function FontProbe() {
    const theme = useTheme();
    return (
      <Text testID="fonts">
        {[theme.script, theme.type.body.fontFamily, theme.type.display.letterSpacing].join(':')}
      </Text>
    );
  }
  const fonts = () => screen.getByTestId('fonts').props.children;

  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('sets the text in Inter for a Latin language', async () => {
    await render(
      <ThemeProvider>
        <FontProbe />
      </ThemeProvider>,
    );
    expect(fonts()).toBe('latin:Inter_400Regular:-1.5');
  });

  it('sets all text in IBM Plex Sans Arabic, untracked, when the language is Arabic', async () => {
    await render(
      <ThemeProvider>
        <FontProbe />
      </ThemeProvider>,
    );
    await act(() => i18n.changeLanguage('ar'));
    expect(fonts()).toBe('arabic:IBMPlexSansArabic_400Regular:0');
  });

  it('follows the language without a provider too', async () => {
    await act(() => i18n.changeLanguage('ar'));
    await render(<FontProbe />);
    expect(fonts()).toBe('arabic:IBMPlexSansArabic_400Regular:0');
  });
});
