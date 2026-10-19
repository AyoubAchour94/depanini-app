import {
  MAX_REPORT_NOTE_LENGTH,
  REPORT_CATEGORIES,
  REPORT_WINDOW_DAYS,
  type Report,
  type ReportCategory,
  reportInputSchema,
  type TowRequest,
} from '@depanini/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useSubmitReport, useTripReports } from '@/api/reports';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceField } from '@/ui/ChoiceField';
import { TextField } from '@/ui/TextField';

import { tripStrings as t } from './strings';

const WINDOW_MS = REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const CATEGORY_OPTIONS = REPORT_CATEGORIES.map((value) => ({
  value,
  label: t.reportCategories[value],
}));

/**
 * Whether to offer reporting a trip: it is over and, for a completed one, its
 * 14-day window (inclusive) has not passed. The API is authoritative; this only
 * shows or hides the link. A cancelled request carries no end time, so the app
 * offers the link and the API answers 409 once the window is gone.
 */
export function canReport(request: Pick<TowRequest, 'status' | 'completedAt'>, now = Date.now()) {
  if (request.status === 'cancelled') return true;
  if (request.status !== 'completed' || !request.completedAt) return false;
  return now <= Date.parse(request.completedAt) + WINDOW_MS;
}

/**
 * "Report a problem with this trip" for either side: a link that opens the
 * form (category, required note), and the reports I already sent with their
 * status and resolution note. The payment dispute is a different flow. Rendered
 * in the caller's scroll view.
 */
export function ReportProblemCard({ request }: { request: TowRequest }) {
  const theme = useTheme();
  const eligible = request.status === 'completed' || request.status === 'cancelled';
  const reports = useTripReports(request.id, { enabled: eligible });
  const submit = useSubmitReport();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [category, setCategory] = useState<ReportCategory>();
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ category?: string; note?: string }>({});

  if (!eligible) return null;
  const mine = reports.data ?? [];
  const hasOpen = mine.some((report) => report.status === 'open');
  const canSend = !hasOpen && canReport(request);
  if (mine.length === 0 && !canSend && !sent) return null;

  const onSend = () => {
    const parsed = reportInputSchema.safeParse({ category, note });
    if (!parsed.success) {
      const field = (name: string) =>
        parsed.error.issues.find((issue) => issue.path[0] === name)?.message;
      setErrors({ category: field('category'), note: field('note') });
      return;
    }
    setErrors({});
    submit.mutate(
      { id: request.id, ...parsed.data },
      {
        onSuccess: () => {
          setSent(true);
          setOpen(false);
          setCategory(undefined);
          setNote('');
        },
      },
    );
  };

  const conflict = submit.error instanceof ApiError && submit.error.status === 409;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {sent ? (
        <Text accessibilityLiveRegion="polite" style={[styles.sent, { color: theme.success }]}>
          {t.reportSent}
        </Text>
      ) : null}
      {mine.length > 0 ? (
        <>
          <Text style={[styles.title, { color: theme.text }]}>{t.reportsTitle}</Text>
          {mine.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </>
      ) : null}
      {canSend && open ? (
        <>
          <ChoiceField
            label={t.reportCategoryLabel}
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(value) => {
              setCategory(value);
              setErrors((current) => ({ ...current, category: undefined }));
            }}
            error={errors.category}
            wrap
          />
          <TextField
            label={t.reportNoteLabel}
            value={note}
            onChangeText={(text) => {
              setNote(text);
              setErrors((current) => ({ ...current, note: undefined }));
            }}
            maxLength={MAX_REPORT_NOTE_LENGTH}
            multiline
            editable={!submit.isPending}
            error={errors.note}
          />
          <Text style={[styles.counter, { color: theme.textMuted }]}>
            {t.reportNoteCounter(note.length, MAX_REPORT_NOTE_LENGTH)}
          </Text>
          {submit.isError ? (
            <Text style={{ color: theme.danger }}>
              {conflict ? t.reportConflict : t.reportFailed}
            </Text>
          ) : null}
          <Button title={t.reportSend} loading={submit.isPending} onPress={onSend} />
          <Button title={t.reportBack} kind="link" onPress={() => setOpen(false)} />
        </>
      ) : canSend ? (
        <Button
          title={t.reportLink}
          kind="link"
          onPress={() => {
            submit.reset();
            setSent(false);
            setOpen(true);
          }}
        />
      ) : null}
    </View>
  );
}

function ReportRow({ report }: { report: Report }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={[styles.category, { color: theme.text }]}>
          {t.reportCategories[report.category]}
        </Text>
        <Text style={{ color: report.status === 'resolved' ? theme.success : theme.warning }}>
          {t.reportStatus[report.status]}
        </Text>
      </View>
      <Text style={{ color: theme.textMuted }}>{report.note}</Text>
      {report.status === 'resolved' && report.resolutionNote ? (
        <Text style={{ color: theme.text }}>{t.reportResolution(report.resolutionNote)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '600' },
  sent: { fontSize: 16, fontWeight: '600' },
  row: { gap: 4 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  category: { fontWeight: '600' },
  counter: { fontSize: 12, textAlign: 'right' },
});
