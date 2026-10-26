import type { RatingSummary } from '@depanini/shared';
import { Text } from 'react-native';

import { useTheme } from '@/theme/theme';

import { useTripStrings } from './strings';

/**
 * "★ 4.7 (23)", or "New" while the API holds the average back (null). Nothing
 * when the payload carries no rating at all (an older API).
 */
export function RatingBadge({ rating }: { rating: RatingSummary | null | undefined }) {
  const t = useTripStrings();
  const theme = useTheme();
  if (!rating) return null;
  return (
    <Text style={{ color: theme.textMuted, fontWeight: '600' }}>
      {rating.average == null ? t.ratingNew : t.ratingBadge(rating.average, rating.count)}
    </Text>
  );
}
