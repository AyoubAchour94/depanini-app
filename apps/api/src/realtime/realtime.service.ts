import { Injectable } from '@nestjs/common';
import type { WsServerMessage } from '@depanini/shared';
import type { WebSocket } from 'ws';

/** The slice of a `ws` socket the registry uses; easy to fake in tests. */
export type RealtimeSocket = Pick<WebSocket, 'send' | 'readyState' | 'OPEN'>;

/**
 * The authenticated `/ws` sockets of this API instance, by user id (one user may
 * have several, e.g. a phone and a browser).
 *
 * Single instance only: the registry is in memory, so an event reaches the sockets
 * connected to the instance that published it. Running more than one instance needs
 * a pub/sub between them (Phase 9, with the production deploy). See `docs/realtime.md`.
 */
@Injectable()
export class RealtimeService {
  private readonly sockets = new Map<string, Set<RealtimeSocket>>();

  add(userId: string, socket: RealtimeSocket): void {
    const sockets = this.sockets.get(userId) ?? new Set();
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
