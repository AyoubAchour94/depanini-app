import { type ReactNode, useContext } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/Text';

export interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  /** Error from the last submit, shown above the form. */
  error?: string;
  /** The screen has no navigation header, so it keeps clear of the status bar itself. */
  bare?: boolean;
  /** The one next action, pinned at the bottom with any secondary links under it. */
  action?: ReactNode;
  /** The fields. */
  children?: ReactNode;
}

/** Shared frame for the sign-in, sign-up, password reset and profile form screens. */
export function AuthLayout({ title, subtitle, error, bare, action, children }: AuthLayoutProps) {
  const t = useTheme();
  const auth = useAuth();
  const insets = useContext(SafeAreaInsetsContext);
  const unavailable = auth.status === 'signed-out' ? auth.unavailableReason : undefined;

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: t.color.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          {
            padding: t.space[6],
            paddingTop: t.space[6] + (bare ? (insets?.top ?? 0) + t.space[6] : 0),
            gap: t.space[4],
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: t.space[2] }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
        </View>
        {unavailable ? (
          <Notice tone="warning" text={`Sign-in is unavailable: ${unavailable}`} />
        ) : null}
        {error ? <Notice tone="danger" text={error} /> : null}
        {children ? <View style={{ gap: t.space[4] }}>{children}</View> : null}
      </ScrollView>
      {action ? (
        <View
          style={[
            styles.action,
            {
              paddingHorizontal: t.space[6],
              paddingTop: t.space[2],
              paddingBottom: Math.max(insets?.bottom ?? 0, t.space[4]),
              gap: t.space[4],
            },
          ]}
        >
          {action}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Notice({ tone, text }: { tone: 'danger' | 'warning'; text: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: tone === 'danger' ? t.color.dangerTint : t.color.warningTint,
        borderRadius: t.radius.md,
        padding: t.space[3],
      }}
      accessibilityRole="alert"
    >
      <Text variant="bodyStrong" tone={tone}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center' },
  action: { width: '100%', maxWidth: 440, alignSelf: 'center' },
});
