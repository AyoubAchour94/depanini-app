import { Logger } from '@nestjs/common';

import type { PushMessage, PushSender } from './push-sender.js';

/** A push the log sender "delivered". */
export interface LoggedPush extends PushMessage {
  token: string;
  sentAt: string;
}

/** How many pushes the log sender remembers; the oldest are dropped first. */
export const LOG_INBOX_SIZE = 200;

/**
 * The default sender (dev, CI): logs each push and keeps the last {@link LOG_INBOX_SIZE} in
 * memory, which `GET /dev/push-inbox` reads when `PUSH_INBOX=1`. Sends nothing anywhere.
 */
export class LogPushSender implements PushSender {
  private readonly logger = new Logger('Push');
  private readonly sent: LoggedPush[] = [];

  async send(tokens: string[], message: PushMessage): Promise<void> {
    this.logger.log(
      `${message.data.kind} for request ${message.data.requestId} to ${tokens.length} device(s): ${message.title}`,
    );
    const sentAt = new Date().toISOString();
    for (const token of tokens) this.sent.push({ token, sentAt, ...message });
    this.sent.splice(0, this.sent.length - LOG_INBOX_SIZE);
  }

  /** The remembered pushes to any of these tokens, oldest first. */
  forTokens(tokens: string[]): LoggedPush[] {
    return this.sent.filter((push) => tokens.includes(push.token));
  }

  clear(): void {
    this.sent.length = 0;
  }
}
