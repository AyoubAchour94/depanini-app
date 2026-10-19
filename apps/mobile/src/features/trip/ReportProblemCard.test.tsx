import type { Report, TowRequest } from '@depanini/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { canReport, ReportProblemCard } from './ReportProblemCard';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const ID = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const trip = (over: Partial<TowRequest> = {}) =>
  ({ id: ID, status: 'completed', completedAt: daysAgo(1), ...over }) as TowRequest;

const report = (over: Partial<Report> = {}): Report => ({
  id: '11111111-2222-4333-8444-555555555555',
  requestId: ID,
  category: 'overcharged',
  note: 'Asked for more',
  status: 'open',
  resolutionNote: null,
  createdAt: daysAgo(0.5),
  resolvedAt: null,
  ...over,
});

let reports: Report[];
/** What the next POST answers: 201, or an error status. */
let postStatus: number;
let posts: unknown[];

beforeEach(() => {
  reports = [];
  postStatus = 201;
  posts = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    expect(String(input)).toBe(`http://api.test/tow-requests/${ID}/reports`);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      if (postStatus !== 201) return new Response('{}', { status: postStatus });
      const created = report({ ...body });
      reports = [created, ...reports];
      return Response.json(created, { status: 201 });
    }
    return Response.json(reports);
  });
});

afterEach(() => jest.restoreAllMocks());

async function renderCard(request: TowRequest = trip()) {
  await render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ReportProblemCard request={request} />
    </QueryClientProvider>,
  );
}

const link = () => screen.queryByRole('button', { name: 'Report a problem with this trip' });

describe('canReport', () => {
  const now = Date.parse('2026-02-01T00:00:00.000Z');

  it('allows a completed trip up to and including the 14th day', () => {
    const at = (iso: string) => canReport(trip({ completedAt: iso }), now);
    expect(at('2026-01-18T00:00:00.000Z')).toBe(true);
    expect(at('2026-01-18T00:00:00.001Z')).toBe(true);
    expect(at('2026-01-17T23:59:59.999Z')).toBe(false);
  });

  it('allows a cancelled trip, whose end the app does not know, and leaves the window to the API', () => {
    expect(canReport(trip({ status: 'cancelled', completedAt: null }), now)).toBe(true);
  });

  it('refuses a trip that is still going', () => {
    for (const status of ['open', 'assigned', 'expired'] as const) {
      expect(canReport(trip({ status, completedAt: null }), now)).toBe(false);
    }
  });
});

describe('ReportProblemCard', () => {
  it('shows the link on a recent completed or cancelled trip', async () => {
    await renderCard();
    expect(
      await screen.findByRole('button', { name: 'Report a problem with this trip' }),
    ).toBeOnTheScreen();
  });

  it('shows the link on a cancelled trip', async () => {
    await renderCard(trip({ status: 'cancelled', completedAt: null }));
    expect(
      await screen.findByRole('button', { name: 'Report a problem with this trip' }),
    ).toBeOnTheScreen();
  });

  it('has no link on an active trip', async () => {
    await renderCard(trip({ status: 'assigned', completedAt: null }));
    expect(link()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('has no link after the window, but still shows the reports already sent', async () => {
    reports = [report({ status: 'resolved', resolutionNote: 'Refunded' })];
    await renderCard(trip({ completedAt: daysAgo(15) }));
    expect(await screen.findByText('Resolution: Refunded')).toBeOnTheScreen();
    expect(link()).toBeNull();
  });

  it('asks for a category and a note before sending', async () => {
    await renderCard();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Report a problem with this trip' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Choose a category')).toBeOnTheScreen();
    expect(posts).toHaveLength(0);

    await fireEvent.press(screen.getByRole('radio', { name: 'Overcharged' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Tell us what happened')).toBeOnTheScreen();
    expect(posts).toHaveLength(0);
  });

  it('counts the note and sends the trimmed report, then says it was sent', async () => {
    await renderCard();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Report a problem with this trip' }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Overcharged' }));
    await fireEvent.changeText(screen.getByLabelText('What happened?'), '  Asked for more  ');
    expect(screen.getByText('18/1000')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText('Report sent')).toBeOnTheScreen();
    expect(posts).toEqual([{ category: 'overcharged', note: 'Asked for more' }]);
    // The new open report replaces the link.
    expect(await screen.findByText('Open')).toBeOnTheScreen();
    expect(link()).toBeNull();
  });

  it('shows an open report with its status instead of the link', async () => {
    reports = [report()];
    await renderCard();

    expect(await screen.findByText('Open')).toBeOnTheScreen();
    expect(screen.getByText('Overcharged')).toBeOnTheScreen();
    expect(screen.getByText('Asked for more')).toBeOnTheScreen();
    expect(link()).toBeNull();
  });

  it('shows a resolved report with its resolution note', async () => {
    reports = [
      report({
        status: 'resolved',
        resolutionNote: 'We refunded the difference',
        resolvedAt: daysAgo(0.1),
      }),
    ];
    await renderCard();

    expect(await screen.findByText('Resolved')).toBeOnTheScreen();
    expect(screen.getByText('Resolution: We refunded the difference')).toBeOnTheScreen();
    // Nothing is open, so another report is still possible.
    expect(link()).toBeOnTheScreen();
  });

  it('says so on a 409 and shows the open report that blocked it', async () => {
    await renderCard();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Report a problem with this trip' }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Safety' }));
    await fireEvent.changeText(screen.getByLabelText('What happened?'), 'Unsafe driving');
    postStatus = 409;
    reports = [report({ category: 'safety', note: 'From another device' })];

    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText('From another device')).toBeOnTheScreen();
    expect(screen.queryByText('Report sent')).toBeNull();
  });

  it('keeps the form and offers another try when sending fails', async () => {
    await renderCard();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Report a problem with this trip' }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Other' }));
    await fireEvent.changeText(screen.getByLabelText('What happened?'), 'Something');
    postStatus = 500;

    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText('Could not send your report. Try again.')).toBeOnTheScreen();
    expect(screen.getByLabelText('What happened?').props.value).toBe('Something');
  });

  it('goes back to the link from the form', async () => {
    await renderCard();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Report a problem with this trip' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(link()).toBeOnTheScreen();
  });
});
