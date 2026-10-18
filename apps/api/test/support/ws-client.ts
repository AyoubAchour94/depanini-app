import { type WsServerMessage, wsServerMessageSchema } from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';

type MessageOf<T extends WsServerMessage['type']> = Extract<WsServerMessage, { type: T }>;

/** A real `ws` client on the test app's `/ws`, collecting what the server sends. */
export interface TestSocket {
  readonly socket: WebSocket;
  /** Every message received and not yet taken by {@link next}, oldest first. */
  readonly inbox: WsServerMessage[];
  /** Frames that did not parse with `wsServerMessageSchema`. Should stay empty. */
  readonly invalid: unknown[];
  /** Resolves when the server closes the socket. */
  readonly closed: Promise<{ code: number; reason: string }>;
  /** Takes the oldest message of `type`, waiting up to `timeoutMs` for one to arrive. */
  next<T extends WsServerMessage['type']>(type: T, timeoutMs?: number): Promise<MessageOf<T>>;
  send(message: unknown): void;
  close(): void;
}

/** The `ws://` URL of a listening app's `/ws` endpoint. */
export function wsUrl(app: NestFastifyApplication): string {
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `ws://127.0.0.1:${port}/ws`;
}

/** Opens a socket without authenticating. */
export async function openSocket(
  app: NestFastifyApplication,
  options: WebSocket.ClientOptions = {},
): Promise<TestSocket> {
  const socket = new WebSocket(wsUrl(app), options);
  const inbox: WsServerMessage[] = [];
  const invalid: unknown[] = [];
  const waiters = new Set<() => void>();

  socket.on('message', (data) => {
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      invalid.push(String(data));
      return;
    }
    const parsed = wsServerMessageSchema.safeParse(json);
    if (!parsed.success) {
      invalid.push(json);
      return;
    }
    // Keep the frame as sent, not as parsed: zod would strip keys the schema does not know.
    inbox.push(json as WsServerMessage);
    for (const wake of waiters) wake();
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.on('close', (code, reason) => resolve({ code, reason: String(reason) })),
  );
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  const take = <T extends WsServerMessage['type']>(type: T) => {
    const index = inbox.findIndex((message) => message.type === type);
    return index === -1 ? undefined : (inbox.splice(index, 1)[0] as MessageOf<T>);
  };

  return {
    socket,
    inbox,
    invalid,
    closed,
    next: (type, timeoutMs = 2000) =>
      new Promise((resolve, reject) => {
        const found = take(type);
        if (found) return resolve(found);
        const wake = () => {
          const message = take(type);
          if (!message) return;
          waiters.delete(wake);
          clearTimeout(timer);
          resolve(message);
        };
        const timer = setTimeout(() => {
          waiters.delete(wake);
          reject(new Error(`No ${type} within ${timeoutMs} ms`));
        }, timeoutMs);
        waiters.add(wake);
      }),
    send: (message) => socket.send(JSON.stringify(message)),
    close: () => socket.close(),
  };
}

/** Opens a socket and authenticates it with `token`, waiting for `auth.ok`. */
export async function connectAs(app: NestFastifyApplication, token: string): Promise<TestSocket> {
  const client = await openSocket(app);
  client.send({ type: 'auth', token });
  await client.next('auth.ok');
  return client;
}
