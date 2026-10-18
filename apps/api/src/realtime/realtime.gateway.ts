import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type OnGatewayConnection, type OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import {
  type WsClientMessage,
  wsClientMessageSchema,
  type WsServerMessage,
} from '@depanini/shared';
import type { RawData, WebSocket, WebSocketServer } from 'ws';

import { AccountsService } from '../accounts/accounts.service.js';
import { ID_TOKEN_VERIFIER, type IdTokenVerifier } from '../auth/firebase-auth.guard.js';
import { RealtimeService } from './realtime.service.js';

/** Timers of the `/ws` endpoint; tests shorten them. */
export interface RealtimeOptions {
  /** How long a new socket has to authenticate before it is closed. */
  authTimeoutMs: number;
  /** How often sockets are pinged; one that has not answered the previous ping is dropped. */
  heartbeatMs: number;
}

export const DEFAULT_REALTIME_OPTIONS: RealtimeOptions = {
  authTimeoutMs: 10_000,
  heartbeatMs: 30_000,
};

/** Injection token for the {@link RealtimeOptions}. */
export const REALTIME_OPTIONS = Symbol('REALTIME_OPTIONS');

/** Close codes (4000–4999 are the application's own). */
export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_AUTH_TIMEOUT = 4408;
const CLOSE_INTERNAL_ERROR = 1011;

/** An ID token is a JWT of a kilobyte or so; nothing a client sends needs more. */
const MAX_PAYLOAD_BYTES = 16 * 1024;

/** The longest delay `setTimeout` takes (about 24.8 days); Firebase tokens live an hour. */
const MAX_TIMER_MS = 2 ** 31 - 1;

class InvalidTokenError extends Error {}

/**
 * `/ws`: server-to-client events for the people involved in a trip (see `docs/realtime.md`).
 *
 * The first message must be `{type:'auth', token}` with a Firebase ID token, checked by
 * the same verifier as `FirebaseAuthGuard`. Anything else before it is ignored. A socket
 * that has not authenticated within `authTimeoutMs` is closed (4408); a bad token gets
 * `auth.error` and a close (4401). Once in, the socket only receives: further messages
 * are ignored, and it is closed (4401) when its token expires, so the app reconnects
 * with a fresh one.
 */
@WebSocketGateway({ path: '/ws', maxPayload: MAX_PAYLOAD_BYTES })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  /** Sockets that answered the last ping (or are new since). */
  private readonly alive = new WeakSet<WebSocket>();
  private heartbeat?: NodeJS.Timeout;

  constructor(
    @Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier,
    @Inject(REALTIME_OPTIONS) private readonly options: RealtimeOptions,
    private readonly accounts: AccountsService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: WebSocketServer): void {
    this.heartbeat = setInterval(() => {
      for (const socket of server.clients) {
        if (!this.alive.has(socket)) {
          socket.terminate();
          continue;
        }
        this.alive.delete(socket);
        socket.ping();
      }
    }, this.options.heartbeatMs);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
  }

  handleConnection(socket: WebSocket): void {
    this.alive.add(socket);
    socket.on('pong', () => this.alive.add(socket));

    let state: 'waiting' | 'verifying' | 'ready' = 'waiting';
    let userId: string | undefined;
    let timer = setTimeout(
      () => socket.close(CLOSE_AUTH_TIMEOUT, 'Authentication timed out'),
      this.options.authTimeoutMs,
    );
    socket.on('close', () => {
      clearTimeout(timer);
      if (userId) this.realtime.remove(userId, socket);
    });

    socket.on('message', (data) => {
      if (state !== 'waiting') return;
      const message = parseClientMessage(data);
      if (!message) return;
      state = 'verifying';
      this.authenticate(message.token).then(
        ({ accountId, expiresAt }) => {
          if (socket.readyState !== socket.OPEN) return;
          clearTimeout(timer);
          state = 'ready';
          userId = accountId;
          this.realtime.add(accountId, socket);
          send(socket, { type: 'auth.ok' });
          timer = setTimeout(
            () => socket.close(CLOSE_UNAUTHORIZED, 'Token expired'),
            Math.min(Math.max(0, expiresAt - Date.now()), MAX_TIMER_MS),
          );
        },
        (error: unknown) => {
          if (error instanceof InvalidTokenError) {
            send(socket, { type: 'auth.error', message: 'Invalid or expired token' });
            socket.close(CLOSE_UNAUTHORIZED, 'Unauthorized');
            return;
          }
          this.logger.error(`Could not authenticate a socket: ${(error as Error).message}`);
          socket.close(CLOSE_INTERNAL_ERROR, 'Internal error');
        },
      );
    });
  }

  /** The account behind a valid ID token, created on first sign-in as over REST. */
  private async authenticate(token: string): Promise<{ accountId: string; expiresAt: number }> {
    let decoded;
    try {
      decoded = await this.verifier.verifyIdToken(token);
    } catch {
      throw new InvalidTokenError();
    }
    // Firebase always sets `exp`; without it the socket would never be re-checked.
    if (typeof decoded.exp !== 'number') throw new InvalidTokenError();
    const account = await this.accounts.getOrCreate({
      firebaseUid: decoded.uid,
      email: decoded.email,
    });
    return { accountId: account.id, expiresAt: decoded.exp * 1000 };
  }
}

function parseClientMessage(data: RawData): WsClientMessage | null {
  try {
    const parsed = wsClientMessageSchema.safeParse(JSON.parse(data.toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function send(socket: WebSocket, message: WsServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}
