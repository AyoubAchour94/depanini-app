import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/theme';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  /** Error from the last submit, shown above the form. */
  error?: string;
  children: ReactNode;
}

/** Shared frame for the sign-in, sign-up, password reset and profile form screens. */
export function AuthLayout({ title, subtitle, error, children }: AuthLayoutProps) {
  const theme = useTheme();
  const auth = useAuth();
  const unavailable = auth.status === 'signed-out' ? auth.unavailableReason : undefined;

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>
        ) : null}
        {unavailable ? (
          <Notice color={theme.warning} text={`Sign-in is unavailable: ${unavailable}`} />
        ) : null}
        {error ? <Notice color={theme.danger} text={error} /> : null}
        <View style={styles.form}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Notice({ color, text }: { color: string; text: string }) {
  return (
    <View style={[styles.notice, { borderColor: color }]} accessibilityRole="alert">
      <Text style={{ color }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15 },
  notice: { borderWidth: 1, borderRadius: 10, padding: 12 },
  form: { gap: 16, marginTop: 8 },
});
