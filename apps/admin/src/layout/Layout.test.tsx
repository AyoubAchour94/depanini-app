import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createFakeApi, createFakeAuth } from '../test/fakes';
import { renderApp } from '../test/render';

describe('admin footer', () => {
  it('links to the Terms and the Privacy policy', async () => {
    const auth = createFakeAuth({ 'admin@example.com': { password: 'secret-pw', isAdmin: true } });
    await auth.signIn('admin@example.com', 'secret-pw');
    renderApp({ auth, api: createFakeApi({ get: () => ({ items: [], nextCursor: null }) }) });

    const terms = await screen.findByRole('link', { name: 'Terms' });
    const privacy = screen.getByRole('link', { name: 'Privacy policy' });
    expect(terms).toHaveAttribute('href', expect.stringMatching(/\/legal\/terms-en\/$/));
    expect(privacy).toHaveAttribute('href', expect.stringMatching(/\/legal\/privacy-en\/$/));
    expect(terms).toHaveAttribute('target', '_blank');
  });
});
