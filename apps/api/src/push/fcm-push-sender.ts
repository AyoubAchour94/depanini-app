import type { PushData, PushKind } from '@depanini/shared';
import { Logger } from '@nestjs/common';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';

import type { PushMessage, PushSender } from './push-sender.js';

/** The slice of firebase-admin's `Messaging` the sender uses; easy to fake in tests. */
export interface MessagingClient {
  sendEachForMulticast(message: MulticastMessage): Promise<BatchResponse>;
}

/** The Android notification channel the apps create. */
export const ANDROID_CHANNEL_ID = 'default';

/** FCM errors that mean the token is dead for good: the app was uninstalled or the token rotated. */
const DEAD_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

/** Trip and offer pushes should arrive at once; the rest may wait for the phone to wake. */
const NORMAL_PRIORITY: PushKind[] = ['payment_answered'];

/** FCM `data` values must all be strings. */
function stringData(data: PushData): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

/** Sends pushes through Firebase Cloud Messaging; tokens FCM calls dead are handed to `onDeadTokens`. */
export class FcmPushSender implements PushSender {
  private readonly logger = new Logger('Push');

  constructor(
    private readonly messaging: MessagingClient,
    private readonly onDeadTokens: (tokens: string[]) => Promise<void>,
  ) {}

  async send(tokens: string[], { title, body, data, collapseKey }: PushMessage): Promise<void> {
    if (tokens.length === 0) return;
    const high = !NORMAL_PRIORITY.includes(data.kind);
    const response = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringData(data),
      android: {
        priority: high ? 'high' : 'normal',
        collapseKey,
        notification: { channelId: ANDROID_CHANNEL_ID },
      },
      apns: {
        headers: { 'apns-collapse-id': collapseKey, 'apns-priority': high ? '10' : '5' },
        payload: { aps: { sound: 'default' } },
      },
    });

    const dead = tokens.filter((_, index) => {
      const code = response.responses[index]?.error?.code;
      return code !== undefined && DEAD_TOKEN_ERRORS.has(code);
    });
    if (dead.length > 0) await this.onDeadTokens(dead);
    const failed = response.failureCount - dead.length;
    if (failed > 0) this.logger.warn(`${failed} push(es) of ${data.kind} could not be delivered`);
  }
}
