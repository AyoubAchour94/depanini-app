import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/client';
import { createFakeApi, createFakeAuth } from '../test/fakes';
import { renderApp } from '../test/render';

const emptyPage = { items: [], nextCursor: null };
const accounts = {
  'admin@example.com': { password: 'secret-pw', isAdmin: true },
  'driver@example.com': { password: 'secret-pw', isAdmin: false },
};

async function signInWith(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('admin claim gate', () => {
  it('shows the sign-in screen to a signed-out visitor', async () => {
    renderApp({ auth: createFakeAuth(accounts), api: createFakeApi() });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('lets an account with the admin claim in', async () => {
    const api = createFakeApi({ get: () => emptyPage });
    renderApp({ auth: createFakeAuth(accounts), api });
    await signInWith('admin@example.com', 'secret-pw');
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review queue' })).toBeInTheDocument();
  });

  it('says "Not an admin" and signs out an account without the claim', async () => {
    const auth = createFakeAuth(accounts);
    const api = createFakeApi({ get: () => emptyPage });
    renderApp({ auth, api });
    await signInWith('driver@example.com', 'secret-pw');
    expect(await screen.findByText('Not an admin')).toBeInTheDocument();
    expect(auth.signOutCalls).toBe(1);
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('signs out a restored session that has no admin claim', async () => {
    const auth = createFakeAuth(accounts, 'driver@example.com');
    renderApp({ auth, api: createFakeApi() });
    expect(await screen.findByText('Not an admin')).toBeInTheDocument();
    expect(auth.signOutCalls).toBe(1);
  });

  it('shows a readable message for a wrong password', async () => {
    renderApp({ auth: createFakeAuth(accounts), api: createFakeApi() });
    await signInWith('admin@example.com', 'wrong');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Wrong email or password.'),
    );
  });

  it('signs out from the sidebar', async () => {
    const auth = createFakeAuth(accounts, 'admin@example.com');
    renderApp({ auth, api: createFakeApi({ get: () => emptyPage }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('revoked admin claim mid-session', () => {
  it.each([401, 403])('signs out and says "Not an admin" on a %i from the API', async (status) => {
    const auth = createFakeAuth(accounts, 'admin@example.com');
    const api = createFakeApi({
      get: () => {
        throw new ApiError(status, 'Forbidden');
      },
    });
    renderApp({ auth, api });
    expect(await screen.findByText('Not an admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(auth.signOutCalls).toBe(1);
  });

  it('keeps the session on other API failures', async () => {
    const auth = createFakeAuth(accounts, 'admin@example.com');
    const api = createFakeApi({
      get: () => {
        throw new ApiError(500, 'Boom');
      },
    });
    renderApp({ auth, api });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(auth.signOutCalls).toBe(0);
  });
});
