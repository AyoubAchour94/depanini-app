import { RealtimeClient, toWsUrl } from './client';

class MockSocket {
  static instances: MockSocket[] = [];
  sent: string[] = [];
  closedWith?: number;
  onopen?: () => void;
  onmessage?: (event: { data: unknown }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor(readonly url: string) {
    MockSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.closedWith = code;
    this.onclose?.({ code });
  }
  open() {
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  serverClose(code: number) {
    this.onclose?.({ code });
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function setup(getToken: () => Promise<string | undefined> = async () => 'tok') {
  const onMessage = jest.fn();
  const onStatus = jest.fn();
  const client = new RealtimeClient({
    url: 'ws://api.test/ws',
    getToken,
    onMessage,
    onStatus,
    WebSocketImpl: MockSocket as never,
  });
  return { client, onMessage, onStatus };
}

const last = () => MockSocket.instances[MockSocket.instances.length - 1]!;

beforeEach(() => {
  jest.useFakeTimers();
  MockSocket.instances = [];
});
afterEach(() => jest.useRealTimers());

describe('toWsUrl', () => {
  it('maps http to ws and https to wss', () => {
    expect(toWsUrl('http://localhost:3000')).toBe('ws://localhost:3000/ws');
    expect(toWsUrl('https://x.trycloudflare.com/')).toBe('wss://x.trycloudflare.com/ws');
  });
});

describe('RealtimeClient', () => {
  it('authenticates first and is live after auth.ok', async () => {
    const { client, onStatus } = setup();
    client.start();
    await flush();
    last().open();
    expect(JSON.parse(last().sent[0]!)).toEqual({ type: 'auth', token: 'tok' });
    expect(onStatus).not.toHaveBeenCalledWith('live');
    last().receive({ type: 'auth.ok' });
    expect(onStatus).toHaveBeenLastCalledWith('live');
  });

  it('passes parsed messages on and ignores invalid ones', async () => {
    const { client, onMessage } = setup();
    client.start();
    await flush();
    last().open();
    last().receive({ type: 'auth.ok' });
    last().receive('not json');
    last().receive({ type: 'request.updated', request: { nope: 1 } });
    last().receive({ type: 'unknown' });
    const location = {
      type: 'driver.location',
      requestId: '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10',
      location: { latitude: 36.8, longitude: 10.18 },
      etaMin: 4,
    };
    last().receive(location);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(location);
  });

  it('reconnects with 1/2/5/10/30 s backoff and resets after auth.ok', async () => {
    const { client, onStatus } = setup();
    client.start();
    for (const delay of [1000, 2000, 5000, 10_000, 30_000, 30_000]) {
      await flush();
      const count = MockSocket.instances.length;
      last().serverClose(1006);
      expect(onStatus).toHaveBeenLastCalledWith('reconnecting');
      jest.advanceTimersByTime(delay - 1);
      await flush();
      expect(MockSocket.instances).toHaveLength(count);
      jest.advanceTimersByTime(1);
      await flush();
      expect(MockSocket.instances).toHaveLength(count + 1);
    }
    last().open();
    last().receive({ type: 'auth.ok' });
    const count = MockSocket.instances.length;
    last().serverClose(1006);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(MockSocket.instances).toHaveLength(count + 1);
  });

  it('reconnects at once after a 4401 with a fresh token', async () => {
    const getToken = jest.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    const { client } = setup(getToken);
    client.start();
    await flush();
    last().open();
    last().receive({ type: 'auth.ok' });
    last().serverClose(4401);
    await flush();
    expect(MockSocket.instances).toHaveLength(2);
    last().open();
    expect(JSON.parse(last().sent[0]!).token).toBe('new');
  });

  it('does not reconnect at once after being evicted with 4000', async () => {
    const { client } = setup();
    client.start();
    await flush();
    last().serverClose(4000);
    jest.advanceTimersByTime(29_000);
    await flush();
    expect(MockSocket.instances).toHaveLength(1);
    jest.advanceTimersByTime(1_000);
    await flush();
    expect(MockSocket.instances).toHaveLength(2);
  });

  it('retries when there is no token yet', async () => {
    const getToken = jest.fn().mockResolvedValueOnce(undefined).mockResolvedValue('tok');
    const { client } = setup(getToken);
    client.start();
    await flush();
    expect(MockSocket.instances).toHaveLength(0);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(MockSocket.instances).toHaveLength(1);
  });

  it('pauses in the background and resumes in the foreground', async () => {
    const { client, onStatus } = setup();
    client.start();
    await flush();
    last().open();
    last().receive({ type: 'auth.ok' });
    client.setActive(false);
    expect(last().closedWith).toBe(1000);
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting');
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(MockSocket.instances).toHaveLength(1);
    client.setActive(true);
    await flush();
    expect(MockSocket.instances).toHaveLength(2);
  });

  it('gives up on a socket that never answers the auth message', async () => {
    const { client, onStatus } = setup();
    client.start();
    await flush();
    last().open();
    jest.advanceTimersByTime(14_999);
    expect(last().closedWith).toBeUndefined();
    jest.advanceTimersByTime(1);
    expect(last().closedWith).toBe(1000);
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting');
    jest.advanceTimersByTime(1000);
    await flush();
    expect(MockSocket.instances).toHaveLength(2);
  });

  it('does not time out once authenticated', async () => {
    const { client } = setup();
    client.start();
    await flush();
    last().open();
    last().receive({ type: 'auth.ok' });
    jest.advanceTimersByTime(60_000);
    expect(last().closedWith).toBeUndefined();
  });

  it('stop closes the socket and never reconnects', async () => {
    const { client } = setup();
    client.start();
    await flush();
    last().open();
    client.stop();
    expect(last().closedWith).toBe(1000);
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(MockSocket.instances).toHaveLength(1);
  });
});
