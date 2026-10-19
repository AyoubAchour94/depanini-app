import { type FormEvent, useState } from 'react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useAuth } from './AuthProvider';

/** The message for a failed sign-in. Firebase codes are not for people. */
function signInError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) {
    return 'Wrong email or password.';
  }
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  if (code === 'auth/network-request-failed') return 'Cannot reach the sign-in service.';
  return 'Could not sign in.';
}

export function SignInPage() {
  const { state, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notice = state.status === 'signedOut' ? state.notice : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(signInError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centered">
      <form className="card card--narrow stack" onSubmit={submit} aria-labelledby="sign-in-title">
        <h1 id="sign-in-title">Depanini Admin</h1>
        {notice ? (
          <p role="alert" className="error">
            {notice}
          </p>
        ) : null}
        <Input
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          Sign in
        </Button>
      </form>
    </main>
  );
}
