import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { deleteDevice, putDevice } from '@/api/devices';

import {
  configurePush,
  registerForPush,
  setPushUser,
  subscribePushTaps,
  unregisterPush,
  watchPushToken,
} from '.';

jest.mock('@/api/devices', () => ({
  putDevice: jest.fn(async () => undefined),
  deleteDevice: jest.fn(async () => undefined),
}));

const notifications = jest.mocked(Notifications);
const device = Device as { isDevice: boolean };
const put = jest.mocked(putDevice);
const del = jest.mocked(deleteDevice);

// The module remembers users and tokens, so every test signs in as someone new.
let counter = 0;
function signIn() {
  const uid = `uid-${++counter}`;
  setPushUser(uid);
  return uid;
}

const granted = { granted: true, canAskAgain: true } as Notifications.NotificationPermissionsStatus;
const denied = { granted: false, canAskAgain: true } as Notifications.NotificationPermissionsStatus;
const token = (data: string) => ({ type: 'fcm', data }) as Notifications.DevicePushToken;

beforeEach(() => {
  jest.clearAllMocks();
  device.isDevice = true;
  notifications.getPermissionsAsync.mockResolvedValue(denied);
  notifications.requestPermissionsAsync.mockResolvedValue(denied);
  notifications.getDevicePushTokenAsync.mockResolvedValue(token('fcm-1'));
  notifications.getLastNotificationResponse.mockReturnValue(null);
});

