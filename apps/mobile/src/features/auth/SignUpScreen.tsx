import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { authErrorMessage } from '@/auth/errors';
import { signUp } from '@/auth/firebase-auth';
import { TermsConsent } from '@/features/legal/LegalLinks';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

import { AuthLayout } from './AuthLayout';

export function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const mismatch = confirmation.length > 0 && confirmation !== password;
  // Signing up also signs in; the auth listener then leaves the auth screens.
  const submit = useMutation({ mutationFn: () => signUp(email.trim(), password) });

  return (
    <AuthLayout
      title="Create your account"
      action={
        <>
          <TermsConsent />
          <Button
            size="big"
            title="Create account"
            onPress={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!email.trim() || !password || confirmation !== password}
          />
          <Button
            kind="link"
            title="Already have an account? Sign in"
            onPress={() => router.back()}
          />
        </>
      }
      error={
        mismatch
          ? 'Passwords do not match.'
          : submit.isError
            ? authErrorMessage(submit.error)
            : undefined
      }
    >
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="Confirm password"
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
    </AuthLayout>
  );
}
