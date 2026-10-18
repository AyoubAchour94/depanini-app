import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MapScreen } from '@/features/map/MapScreen';
import { Button } from '@/ui/Button';

import { useRequestFlow } from './RequestFlowContext';
import { requestStrings as t } from './strings';

/** The customer app's home: the map, and the way into a tow request. */
export function CustomerHome() {
  const { reset } = useRequestFlow();
  return (
    <MapScreen>
      <View style={styles.action}>
        <Button
          title={t.requestTow}
          onPress={() => {
            // Every request starts from scratch.
            reset();
            router.push('/request/pickup');
          }}
        />
      </View>
    </MapScreen>
  );
}

const styles = StyleSheet.create({
  action: { position: 'absolute', left: 16, right: 16, bottom: 24 },
});
