import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { i18n } from '@/i18n';
import { LANGUAGE_PREFERENCE_KEY, LanguageProvider } from '@/i18n/language';
import { renderWithI18n } from '@/test/render';
import { THEME_PREFERENCE_KEY, ThemeProvider } from '@/theme/theme';

import { AccountScreen } from './AccountScreen';

let mockDeviceLanguages: string[] = ['en'];
jest.mock('expo-localization', () => ({
  getLocales: () => mockDeviceLanguages.map((languageCode) => ({ languageCode })),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/api/me', () => ({
  useMe: () => ({ data: undefined, isError: false }),
}));
jest.mock('@/auth/useSignOut', () => ({
  useSignOut: () => ({ mutate: jest.fn(), isPending: false }),
}));

beforeEach(async () => {
  mockDeviceLanguages = ['en'];
  await AsyncStorage.clear();
});

const appearance = () => within(screen.getByLabelText('Appearance'));
const language = () => within(screen.getByLabelText('Language'));

describe('AccountScreen appearance setting', () => {
  it('saves the chosen appearance on the device', async () => {
    await render(
      <ThemeProvider>
        <AccountScreen />
      </ThemeProvider>,
    );
    expect(appearance().getByRole('radio', { name: 'System' })).toBeChecked();

    await fireEvent.press(appearance().getByRole('radio', { name: 'Dark' }));

    expect(appearance().getByRole('radio', { name: 'Dark' })).toBeChecked();
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
    await waitFor(() => expect(appearance().getByRole('radio', { name: 'Light' })).toBeChecked());
  });
});

describe('AccountScreen language setting', () => {
  const renderScreen = () =>
    renderWithI18n(
      <ThemeProvider>
        <LanguageProvider>
          <AccountScreen />
        </LanguageProvider>
      </ThemeProvider>,
    );

  it('offers System and the three languages, with System selected by default', async () => {
    await renderScreen();
    for (const name of ['System', 'Français', 'العربية', 'English']) {
      expect(language().getByRole('radio', { name })).toBeOnTheScreen();
    }
    expect(language().getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('saves the chosen language on the device and applies it', async () => {
    await renderScreen();

    await fireEvent.press(language().getByRole('radio', { name: 'Français' }));

    // The screen is French now, so its Language group is called Langue.
    expect(
      within(screen.getByLabelText('Langue')).getByRole('radio', { name: 'Français' }),
    ).toBeChecked();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBe('fr'),
    );
    expect(i18n.language).toBe('fr');
  });

  it('shows the saved language on the next start', async () => {
    await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, 'ar');
    await renderScreen();
    // Arabic has no messages yet, so the screen reads in French.
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Langue')).getByRole('radio', { name: 'العربية' }),
      ).toBeChecked(),
    );
    expect(i18n.language).toBe('ar');
  });

  it('follows the phone under System', async () => {
    mockDeviceLanguages = ['de', 'ar'];
    await renderScreen();
    await waitFor(() => expect(i18n.language).toBe('ar'));
  });

  it('shows French until the Arabic messages exist', async () => {
    await renderScreen();
    await fireEvent.press(language().getByRole('radio', { name: 'العربية' }));
    expect(screen.getByLabelText('Langue')).toBeOnTheScreen();
    expect(screen.getByText('Se déconnecter')).toBeOnTheScreen();
  });
});
