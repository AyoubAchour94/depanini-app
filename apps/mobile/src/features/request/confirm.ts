import { Alert, Platform } from 'react-native';

import { requestStrings as t } from './strings';

/** Asks a yes/no question about something destructive. Resolves true to go ahead. */
function confirmDestructive(
  title: string,
  message: string,
  keepLabel: string,
  goLabel: string,
  goStyle: 'default' | 'destructive' = 'destructive',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: keepLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: goLabel, style: goStyle, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Asks whether to throw the half-entered request away. Resolves true to discard. */
export function confirmDiscard(): Promise<boolean> {
  return confirmDestructive(t.discardTitle, t.discardMessage, t.keepEditing, t.discard);
}

/** Asks whether to take a driver's offer, showing the fare. Resolves true to accept. */
export function confirmAccept(driverName: string, fare: number): Promise<boolean> {
  return confirmDestructive(
    t.acceptTitle,
    t.acceptMessage(driverName, fare),
    t.notNow,
    t.accept,
    'default',
  );
}

/** Asks whether to cancel the request. Resolves true to cancel it. */
export function confirmCancel(): Promise<boolean> {
  return confirmDestructive(t.cancelTitle, t.cancelMessage, t.keepRequest, t.cancelRequest);
}
