import { DOCUMENT_KINDS, type DocumentKind, type Verification } from '@depanini/shared';
import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import {
  useDeleteDocument,
  useSubmitVerification,
  useUploadDocument,
  useVerification,
} from '@/api/verification';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

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
  const verification = useVerification({ poll: true });
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const submit = useSubmitVerification();
  const [problem, setProblem] = useState<Problem | null>(null);

  if (!verification.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        {verification.isError ? (
          <>
            <Text style={[styles.message, { color: theme.danger }]}>{t.loadFailed}</Text>
            <Button title={t.retry} onPress={() => void verification.refetch()} />
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.brand} />
            <Text style={{ color: theme.textMuted }}>{t.loading}</Text>
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
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.body}>
      <StatusBanner verification={verification.data} />
      {problem ? (
        <Text style={[styles.message, { color: theme.danger }]}>{t.errors[problem]}</Text>
      ) : null}
      {DOCUMENT_KINDS.map((kind) => {
        const pages = documents.filter((document) => document.kind === kind);
        const label = t.kindLabels[kind];
        return (
          <View key={kind} style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.kind, { color: theme.text }]}>{label}</Text>
            <Text style={{ color: pages.length === 0 ? theme.warning : theme.textMuted }}>
              {pages.length === 0
                ? t.missing
                : status === 'rejected'
                  ? t.rejectedRow(pages.length)
                  : t.uploaded(pages.length)}
            </Text>
            {pages.map((page) => (
              <View key={page.id} style={styles.page}>
                <Text style={{ color: theme.text }}>
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
              <View style={styles.actions}>
                {Platform.OS === 'web' ? null : (
                  <Button
                    kind="link"
                    title={t.takePhoto}
                    accessibilityLabel={t.forKind(t.takePhoto, label)}
                    disabled={busy}
                    onPress={() => void add(kind, pickPhoto('camera'))}
                  />
                )}
                <Button
                  kind="link"
                  title={t.choosePhoto}
                  accessibilityLabel={t.forKind(t.choosePhoto, label)}
                  disabled={busy}
                  onPress={() => void add(kind, pickPhoto('library'))}
                />
                <Button
                  kind="link"
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
      {upload.isPending ? <Text style={{ color: theme.textMuted }}>{t.uploading}</Text> : null}
      {editable ? (
        <>
          {missingKinds.length > 0 ? (
            <Text style={{ color: theme.textMuted }}>{t.incomplete}</Text>
          ) : null}
          {submit.isError ? (
            <Text style={[styles.message, { color: theme.danger }]}>{t.submitFailed}</Text>
          ) : null}
          <Button
            title={t.submit}
            disabled={missingKinds.length > 0 || busy}
            loading={submit.isPending}
            onPress={() => {
              setProblem(null);
              submit.mutate();
            }}
          />
        </>
      ) : null}
    </ScrollView>
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
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text
        style={[
          styles.status,
          {
            color:
              status === 'rejected'
                ? theme.danger
                : status === 'approved'
                  ? theme.success
                  : theme.text,
          },
        ]}
      >
        {text}
      </Text>
      {status === 'rejected' ? (
        <Text style={{ color: theme.textMuted }}>{t.rejectedHint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 15 },
  body: { padding: 16, gap: 12 },
  card: { borderRadius: 12, padding: 16, gap: 6 },
  kind: { fontSize: 16, fontWeight: '600' },
  status: { fontSize: 16, fontWeight: '600' },
  page: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingTop: 6 },
});
