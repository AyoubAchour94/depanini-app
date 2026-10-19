import { isInTunisia, type LatLng, type Place } from '@depanini/shared';
import { useContext, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { env } from '@/config/env';
import { BackButton } from '@/features/map/controls';
import { MapScreen } from '@/features/map/MapScreen';
import { shortAddress } from '@/features/places/address';
import { NEARBY_RADIUS_KM } from '@/features/places/geocoding';
import { useReverseGeocode, useSearchPlaces } from '@/features/places/hooks';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

import { PlaceReadout } from './PlaceReadout';
import { requestStrings as t } from './strings';

/** Snap points of the pin sheet: the address, a notice and the pinned action fit at the first. */
const PIN_SNAPS = [260] as const;

const formatCoordinates = ({ latitude, longitude }: LatLng) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

interface DropoffStepProps {
  /** Where the vehicle is; results are ranked by closeness to it and the map starts there. */
  pickup: Place;
  /** The drop-off chosen earlier, if the customer came back to this step. */
  initial?: Place | null;
  onConfirm: (dropoff: Place) => void;
  /** Leaves the step; the back button of the search shows only when given. */
  onBack?: () => void;
}

/**
 * Second step of a tow request: the customer searches for the drop-off or
 * drops a pin on the map. `onConfirm` receives the {@link Place}.
 */
export function DropoffStep({ pickup, initial, onConfirm, onBack }: DropoffStepProps) {
  const [onMap, setOnMap] = useState(false);
  return onMap ? (
    <MapPicker start={initial ?? pickup} onConfirm={onConfirm} onBack={() => setOnMap(false)} />
  ) : (
    <SearchPicker
      pickup={pickup}
      initialQuery={initial?.address ?? ''}
      onSelect={onConfirm}
      onPickOnMap={() => setOnMap(true)}
      onBack={onBack}
    />
  );
}

function SearchPicker({
  pickup,
  initialQuery,
  onSelect,
  onPickOnMap,
  onBack,
}: {
  pickup: Place;
  initialQuery: string;
  onSelect: (place: Place) => void;
  onPickOnMap: () => void;
  onBack?: () => void;
}) {
  const theme = useTheme();
  const insets = useContext(SafeAreaInsetsContext);
  const [query, setQuery] = useState(initialQuery);
  const search = useSearchPlaces(query, pickup);
  const results = (search.data ?? []).filter(({ place }) => isInTunisia(place));
  const searching = query.trim().length >= 2;

  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: theme.color.background,
          paddingTop: (insets?.top ?? 0) + theme.space[3],
          paddingHorizontal: theme.space[4],
          gap: theme.space[4],
        },
      ]}
    >
      {onBack ? (
        <View style={styles.top}>
          <BackButton onPress={onBack} />
        </View>
      ) : null}
      <TextField
        label={t.dropoffLabel}
        placeholder={t.dropoffPlaceholder}
        value={query}
        onChangeText={setQuery}
        autoFocus
      />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{
          gap: theme.space[2],
          paddingBottom: Math.max(insets?.bottom ?? 0, theme.space[4]),
        }}
        keyboardShouldPersistTaps="handled"
      >
        {!env.mapboxAccessToken ? (
          <Text tone="muted">{t.searchUnavailable}</Text>
        ) : searching && search.isError ? (
          <Text tone="danger">{t.searchFailed}</Text>
        ) : searching && (search.isFetching || search.isPending) ? (
          <ActivityIndicator color={theme.color.brandAccent} />
        ) : searching && results.length === 0 ? (
          <Text tone="muted">{t.noResults}</Text>
        ) : (
          results.map(({ place, secondary, distanceKm }) => (
            <Pressable
              key={`${place.latitude},${place.longitude},${place.address}`}
              accessibilityRole="button"
              accessibilityLabel={shortAddress(place.address)}
              onPress={() => onSelect(place)}
              style={[
                styles.result,
                { backgroundColor: theme.color.surface, borderRadius: theme.radius.md },
              ]}
            >
              <Text variant="bodyStrong">{shortAddress(place.address)}</Text>
              {secondary && !place.address.includes(secondary) ? (
                <Text variant="caption" tone="muted">
                  {shortAddress(secondary)}
                </Text>
              ) : null}
              {distanceKm !== undefined && distanceKm > NEARBY_RADIUS_KM ? (
                <Text variant="caption" tone="muted">
                  {t.kmAway(distanceKm)}
                </Text>
              ) : null}
            </Pressable>
          ))
        )}
        <Button kind="secondary" title={t.pickOnMap} onPress={onPickOnMap} />
      </ScrollView>
    </View>
  );
}

function MapPicker({
  start,
  onConfirm,
  onBack,
}: {
  start: LatLng;
  onConfirm: (place: Place) => void;
  onBack: () => void;
}) {
  const [startCenter] = useState<LatLng>({ latitude: start.latitude, longitude: start.longitude });
  // The coordinate under the pin; the start point until the map has settled.
  const [picked, setPicked] = useState<LatLng | null>(null);
  const pin = picked ?? startCenter;
  const reverse = useReverseGeocode(pin);

  const insideTunisia = isInTunisia(pin);
  const settled = !env.mapboxAccessToken || !reverse.isFetching;
  const address = reverse.data?.address ?? formatCoordinates(pin);

  return (
    <MapScreen
      center={startCenter}
      onCenterChange={setPicked}
      topStart={<BackButton onPress={onBack} />}
      sheet={{
        snapPoints: PIN_SNAPS,
        children: (
          <PlaceReadout label={t.dropoffPointLabel} address={address} finding={!settled}>
            {settled && !reverse.data && env.mapboxAccessToken && insideTunisia ? (
              <Text variant="caption" tone="muted">
                {t.addressUnavailable}
              </Text>
            ) : null}
            {!insideTunisia ? (
              <Text variant="caption" tone="danger">
                {t.outsideTunisia}
              </Text>
            ) : null}
          </PlaceReadout>
        ),
        footer: (
          <Button
            size="big"
            title={t.confirmDropoff}
            disabled={!insideTunisia || !settled}
            onPress={() => onConfirm({ ...pin, address })}
          />
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: 'row' },
  result: { padding: 14, gap: 2 },
});