describe('registerForPush', () => {
  it('asks for permission and registers the token', async () => {
    signIn();
    notifications.requestPermissionsAsync.mockResolvedValue(granted);

    await registerForPush();

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith({ token: 'fcm-1', platform: 'ios', appVariant: 'user' });
  });

  it('registers with the platform of the phone', async () => {
    signIn();
    notifications.getPermissionsAsync.mockResolvedValue(granted);
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      await registerForPush();
    } finally {
      Platform.OS = original;
    }
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ platform: 'android' }));
  });

  it('does not ask again when permission was already granted', async () => {
    signIn();
    notifications.getPermissionsAsync.mockResolvedValue(granted);

    await registerForPush();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('registers nothing when permission is denied', async () => {
    signIn();

    await registerForPush();

    expect(notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('only registers silently, without asking, when told not to prompt', async () => {
    signIn();
    await registerForPush({ prompt: false });
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();

    notifications.getPermissionsAsync.mockResolvedValue(granted);
    await registerForPush({ prompt: false });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('asks only once per user, however often it is triggered', async () => {
    signIn();
    await registerForPush();
    await registerForPush();
    expect(notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not ask when the OS no longer lets the app ask', async () => {
    signIn();
    notifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
    } as Notifications.NotificationPermissionsStatus);

    await registerForPush();

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('skips simulators', async () => {
    signIn();
    device.isDevice = false;

    await registerForPush();

    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('does nothing when nobody is signed in', async () => {
    setPushUser(null);
    await registerForPush();
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not send a token the API already has', async () => {
    signIn();
    notifications.getPermissionsAsync.mockResolvedValue(granted);
    await registerForPush({ prompt: false });
    await registerForPush({ prompt: false });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('never throws when the push service or the API fails', async () => {
    signIn();
    notifications.getPermissionsAsync.mockResolvedValue(granted);
    put.mockRejectedValueOnce(new Error('offline'));

    await expect(registerForPush({ prompt: false })).resolves.toBeUndefined();

    // Not remembered, so the next trigger sends it again.
    await registerForPush({ prompt: false });
    expect(put).toHaveBeenCalledTimes(2);
  });
});

describe('watchPushToken', () => {
  function listener() {
    const subscription = { remove: jest.fn() };
    notifications.addPushTokenListener.mockReturnValue(subscription);
    const stop = watchPushToken();
    const [callback] = notifications.addPushTokenListener.mock.calls[0]!;
    return { callback, stop, subscription };
  }
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('registers a refreshed token', async () => {
    signIn();
    notifications.getPermissionsAsync.mockResolvedValue(granted);
    const { callback, stop, subscription } = listener();

    callback(token('fcm-2'));
    await flush();

    expect(put).toHaveBeenCalledWith(expect.objectContaining({ token: 'fcm-2' }));
    stop();
    expect(subscription.remove).toHaveBeenCalled();
  });

  it('ignores a new token without permission or a signed-in user', async () => {
    signIn();
    const { callback } = listener();
    callback(token('fcm-3'));
    await flush();
    expect(put).not.toHaveBeenCalled();

    setPushUser(null);
    notifications.getPermissionsAsync.mockResolvedValue(granted);
    callback(token('fcm-3'));
    await flush();
    expect(put).not.toHaveBeenCalled();
  });
});

describe('unregisterPush', () => {
  it('deletes the token the user registered', async () => {
    signIn();
    notifications.getPermissionsAsync.mockResolvedValue(granted);
    await registerForPush({ prompt: false });

    await unregisterPush();

    expect(del).toHaveBeenCalledWith('fcm-1');
  });

  it('looks the token up when this run never registered one', async () => {
    signIn();
    notifications.getPermissionsAsync.mockResolvedValue(granted);
    notifications.getDevicePushTokenAsync.mockResolvedValue(token('fcm-old'));

    await unregisterPush();

    expect(del).toHaveBeenCalledWith('fcm-old');
  });

  it('does nothing without a token, and swallows failures', async () => {
    signIn();
    await unregisterPush();
    expect(del).not.toHaveBeenCalled();

    notifications.getPermissionsAsync.mockResolvedValue(granted);
    del.mockRejectedValueOnce(new Error('offline'));
    await expect(unregisterPush()).resolves.toBeUndefined();
  });

  it('gives up waiting for a slow API', async () => {
    jest.useFakeTimers();
    try {
      signIn();
      notifications.getPermissionsAsync.mockResolvedValue(granted);
      del.mockReturnValueOnce(new Promise(() => {}));
      const done = unregisterPush();
      await jest.advanceTimersByTimeAsync(3_100);
      await expect(done).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('configurePush', () => {
  it('shows pushes in the list only while the app is open', async () => {
    configurePush();
    const [{ handleNotification }] = notifications.setNotificationHandler.mock.calls[0]!.filter(
      Boolean,
    ) as [Notifications.NotificationHandler];
    await expect(handleNotification({} as Notifications.Notification)).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  it('creates the default channel on Android only', () => {
    configurePush();
    expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled();

    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      configurePush();
    } finally {
      Platform.OS = original;
    }
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ importance: 5 }),
    );
  });

  it('never asks for permission', () => {
    configurePush();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('subscribePushTaps', () => {
  const requestId = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
  const response = (identifier: string, data: unknown) =>
    ({
      notification: { request: { identifier, content: { data } } },
    }) as Notifications.NotificationResponse;
  const onTap = jest.fn();

  beforeEach(() => onTap.mockClear());

  it('reports a tap while the app is running', () => {
    subscribePushTaps(onTap);
    const [callback] = notifications.addNotificationResponseReceivedListener.mock.calls[0]!;

    callback(response('tap-1', { kind: 'offer_received', requestId }));

    expect(onTap).toHaveBeenCalledWith({ kind: 'offer_received', requestId });
  });

  it('reports the tap that opened the app from closed, once', () => {
    notifications.getLastNotificationResponse.mockReturnValue(
      response('cold-1', { kind: 'offer_accepted', requestId }),
    );

    subscribePushTaps(onTap);
    expect(onTap).toHaveBeenCalledWith({ kind: 'offer_accepted', requestId });

    // The listener may report the same notification again.
    const [callback] = notifications.addNotificationResponseReceivedListener.mock.calls[0]!;
    callback(response('cold-1', { kind: 'offer_accepted', requestId }));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('ignores data it does not understand', () => {
    subscribePushTaps(onTap);
    const [callback] = notifications.addNotificationResponseReceivedListener.mock.calls[0]!;

    callback(response('bad-1', { kind: 'unknown', requestId }));
    callback(response('bad-2', { kind: 'trip_stage', requestId: 'not-a-uuid' }));
    callback(response('bad-3', undefined));

    expect(onTap).not.toHaveBeenCalled();
  });

  it('stops listening when unsubscribed', () => {
    const subscription = { remove: jest.fn() };
    notifications.addNotificationResponseReceivedListener.mockReturnValue(subscription);

    subscribePushTaps(onTap)();

    expect(subscription.remove).toHaveBeenCalled();
  });
});
