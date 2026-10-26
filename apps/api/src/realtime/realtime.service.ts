import { Injectable } from '@nestjs/common';
import type { WsServerMessage } from '@depanini/shared';
import type { WebSocket } from 'ws';

/** The slice of a `ws` socket the registry uses; easy to fake in tests. */
export type RealtimeSocket = Pick<WebSocket, 'send' | 'close' | 'readyState' | 'OPEN'>;

/** Most sockets one user may have open; a sixth replaces the oldest. */
export const MAX_SOCKETS_PER_USER = 5;

/** Close code for a socket pushed out by newer ones (4000–4999 are the application's own). */
export const CLOSE_TOO_MANY_SOCKETS = 4000;

/**
 * The authenticated `/ws` sockets of this API instance, by user id (one user may
 * have several, e.g. a phone and a browser).
 *
 * The registry is in memory and only holds this instance's sockets: events reach the
 * other instances' sockets through the `EventBus` (see `TripEvents`, `docs/realtime.md`).
 */
@Injectable()
export class RealtimeService {
  private readonly sockets = new Map<string, Set<RealtimeSocket>>();

  /** Adds a socket; past {@link MAX_SOCKETS_PER_USER} the oldest is closed (4000). */
  add(userId: string, socket: RealtimeSocket): void {
    const sockets = this.sockets.get(userId) ?? new Set();
    while (sockets.size >= MAX_SOCKETS_PER_USER) {
      const [oldest] = sockets;
      sockets.delete(oldest);
      oldest.close(CLOSE_TOO_MANY_SOCKETS, 'Too many connections');
    }
    sockets.add(socket);
    this.sockets.set(userId, sockets);
  }

  remove(userId: string, socket: RealtimeSocket): void {
    const sockets = this.sockets.get(userId);
    sockets?.delete(socket);
    if (sockets?.size === 0) this.sockets.delete(userId);
  }

  /** Whether the user has a socket here; lets publishers skip building payloads nobody gets. */
  isConnected(userId: string): boolean {
    return this.sockets.has(userId);
  }

  /** Whether anyone has a socket here; with none, an event needs no reading at all. */
  hasSockets(): boolean {
    return this.sockets.size > 0;
  }

  /** Sends to every open socket of the user; nothing if there is none. */
  send(userId: string, message: WsServerMessage): void {
    const sockets = this.sockets.get(userId);
    if (!sockets) return;
    const frame = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(frame);
    }
  }
}
