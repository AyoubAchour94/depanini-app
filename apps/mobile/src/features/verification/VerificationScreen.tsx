import { DOCUMENT_KINDS, type DocumentKind, type Verification } from '@depanini/shared';
import { useContext, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import {
  useDeleteDocument,
  useSubmitVerification,
  useUploadDocument,
  useVerification,
} from '@/api/verification';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

import { type PickResult, pickPdf, pickPhoto } from './pickers';
import { verificationStrings as t } from './strings';

type Problem = keyof typeof t.errors;

/**
 * The driver's documents and where their check stands: one row per required kind with its
 * pages, and while the documents can still change (not submitted, or rejected) a way to add
 * or remove pages and to send them for review.
 */
export function VerificationScreen() {
  const theme = useTheme();
  const insets = useContext(SafeAreaInsetsContext);
  const verification = useVerification({ poll: true });
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const submit = useSubmitVerification();
  const [problem, setProblem] = useState<Problem | null>(null);

  if (!verification.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        {verification.isError ? (
          <>
            <Text variant="heading" tone="danger" style={styles.centered}>
              {t.loadFailed}
            </Text>
            <Button title={t.retry} onPress={() => void verification.refetch()} />
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.color.brandAccent} size="large" />
            <Text tone="muted">{t.loading}</Text>
          </>
        )}
      </View>
    );
  }

  const { status, documents, missingKinds } = verification.data;
  const editable = status === 'unsubmitted' || status === 'rejected';
  const busy = upload.isPending || remove.isPending || submit.isPending;

  const add = async (kind: DocumentKind, picked: Promise<PickResult>) => {
    setProblem(null);
    const result = await picked;
    if ('error' in result) {
      if (result.error !== 'cancelled') setProblem(result.error);
      return;
    }
    upload.mutate(
      { kind, file: result.file },
      { onError: (error) => setProblem(uploadProblem(error)) },
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.color.background }]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ padding: theme.space[4], gap: theme.space[3] }}
      >
        <StatusBanner verification={verification.data} />
        {problem ? (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: theme.color.dangerTint,
              borderRadius: theme.radius.md,
              padding: theme.space[3],
            }}
          >
            <Text variant="bodyStrong" tone="danger">
              {t.errors[problem]}
            </Text>
          </View>
        ) : null}
        {DOCUMENT_KINDS.map((kind) => {
          const pages = documents.filter((document) => document.kind === kind);
          const label = t.kindLabels[kind];
          return (
            <View
              key={kind}
              style={[
                styles.card,
                {
                  backgroundColor: theme.color.surface,
                  borderRadius: theme.radius.xl,
                  padding: theme.space[4],
                  gap: theme.space[3],
                },
              ]}
            >
              <View style={styles.kindHead}>
                <Text variant="heading" style={styles.fill}>
                  {label}
                </Text>
                <Pill
                  tone={
                    pages.length === 0 ? 'warning' : status === 'rejected' ? 'danger' : 'success'
                  }
                  label={
                    pages.length === 0
                      ? t.missing
                      : status === 'rejected'
                        ? t.rejectedRow(pages.length)
                        : t.uploaded(pages.length)
                  }
                />
              </View>
              {pages.map((page) => (
                <View key={page.id} style={styles.page}>
                  <Text tone="muted" style={styles.fill}>
                    {t.pageLine(
                      page.page,
                      page.contentType === 'application/pdf' ? t.pdf : t.photo,
                      page.sizeBytes,
                    )}
                  </Text>
                  {editable ? (
                    <Button
                      kind="link"
                      title={t.removePage(page.page)}
                      accessibilityLabel={t.forKind(t.removePage(page.page), label)}
                      disabled={busy}
                      onPress={() => {
                        setProblem(null);
                        remove.mutate(page.id, {
                          onError: (error) =>
                            setProblem(
                              error instanceof ApiError && error.status === 409
                                ? 'locked'
                                : 'removeFailed',
                            ),
                        });
                      }}
                    />
                  ) : null}
                </View>
              ))}
              {editable ? (
                <View style={[styles.actions, { gap: theme.space[2] }]}>
                  {Platform.OS === 'web' ? null : (
                    <Button
                      kind="secondary"
                      size="sm"
                      title={t.takePhoto}
                      accessibilityLabel={t.forKind(t.takePhoto, label)}
                      disabled={busy}
                      onPress={() => void add(kind, pickPhoto('camera'))}
                    />
                  )}
                  <Button
                    kind="secondary"
                    size="sm"
                    title={t.choosePhoto}
                    accessibilityLabel={t.forKind(t.choosePhoto, label)}
                    disabled={busy}
                    onPress={() => void add(kind, pickPhoto('library'))}
                  />
                  <Button
                    kind="secondary"
                    size="sm"
                    title={t.addPdf}
                    accessibilityLabel={t.forKind(t.addPdf, label)}
                    disabled={busy}
                    onPress={() => void add(kind, pickPdf())}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
        {upload.isPending ? <Text tone="muted">{t.uploading}</Text> : null}
        {editable && missingKinds.length > 0 ? <Text tone="muted">{t.incomplete}</Text> : null}
        {editable && submit.isError ? (
          <Text variant="bodyStrong" tone="danger">
            {t.submitFailed}
          </Text>
        ) : null}
      </ScrollView>
      {editable ? (
        <View
          style={{
            paddingHorizontal: theme.space[4],
            paddingTop: theme.space[2],
            paddingBottom: Math.max(insets?.bottom ?? 0, theme.space[4]),
          }}
        >
          <Button
            size="big"
            title={t.submit}
            disabled={missingKinds.length > 0 || busy}
            loading={submit.isPending}
            onPress={() => {
              setProblem(null);
              submit.mutate();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function uploadProblem(error: unknown): Problem {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'tooLarge';
    if (error.status === 415) return 'wrongType';
    if (error.status === 409) return 'locked';
  }
  return 'uploadFailed';
}

function StatusBanner({ verification }: { verification: Verification }) {
  const theme = useTheme();
  const { status, rejectionReason } = verification;
  const text =
    status === 'pending'
      ? t.pending
      : status === 'approved'
        ? t.approved
        : status === 'rejected'
          ? t.rejected(rejectionReason)
          : t.intro;
  const tint =
    status === 'rejected'
      ? theme.color.dangerTint
      : status === 'approved'
        ? theme.color.successTint
        : status === 'pending'
          ? theme.color.warningTint
          : theme.color.brandTint;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tint,
          borderRadius: theme.radius.xl,
          padding: theme.space[4],
          gap: theme.space[1],
        },
      ]}
    >
      <Text
        variant="heading"
        tone={status === 'rejected' ? 'danger' : status === 'approved' ? 'success' : 'text'}
      >
        {text}
      </Text>
      {status === 'rejected' ? <Text tone="muted">{t.rejectedHint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  centered: { textAlign: 'center' },
  card: {},
  kindHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  page: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
