import {
  customerRatingInputSchema,
  driverRatingInputSchema,
  MAX_RATING_COMMENT_LENGTH,
} from '@depanini/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useMyRating, useSubmitRating } from '@/api/towRequests';
import { driverStrings } from '@/features/driver/strings';
import { requestStrings } from '@/features/request/strings';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

import { StarRatingInput } from './StarRatingInput';
import { tripStrings as t } from './strings';

export type RatingSide = 'customer' | 'driver';

const SIDES = {
  customer: {
    title: t.rateDriverTitle,
    schema: customerRatingInputSchema,
    labels: requestStrings.driverTagLabels as Record<string, string>,
  },
  driver: {
    title: t.rateCustomerTitle,
    schema: driverRatingInputSchema,
    labels: driverStrings.customerTagLabels as Record<string, string>,
  },
};

/**
 * Rate the other side of a completed trip: stars, tags for this side and an
 * optional comment. It shows only while the API says the trip can be rated
 * (`canRate`) or, once rated, the rating that was sent. Rendered in the
 * caller's scroll view.
 */
export function RateTripCard({ side, requestId }: { side: RatingSide; requestId: string }) {
  const theme = useTheme();
  const rating = useMyRating(requestId);
  const submit = useSubmitRating();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [hint, setHint] = useState<string>();
  const { title, schema, labels } = SIDES[side];

  if (!rating.data) return null;
  const { mine, canRate } = rating.data;

  if (mine) {
    return (
      <Card style={{ gap: theme.space[1] }}>
        <Text variant="heading">{t.thanksForRating}</Text>
        <Text tone="muted">{t.youRated(mine.stars)}</Text>
      </Card>
    );
  }
  if (!canRate) return null;

  const toggle = (tag: string) => {
    setHint(undefined);
    setTags((current) =>
      current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag],
    );
  };

  const onSend = () => {
    const parsed = schema.safeParse({ stars: stars || undefined, tags, comment });
    if (!parsed.success) {
      setHint(parsed.error.issues[0]?.path[0] === 'tags' ? t.tagsRequired : t.pickStars);
      return;
    }
    setHint(undefined);
    submit.mutate(
      {
        id: requestId,
        stars: parsed.data.stars,
        tags: parsed.data.tags,
        comment: parsed.data.comment,
      },
      {
        onError: (error) => {
          if (!(error instanceof ApiError)) return;
          // Rated meanwhile, or the window closed: the refetch hides the card.
          if (error.status === 409) void rating.refetch();
          else if (error.issues.some((issue) => issue.path[0] === 'tags')) setHint(t.tagsRequired);
        },
      },
    );
  };

  const conflict = submit.error instanceof ApiError && submit.error.status === 409;
  return (
    <Card>
      <Text variant="heading">{title}</Text>
      <StarRatingInput
        value={stars}
        onChange={(n) => {
          setStars(n);
          setHint(undefined);
        }}
        disabled={submit.isPending}
      />
      <Text tone="muted">{t.tagsLabel}</Text>
      <View style={styles.chips}>
        {Object.entries(labels).map(([tag, label]) => {
          const selected = tags.includes(tag);
          return (
            <Pressable
              key={tag}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              disabled={submit.isPending}
              onPress={() => toggle(tag)}
              style={[
                styles.chip,
                {
                  borderRadius: theme.radius.full,
                  borderColor: selected ? theme.color.brandAccent : theme.color.line,
                  backgroundColor: selected ? theme.color.brandTint : 'transparent',
                },
              ]}
            >
              <Text variant={selected ? 'label' : 'caption'} style={styles.chipLabel}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextField
        label={t.commentLabel}
        value={comment}
        onChangeText={setComment}
        maxLength={MAX_RATING_COMMENT_LENGTH}
        multiline
        editable={!submit.isPending}
      />
      <Text variant="caption" tone="muted" style={styles.counter}>
        {t.commentCounter(comment.length, MAX_RATING_COMMENT_LENGTH)}
      </Text>
      {hint ? <Text tone="danger">{hint}</Text> : null}
      {submit.isError && !hint && !conflict ? <Text tone="danger">{t.ratingFailed}</Text> : null}
      <Button title={t.sendRating} loading={submit.isPending} onPress={onSend} />
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1 },
  chipLabel: { fontSize: 14 },
  counter: { alignSelf: 'flex-end' },
});
