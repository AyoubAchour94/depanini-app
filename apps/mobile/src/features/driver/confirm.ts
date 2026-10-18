import { Alert, Platform } from 'react-native';

import { driverStrings as t } from './strings';

/** Asks whether to cancel the job the driver has taken. Resolves true to cancel it. */
export function confirmCancelJob(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${t.cancelJobTitle}\n${t.cancelJobMessage}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      t.cancelJobTitle,
      t.cancelJobMessage,
      [
        { text: t.keepJob, style: 'cancel', onPress: () => resolve(false) },
        { text: t.cancelJob, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
