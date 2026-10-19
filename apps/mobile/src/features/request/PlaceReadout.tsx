import type { ReactNode } from 'react';
import { View } from 'react-native';

import { shortAddress } from '@/features/places/address';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/Text';

import { requestStrings as t } from './strings';

interface PlaceReadoutProps {
  /** What the pin stands for ("Pickup point"). */
  label: string;
  /** The address under the pin; shown shortened. */
  address: string;
  /** The address is still being looked up. */
  finding: boolean;
  /** Notes under the address (a warning, a hint). */
  children?: ReactNode;
}

/** The sheet content of a pin-on-the-map step: what the pin is, and the address under it. */
export function PlaceReadout({ label, address, finding, children }: PlaceReadoutProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      {finding ? (
        <Text variant="heading" tone="muted">
          {t.findingAddress}
        </Text>
      ) : (
        <Text variant="heading">{shortAddress(address)}</Text>
      )}
      {children}
    </View>
  );
}
