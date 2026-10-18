import { Alert, Platform } from 'react-native';

import { requestStrings as t } from './strings';

/** Asks whether to throw the half-entered request away. Resolves true to discard. */
export function confirmDiscard(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${t.discardTitle}\n${t.discardMessage}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      t.discardTitle,
      t.discardMessage,
      [
        { text: t.keepEditing, style: 'cancel', onPress: () => resolve(false) },
        { text: t.discard, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
