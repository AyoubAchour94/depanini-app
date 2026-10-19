import type { TowRequest } from '@depanini/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useActiveTowRequest } from '@/api/towRequests';
import { applyRealtimeMessage } from '@/realtime/apply';
import { createTestQueryClient } from '@/test/queryClient';

import { CompletedSummary } from './CompletedSummary';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const ID = '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10';
const place = (address: string) => ({ latitude: 36.8, longitude: 10.18, address });
const payment = (status: string) => ({
  status,
  amountTnd: 85,
  receiptNo: 'DPN-2026-000123',
});
const completed = (status = 'driver_confirmed') =>
  ({
    id: ID,
    status: 'completed',
    pickup: place('Avenue Bourguiba'),
    dropoff: place('La Marsa'),
    vehicleType: 'car',
    problemType: 'battery',
    note: null,
    distanceM: 12_400,
    suggestedFare: 65,
    proposedFare: 70,
    agreedFare: 85,
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
    completedAt: '2026-01-01T10:40:00.000Z',
    payment: payment(status),
  }) as unknown as TowRequest;

let calls: { path: string; body: unknown }[];
/** What the next payment POST answers: a status code, or the request it returns. */
let answer: number | TowRequest;
let active: TowRequest;

beforeEach(() => {
  calls = [];
  answer = 200;
  active = completed();
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const { pathname } = new URL(input.toString());
    if (init?.method === 'POST') {
      calls.push({ path: pathname, body: init.body ? JSON.parse(init.body as string) : undefined });
      if (typeof answer === 'number') return new Response('{}', { status: answer });
      active = answer;
      return Response.json(answer);
    }
    if (pathname === '/tow-requests/active') return Response.json(active);
    return Response.json({ items: [], nextCursor: null });
  });
});
afterEach(() => jest.restoreAllMocks());

/** The summary as the active screen drives it: from the cached active request. */
function Harness({ onDone }: { onDone: () => void }) {
  const { data } = useActiveTowRequest();
  return data ? <CompletedSummary request={data} driverName="Sami" onDone={onDone} /> : null;
}

async function renderSummary(onDone = () => undefined) {
  const queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <Harness onDone={onDone} />
    </QueryClientProvider>,
  );
  await screen.findByText('Trip complete');
  return queryClient;
}

describe('payment prompt', () => {
  it('asks whether the customer paid the driver', async () => {
    await renderSummary();
    expect(screen.getByText('Did you pay 85 TND to Sami?')).toBeOnTheScreen();
  });

  it('confirms the payment and shows the result instead of the prompt', async () => {
    await renderSummary();
    answer = completed('customer_confirmed');

    await fireEvent.press(screen.getByRole('button', { name: 'Yes, I paid' }));

    expect(await screen.findByText('Payment confirmed')).toBeOnTheScreen();
    expect(calls).toEqual([{ path: `/tow-requests/${ID}/payment/confirm`, body: undefined }]);
    expect(screen.queryByRole('button', { name: 'Yes, I paid' })).toBeNull();
  });

  it('reports a problem with a trimmed note and shows the result', async () => {
    await renderSummary();
    answer = completed('disputed');

    await fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
    expect(screen.getByText('0/500')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('What went wrong?'), '  Asked for more  ');
    expect(screen.getByText('18/500')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('Problem reported. Our team will contact you.'),
    ).toBeOnTheScreen();
    expect(calls).toEqual([
      { path: `/tow-requests/${ID}/payment/dispute`, body: { note: 'Asked for more' } },
    ]);
  });

  it('does not send a blank note', async () => {
    await renderSummary();

    await fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
    await fireEvent.changeText(screen.getByLabelText('What went wrong?'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByText('Tell us what went wrong.')).toBeOnTheScreen();
    expect(calls).toEqual([]);
  });

  it('can go back from the note to the two answers', async () => {
    await renderSummary();
    await fireEvent.press(screen.getByRole('button', { name: 'Report a problem' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Yes, I paid' })).toBeOnTheScreen();
  });

  it('refetches and shows the result when it was already answered (409)', async () => {
    await renderSummary();
    answer = 409;
    active = completed('disputed');

    await fireEvent.press(screen.getByRole('button', { name: 'Yes, I paid' }));

    expect(
      await screen.findByText('Problem reported. Our team will contact you.'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('This payment was already answered. We refreshed it.'),
    ).toBeOnTheScreen();
  });

  it('keeps the prompt and says so when sending fails', async () => {
    await renderSummary();
    answer = 500;

    await fireEvent.press(screen.getByRole('button', { name: 'Yes, I paid' }));

    expect(await screen.findByText('Could not send your answer. Try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Yes, I paid' })).toBeOnTheScreen();
  });

  it('lets the customer press Done without answering', async () => {
    const onDone = jest.fn();
    await renderSummary(onDone);

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it('has no prompt before the driver reported the cash', async () => {
    active = { ...completed(), payment: undefined } as TowRequest;
    await renderSummary();
    expect(screen.queryByText(/Did you pay/)).toBeNull();
  });

  it('shows the answer pushed over the socket', async () => {
    const queryClient = await renderSummary();

    await act(async () =>
      applyRealtimeMessage(
        queryClient,
        { type: 'request.updated', request: completed('customer_confirmed') },
        'customer',
      ),
    );

    await waitFor(() => expect(screen.getByText('Payment confirmed')).toBeOnTheScreen());
    expect(screen.queryByText(/Did you pay/)).toBeNull();
  });
});
