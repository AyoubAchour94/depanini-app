import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { env } from '@/config/env';
import { ThemeProvider } from '@/theme/theme';

import { LegalSection, TermsConsent } from './LegalLinks';

let openURL: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

afterEach(() => {
  openURL.mockRestore();
});

describe('legal links', () => {
  it('defaults to the published GitHub Pages addresses', () => {
    expect(env.termsUrl).toBe('https://ayoubachour94.github.io/depanini-app/legal/terms-en/');
    expect(env.privacyUrl).toBe('https://ayoubachour94.github.io/depanini-app/legal/privacy-en/');
  });

  it('opens the Terms and the Privacy policy from the sign-up notice', async () => {
    await render(
      <ThemeProvider>
        <TermsConsent />
      </ThemeProvider>,
    );
    expect(screen.getByText(/By creating an account you accept the/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('link', { name: 'Terms' }));
    expect(openURL).toHaveBeenLastCalledWith(env.termsUrl);

    await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));
    expect(openURL).toHaveBeenLastCalledWith(env.privacyUrl);
  });

  it('opens both pages from the Account "Legal" section', async () => {
    await render(
      <ThemeProvider>
        <LegalSection />
      </ThemeProvider>,
    );
    expect(screen.getByText('Legal')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Terms of use' }));
    expect(openURL).toHaveBeenLastCalledWith(env.termsUrl);

    await fireEvent.press(screen.getByRole('button', { name: 'Privacy policy' }));
    expect(openURL).toHaveBeenLastCalledWith(env.privacyUrl);
  });

  it('does not crash when the browser cannot open the page', async () => {
    openURL.mockRejectedValue(new Error('no browser'));
    await render(
      <ThemeProvider>
        <LegalSection />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Terms of use' }));
    expect(openURL).toHaveBeenCalledTimes(1);
  });
});
