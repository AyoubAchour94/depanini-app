import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { authErrorMessage } from '@/auth/errors';
import { sendPasswordReset } from '@/auth/firebase-auth';
import { useTranslation } from '@/i18n';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

import { AuthLayout } from './AuthLayout';

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
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
      <AuthLayout
        title={t('auth:checkEmail')}
        action={<Button size="big" title={t('auth:backToSignIn')} onPress={() => router.back()} />}
      >
        {/* Worded so it doesn't reveal whether an account exists for this email. */}
        <Text>{t('auth:resetSent', { email: email.trim() })}</Text>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth:resetTitle')}
      subtitle={t('auth:resetSubtitle')}
      error={submit.isError ? authErrorMessage(submit.error) : undefined}
      action={
        <>
          <Button
            size="big"
            title={t('auth:sendResetLink')}
            onPress={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!email.trim()}
          />
          <Button kind="link" title={t('auth:backToSignIn')} onPress={() => router.back()} />
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
        onSubmitEditing={() => submit.mutate()}
      />
    </AuthLayout>
  );
}
