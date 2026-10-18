import { type WsServerMessage, wsServerMessageSchema } from '@depanini/shared';

import type { RealtimeStatus } from './status';

/** Waits between reconnects after a socket closes without having been authenticated; the last one repeats. */
export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
/** The API closes a socket with this code when a newer one of the same user took its place. */
const EVICTED = 4000;
/** The token was refused, or it expired while the socket was open. */
const UNAUTHORIZED = 4401;
/** Do not fight a newer socket (another tab or device) for the connection. */
const EVICTED_WAIT_MS = 30_000;

/** `http(s)://host` becomes `ws(s)://host/ws`. */
export function toWsUrl(apiUrl: string): string {
  const url = new URL('/ws', apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

type SocketLike = Pick<WebSocket, 'send' | 'close'> & {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
};

interface RealtimeClientOptions {
  url: string;
  /** A fresh ID token; `undefined` when nobody is signed in. */
  getToken: () => Promise<string | undefined>;
  onMessage: (message: WsServerMessage) => void;
  onStatus: (status: RealtimeStatus) => void;
  /** Injected by tests; the platform's `WebSocket` otherwise. */
  WebSocketImpl?: new (url: string) => SocketLike;
}

/**
 * One authenticated `/ws` connection that keeps itself up: it reconnects with
 * backoff, gets a fresh token each time, and can be paused while the app is in
 * the background. Events sent while it was away are lost, so the owner
 * refetches on `live` (see `RealtimeProvider`).
 */
export class RealtimeClient {
  private socket: SocketLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped on every connect and teardown, so late callbacks of an old attempt do nothing. */
  private run = 0;
  private attempt = 0;
  private started = false;
  private active = true;

  constructor(private readonly options: RealtimeClientOptions) {}

  start() {
    this.started = true;
    this.connect();
  }

  stop() {
    this.started = false;
    this.teardown();
  }

  /** False while the app is in the background: the socket closes and stays closed. */
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!this.started) return;
    if (active) this.connect();
    else this.teardown();
  }

  private teardown() {
    this.run += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close(1000);
    }
    this.options.onStatus('reconnecting');
  }

  private connect() {
    this.teardown();
    if (!this.started || !this.active) return;
    const run = this.run;
    void this.options.getToken().then(
      (token) => {
        if (run !== this.run) return;
        if (!token) return this.schedule(this.backoff());
        this.open(token, run);
      },
      () => {
        if (run === this.run) this.schedule(this.backoff());
      },
    );
  }

  private open(token: string, run: number) {
    const Socket = this.options.WebSocketImpl ?? (WebSocket as unknown as new () => SocketLike);
    const socket = new Socket(this.options.url);
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token }));
    socket.onmessage = (event) => {
      if (run !== this.run || typeof event.data !== 'string') return;
      let parsed;
      try {
        parsed = wsServerMessageSchema.safeParse(JSON.parse(event.data));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.type === 'auth.ok') {
        this.attempt = 0;
        this.options.onStatus('live');
      } else if (message.type !== 'auth.error') {
        this.options.onMessage(message);
      }
    };
    // An error is always followed by a close, which does the reconnecting.
    socket.onerror = () => {};
    socket.onclose = (event) => {
      if (run !== this.run) return;
      this.socket = null;
      this.options.onStatus('reconnecting');
      if (event.code === EVICTED) return this.schedule(EVICTED_WAIT_MS);
      // An expired token is the normal end of a socket; the first retry gets a new one at once.
      this.schedule(event.code === UNAUTHORIZED && this.attempt === 0 ? 0 : this.backoff());
    };
  }

  private backoff(): number {
    const wait = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
    this.attempt += 1;
    return wait;
  }

  private schedule(wait: number) {
    if (this.timer) clearTimeout(this.timer);
    if (wait === 0) return this.connect();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, wait);
  }
}
