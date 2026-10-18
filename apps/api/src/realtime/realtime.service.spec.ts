import { RealtimeService, type RealtimeSocket } from './realtime.service.js';

const fakeSocket = (readyState: RealtimeSocket['readyState'] = 1) => {
  const sent: string[] = [];
  const socket: RealtimeSocket = { OPEN: 1, readyState, send: (data) => sent.push(String(data)) };
  return { socket, sent };
};

describe('RealtimeService', () => {
  it('sends to every open socket of the user, and to no one else', () => {
    const realtime = new RealtimeService();
    const phone = fakeSocket();
    const web = fakeSocket();
    const closing = fakeSocket(2);
    const stranger = fakeSocket();
    realtime.add('alice', phone.socket);
    realtime.add('alice', web.socket);
    realtime.add('alice', closing.socket);
    realtime.add('zed', stranger.socket);

    realtime.send('alice', { type: 'auth.ok' });

    expect(phone.sent).toEqual(['{"type":"auth.ok"}']);
    expect(web.sent).toEqual(['{"type":"auth.ok"}']);
    expect(closing.sent).toEqual([]);
    expect(stranger.sent).toEqual([]);
  });

  it('forgets a socket once removed, and the user with their last socket', () => {
    const realtime = new RealtimeService();
    const phone = fakeSocket();
    const web = fakeSocket();
    realtime.add('alice', phone.socket);
    realtime.add('alice', web.socket);

    realtime.remove('alice', phone.socket);
    realtime.send('alice', { type: 'auth.ok' });

    expect(phone.sent).toEqual([]);
    expect(web.sent).toHaveLength(1);
    expect(realtime.isConnected('alice')).toBe(true);
    realtime.remove('alice', web.socket);
    expect(realtime.isConnected('alice')).toBe(false);
  });

  it('does nothing for a user without sockets', () => {
    expect(() => new RealtimeService().send('nobody', { type: 'auth.ok' })).not.toThrow();
  });
});
