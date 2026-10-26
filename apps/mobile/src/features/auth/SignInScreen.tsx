import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { authErrorMessage } from '@/auth/errors';
import { signIn } from '@/auth/firebase-auth';
import { useTranslation } from '@/i18n';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { variant } from '@/variant/variant';

import { AuthLayout } from './AuthLayout';

export function SignInScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // On success the auth listener flips the session and the router leaves this screen.
  const submit = useMutation({ mutationFn: () => signIn(email.trim(), password) });

  return (
    <AuthLayout
      bare
      title={t('auth:welcome', { appName: variant.appName })}
      subtitle={t('auth:signInSubtitle')}
      error={submit.isError ? authErrorMessage(submit.error) : undefined}
      action={
        <>
          <Button
            size="big"
            title={t('auth:signIn')}
            onPress={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!email.trim() || !password}
          />
          <Button
            kind="link"
            title={t('auth:createAccountLink')}
            onPress={() => router.push('/sign-up')}
          />
        </>
      }
    >
      <TextField
        label={t('auth:email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label={t('auth:password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => submit.mutate()}
      />
      <Button
        kind="link"
        title={t('auth:forgotPassword')}
        onPress={() => router.push('/forgot-password')}
      />
    </AuthLayout>
  );
}
