import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MapScreen } from '@/features/map/MapScreen';
import { Button } from '@/ui/Button';

import { requestStrings as t } from './strings';

/** The customer app's home: the map, and the way into a tow request. */
export function CustomerHome() {
  return (
    <MapScreen>
      <View style={styles.action}>
        <Button title={t.requestTow} onPress={() => router.push('/request/pickup')} />
      </View>
    </MapScreen>
  );
}

const styles = StyleSheet.create({
  action: { position: 'absolute', left: 16, right: 16, bottom: 24 },
});
