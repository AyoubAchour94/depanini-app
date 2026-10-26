import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { ApiError } from '@/api/client';
import { deleteAccount } from '@/api/me';
import { authErrorCode, authErrorMessage } from '@/auth/errors';
import { deleteCurrentUser, reauthenticate } from '@/auth/firebase-auth';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { translate, useTranslation } from '@/i18n';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

/**
 * Confirms and deletes the account in both apps (App Store 5.1.1(v), Google
 * Play). Asking for the password first means Firebase will accept the user
 * deletion that follows: it refuses one after an old sign-in
 * (`auth/requires-recent-login`), which would otherwise leave a sign-in
 * without an account. Once the Firebase user is gone, the auth listener
 * reports a sign-out and the router returns to sign-in.
 *
 * Email/password only for now; Google sign-in (#6) will need its own
 * re-authentication here.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const remove = useMutation({
    mutationFn: async () => {
      await reauthenticate(password);
      // The API can't delete Firebase users, so the app does it after.
      await deleteAccount();
      await deleteCurrentUser();
    },
    // Drop the deleted account's cached API data.
    onSuccess: () => queryClient.clear(),
  });

  return (
    <AuthLayout
      title={t('account:delete.title')}
      subtitle={t('account:delete.subtitle')}
      error={remove.isError ? deleteErrorMessage(remove.error) : undefined}
      action={
        <>
          <Button
            size="big"
            kind="danger"
            title={t('account:delete.confirm')}
            onPress={() => remove.mutate()}
            loading={remove.isPending}
            disabled={!password}
          />
          <Button kind="link" title={t('account:delete.keep')} onPress={() => router.back()} />
        </>
      }
    >
      <TextField
        label={t('auth:password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        placeholder={t('account:delete.passwordPlaceholder')}
      />
    </AuthLayout>
  );
}

function deleteErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    return translate('account:delete.failed');
  }
  // Only the password is asked for here, so don't mention the email.
  const code = authErrorCode(error);
  return code === 'auth/invalid-credential' || code === 'auth/wrong-password'
    ? translate('account:delete.wrongPassword')
    : authErrorMessage(error);
}
