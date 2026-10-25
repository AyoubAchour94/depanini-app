import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { ApiError } from '@/api/client';
import { deleteAccount } from '@/api/me';
import { authErrorCode, authErrorMessage } from '@/auth/errors';
import { deleteCurrentUser, reauthenticate } from '@/auth/firebase-auth';
import { AuthLayout } from '@/features/auth/AuthLayout';
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
      title="Delete your account?"
      subtitle="This permanently deletes your account and your customer and driver details, in both Depanini apps. It can't be undone."
      error={remove.isError ? deleteErrorMessage(remove.error) : undefined}
      action={
        <>
          <Button
            size="big"
            kind="danger"
            title="Delete my account"
            onPress={() => remove.mutate()}
            loading={remove.isPending}
            disabled={!password}
          />
          <Button kind="link" title="Keep my account" onPress={() => router.back()} />
        </>
      }
    >
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        placeholder="Enter your password to confirm"
      />
    </AuthLayout>
  );
}

function deleteErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    return 'Could not delete your account. Check your connection and try again.';
  }
  // Only the password is asked for here, so don't mention the email.
  const code = authErrorCode(error);
  return code === 'auth/invalid-credential' || code === 'auth/wrong-password'
    ? 'Password is incorrect.'
    : authErrorMessage(error);
}
