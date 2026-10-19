import type { PushMessage } from './push-sender.js';
import { ANDROID_CHANNEL_ID, FcmPushSender, type MessagingClient } from './fcm-push-sender.js';

const requestId = '4a4cbd7c-6cb8-4a6a-8f4d-3a8d7b0cf2f1';
const offerId = '0d4d9a33-0a53-4d44-8a43-7ad2f3b6c1de';

const message: PushMessage = {
  title: 'New offer',
  body: 'A driver offered 40 TND.',
  data: { kind: 'offer_received', requestId, offerId },
  collapseKey: `offer:${requestId}`,
};

/** A messaging client whose per-token results are `errors` (a code, or null for success). */
function fakeMessaging(errors: (string | null)[]) {
  const sendEachForMulticast = vi.fn<MessagingClient['sendEachForMulticast']>(async () => ({
    successCount: errors.filter((code) => !code).length,
    failureCount: errors.filter(Boolean).length,
    responses: errors.map((code) =>
      code
        ? { success: false, error: { code, message: code } as never }
        : { success: true, messageId: 'm' },
    ),
  }));
  return { sendEachForMulticast };
}

describe('FcmPushSender', () => {
  it('maps the message to an FCM multicast with string data, the channel and a collapse key', async () => {
    const messaging = fakeMessaging([null, null]);
    await new FcmPushSender(messaging, async () => {}).send(['t1', 't2'], message);

    expect(messaging.sendEachForMulticast).toHaveBeenCalledOnce();
    const sent = messaging.sendEachForMulticast.mock.calls[0]![0];
    expect(sent.tokens).toEqual(['t1', 't2']);
    expect(sent.notification).toEqual({ title: 'New offer', body: 'A driver offered 40 TND.' });
    expect(sent.data).toEqual({ kind: 'offer_received', requestId, offerId });
    expect(sent.android).toEqual({
      priority: 'high',
      collapseKey: `offer:${requestId}`,
      notification: { channelId: ANDROID_CHANNEL_ID },
    });
    expect(ANDROID_CHANNEL_ID).toBe('default');
    expect(sent.apns?.headers).toMatchObject({ 'apns-collapse-id': `offer:${requestId}` });
  });

  it('leaves out data that is not set instead of sending "undefined"', async () => {
    const messaging = fakeMessaging([null]);
    await new FcmPushSender(messaging, async () => {}).send(['t1'], {
      ...message,
      data: { kind: 'trip_stage', requestId },
    });
    expect(messaging.sendEachForMulticast.mock.calls[0]![0].data).toEqual({
      kind: 'trip_stage',
      requestId,
    });
  });

  it('sends high priority for trip and offer pushes only', async () => {
    const messaging = fakeMessaging([null, null]);
    const sender = new FcmPushSender(messaging, async () => {});
    await sender.send(['t1'], { ...message, data: { kind: 'trip_stage', requestId } });
    await sender.send(['t1'], { ...message, data: { kind: 'payment_answered', requestId } });
    const [trip, payment] = messaging.sendEachForMulticast.mock.calls.map(([sent]) => sent);
    expect(trip!.android?.priority).toBe('high');
    expect(payment!.android?.priority).toBe('normal');
  });

  it('hands the tokens FCM reports as dead to the cleanup, and only those', async () => {
    const messaging = fakeMessaging([
      'messaging/registration-token-not-registered',
      null,
      'messaging/invalid-registration-token',
      'messaging/internal-error',
    ]);
    const onDeadTokens = vi.fn(async () => {});
    await new FcmPushSender(messaging, onDeadTokens).send(['gone', 'ok', 'bad', 'flaky'], message);
    expect(onDeadTokens).toHaveBeenCalledExactlyOnceWith(['gone', 'bad']);
  });

  it('keeps every token when FCM says the payload is invalid', async () => {
    const messaging = fakeMessaging(['messaging/invalid-argument', 'messaging/invalid-argument']);
    const onDeadTokens = vi.fn(async () => {});
    await new FcmPushSender(messaging, onDeadTokens).send(['t1', 't2'], message);
    expect(onDeadTokens).not.toHaveBeenCalled();
  });

  it('does not call the cleanup when every token is fine', async () => {
    const onDeadTokens = vi.fn(async () => {});
    await new FcmPushSender(fakeMessaging([null]), onDeadTokens).send(['t1'], message);
    expect(onDeadTokens).not.toHaveBeenCalled();
  });

  it('sends nothing without tokens, and lets a failed send throw', async () => {
    const messaging = fakeMessaging([]);
    await new FcmPushSender(messaging, async () => {}).send([], message);
    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();

    messaging.sendEachForMulticast.mockRejectedValueOnce(new Error('network down'));
    await expect(
      new FcmPushSender(messaging, async () => {}).send(['t1'], message),
    ).rejects.toThrow('network down');
  });
});
