import type { PushData } from '@depanini/shared';

/** What one push says. `data` is what the app reads to open the right screen. */
export interface PushMessage {
  title: string;
  body: string;
  data: PushData;
  /** A newer push with the same key replaces the older one the device has not shown yet. */
  collapseKey: string;
}

/** Delivers a push to the devices behind these tokens. Throws when delivery fails. */
export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<void>;
}

/** Injection token for the configured {@link PushSender}. */
export const PUSH_SENDER = Symbol('PUSH_SENDER');
