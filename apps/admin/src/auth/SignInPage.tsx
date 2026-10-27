import { type FormEvent, useState } from 'react';

import { useTranslation } from '../i18n';
import { LanguageSwitch } from '../layout/LanguageSwitch';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useAuth } from './AuthProvider';

/** The message key for a failed sign-in. Firebase codes are not for people. */
function signInErrorKey(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) {
    return 'auth:wrongCredentials';
  }
  if (code === 'auth/too-many-requests') return 'auth:tooManyAttempts';
  if (code === 'auth/network-request-failed') return 'auth:network';
  return 'auth:failed';
}

export function SignInPage() {
  const { t } = useTranslation();
  const { state, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null); // a message key
  const [busy, setBusy] = useState(false);

  const notice = state.status === 'signedOut' ? state.notice : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(signInErrorKey(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centered">
      <div className="corner">
        <LanguageSwitch />
      </div>
      <form className="card card--narrow stack" onSubmit={submit} aria-labelledby="sign-in-title">
        <h1 id="sign-in-title">{t('common:brand')}</h1>
        {notice ? (
          <p role="alert" className="error">
            {t(`auth:${notice}`)}
          </p>
        ) : null}
        <Input
          label={t('auth:email')}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label={t('auth:password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error ? t(error) : null}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          {t('auth:signIn')}
        </Button>
      </form>
    </main>
  );
}
