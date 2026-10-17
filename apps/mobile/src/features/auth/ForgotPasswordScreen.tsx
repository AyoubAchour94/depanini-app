import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { authErrorMessage } from '@/auth/errors';
import { sendPasswordReset } from '@/auth/firebase-auth';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

import { AuthLayout } from './AuthLayout';

export function ForgotPasswordScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const submit = useMutation({
    mutationFn: async () => {
      try {
        await sendPasswordReset(email.trim());
      } catch (error) {
        // Projects without email enumeration protection report unknown emails;
        // treat them as sent so the screen doesn't reveal which accounts exist.
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      }
    },
  });

  if (submit.isSuccess) {
    return (
      <AuthLayout title="Check your email">
        {/* Worded so it doesn't reveal whether an account exists for this email. */}
        <Text style={{ color: theme.text }}>
          If an account exists for {email.trim()}, we sent a link to reset its password.
        </Text>
        <Button title="Back to sign in" onPress={() => router.back()} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      error={submit.isError ? authErrorMessage(submit.error) : undefined}
    >
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        onSubmitEditing={() => submit.mutate()}
      />
      <Button
        title="Send reset link"
        onPress={() => submit.mutate()}
        loading={submit.isPending}
        disabled={!email.trim()}
      />
      <Button kind="link" title="Back to sign in" onPress={() => router.back()} />
    </AuthLayout>
  );
}
