import { isInTunisia, type LatLng, type Place } from '@depanini/shared';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { env } from '@/config/env';
import { CenterPin } from '@/features/map/CenterPin';
import { MissingTokenView } from '@/features/map/MapScreen';
import { TunisMap } from '@/features/map/TunisMap';
import { useReverseGeocode, useSearchPlaces } from '@/features/places/hooks';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

import { requestStrings as t } from './strings';

const formatCoordinates = ({ latitude, longitude }: LatLng) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

interface DropoffStepProps {
  /** Where the vehicle is; results are ranked by closeness to it and the map starts there. */
  pickup: Place;
  /** The drop-off chosen earlier, if the customer came back to this step. */
  initial?: Place | null;
  onConfirm: (dropoff: Place) => void;
}

/**
 * Second step of a tow request: the customer searches for the drop-off or
 * drops a pin on the map. `onConfirm` receives the {@link Place}.
 */
export function DropoffStep({ pickup, initial, onConfirm }: DropoffStepProps) {
  const [onMap, setOnMap] = useState(false);
  return onMap ? (
    <MapPicker start={initial ?? pickup} onConfirm={onConfirm} onBack={() => setOnMap(false)} />
  ) : (
    <SearchPicker
      pickup={pickup}
      initialQuery={initial?.address ?? ''}
      onSelect={onConfirm}
      onPickOnMap={() => setOnMap(true)}
    />
  );
}

function SearchPicker({
  pickup,
  initialQuery,
  onSelect,
  onPickOnMap,
}: {
  pickup: Place;
  initialQuery: string;
  onSelect: (place: Place) => void;
  onPickOnMap: () => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const search = useSearchPlaces(query, pickup);
  const results = (search.data ?? []).filter(isInTunisia);
  const searching = query.trim().length >= 2;

  return (
    <ScrollView
      contentContainerStyle={styles.form}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.background }}
    >
      <TextField
        label={t.dropoffLabel}
        placeholder={t.dropoffPlaceholder}
        value={query}
        onChangeText={setQuery}
        autoFocus
      />
      {!env.mapboxAccessToken ? (
        <Text style={[styles.note, { color: theme.textMuted }]}>{t.searchUnavailable}</Text>
      ) : searching && search.isError ? (
        <Text style={[styles.note, { color: theme.danger }]}>{t.searchFailed}</Text>
      ) : searching && (search.isFetching || search.isPending) ? (
        <ActivityIndicator color={theme.brand} />
      ) : searching && results.length === 0 ? (
        <Text style={[styles.note, { color: theme.textMuted }]}>{t.noResults}</Text>
      ) : (
        results.map((place) => (
          <Pressable
            key={`${place.latitude},${place.longitude},${place.address}`}
            accessibilityRole="button"
            accessibilityLabel={place.address}
            onPress={() => onSelect(place)}
            style={[styles.result, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.resultText, { color: theme.text }]}>{place.address}</Text>
          </Pressable>
        ))
      )}
      <Button kind="link" title={t.pickOnMap} onPress={onPickOnMap} />
    </ScrollView>
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
  const theme = useTheme();
  const [startCenter] = useState<LatLng>({ latitude: start.latitude, longitude: start.longitude });
  // The coordinate under the pin; the start point until the map has settled.
  const [picked, setPicked] = useState<LatLng | null>(null);
  const pin = picked ?? startCenter;
  const reverse = useReverseGeocode(pin);

  const insideTunisia = isInTunisia(pin);
  const settled = !env.mapboxAccessToken || !reverse.isFetching;
  const address = reverse.data?.address ?? formatCoordinates(pin);

  return (
    <View style={styles.fill}>
      {env.mapboxAccessToken ? (
        <>
          <TunisMap
            accessToken={env.mapboxAccessToken}
            center={startCenter}
            onCenterChange={setPicked}
          />
          <CenterPin />
        </>
      ) : (
        <MissingTokenView />
      )}
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{t.dropoffPointLabel}</Text>
        {!settled ? (
          <Text style={[styles.address, { color: theme.textMuted }]}>{t.findingAddress}</Text>
        ) : (
          <Text style={[styles.address, { color: theme.text }]}>{address}</Text>
        )}
        {settled && !reverse.data && env.mapboxAccessToken && insideTunisia ? (
          <Text style={[styles.note, { color: theme.textMuted }]}>{t.addressUnavailable}</Text>
        ) : null}
        {!insideTunisia ? (
          <Text style={[styles.note, { color: theme.danger }]}>{t.outsideTunisia}</Text>
        ) : null}
        <Button
          title={t.confirmDropoff}
          disabled={!insideTunisia || !settled}
          onPress={() => onConfirm({ ...pin, address })}
        />
        <Button kind="link" title={t.backToSearch} onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { padding: 16, gap: 12 },
  result: { borderRadius: 10, padding: 14 },
  resultText: { fontSize: 16 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  label: { fontSize: 13 },
  address: { fontSize: 17, fontWeight: '600' },
  note: { fontSize: 14 },
});
