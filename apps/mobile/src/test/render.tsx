import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { i18n, type LanguageCode } from '@/i18n';

// Every test starts in English, like the app's own first render.
afterEach(async () => {
  await i18n.changeLanguage('en');
});

/**
 * Renders with the app's i18n, in `language` (English by default). Components
 * already find the shared i18next instance on their own; this also pins the
 * language, so a test can render a screen in another one.
 */
export async function renderWithI18n(
  ui: ReactElement,
  { language = 'en', ...options }: RenderOptions & { language?: LanguageCode } = {},
) {
  await i18n.changeLanguage(language);
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>, options);
}
