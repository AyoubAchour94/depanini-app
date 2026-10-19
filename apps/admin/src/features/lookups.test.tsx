import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createFakeApi, createFakeAuth } from '../test/fakes';
import { renderApp } from '../test/render';

const signedIn = () =>
  createFakeAuth({ 'admin@example.com': { password: 'pw', isAdmin: true } }, 'admin@example.com');

const U1 = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const U2 = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const T1 = '2d3e4f5a-6b7c-4d8e-9fa0-1b2c3d4e5f6a';
const R1 = '3e4f5a6b-7c8d-4e9f-a0b1-2c3d4e5f6a7b';
const at = '2026-10-19T09:00:00.000Z';
const later = '2026-10-19T10:30:00.000Z';
const empty = { items: [], nextCursor: null };

const user = (overrides: Record<string, unknown> = {}) => ({
  id: U1,
  email: 'alice@example.com',
  phone: '+21698111111',
  customerName: 'Alice Smith',
  driverName: null,
  createdAt: at,
  ...overrides,
});

const tripItem = (overrides: Record<string, unknown> = {}) => ({
  id: T1,
  status: 'completed',
  customerName: 'Alice Smith',
  driverName: 'Dan Driver',
  pickupAddress: 'Avenue Habib Bourguiba, Tunis',
  dropoffAddress: 'Sousse',
  agreedFare: 120,
  createdAt: at,
  ...overrides,
});

const report = (overrides: Record<string, unknown> = {}) => ({
  id: R1,
  requestId: T1,
  category: 'overcharged',
  note: 'Charged twice',
  status: 'open',
  resolutionNote: null,
  createdAt: at,
  resolvedAt: null,
  reporterUserId: U1,
  reporterRole: 'customer',
  reporterName: 'Alice Smith',
  resolvedBy: null,
  resolvedByEmail: null,
  pickupAddress: 'Avenue Habib Bourguiba, Tunis',
  ...overrides,
});

const dispute = (overrides: Record<string, unknown> = {}) => ({
  requestId: T1,
  receiptNo: 'DPN-2026-000001',
  amountTnd: 120,
  disputeNote: 'I paid less',
  customerName: 'Alice Smith',
  driverName: 'Dan Driver',
  status: 'open',
  resolutionNote: null,
  resolvedByEmail: null,
  disputedAt: at,
  resolvedAt: null,
  ...overrides,
});

const tripDetail = (overrides: Record<string, unknown> = {}) => ({
  ...tripItem(),
  problemType: 'breakdown',
  vehicleType: 'car',
  note: 'Engine died',
  pickup: { latitude: 36.8, longitude: 10.1, address: 'Avenue Habib Bourguiba, Tunis' },
  dropoff: { latitude: 35.8, longitude: 10.6, address: 'Sousse' },
  distanceM: 140000,
  suggestedFare: 110,
  proposedFare: 115,
  tripStage: null,
  customer: { userId: U1, fullName: 'Alice Smith', phone: '+21698111111' },
  driver: { userId: U2, fullName: 'Dan Driver', phone: '+21698222222', plateNumber: '123TUN1' },
  assignedAt: at,
  enRouteAt: at,
  arrivedAt: at,
  towingAt: at,
  completedAt: later,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  offers: [
    { id: U1, driverName: 'Dan Driver', fare: 120, status: 'accepted', createdAt: at },
    { id: U2, driverName: 'Eve Driver', fare: 130, status: 'rejected', createdAt: at },
  ],
  payment: {
    status: 'disputed',
    method: 'cash',
    amountTnd: 120,
    receiptNo: 'DPN-2026-000001',
    driverConfirmedAt: later,
    customerAnsweredAt: later,
    disputeNote: 'I paid less',
    resolutionNote: null,
    resolvedAt: null,
  },
  customerRating: {
    stars: 2,
    tags: ['late'],
    comment: 'Took ages, private note',
    createdAt: later,
  },
  driverRating: { stars: 4, tags: [], comment: 'Fine customer', createdAt: later },
  reports: [report()],
  ...overrides,
});

describe('user lookup', () => {
  it('searches by email or phone and lists the matches', async () => {
    const api = createFakeApi({
      get: (path) => (path.includes('q=alice') ? { items: [user()], nextCursor: null } : empty),
    });
    renderApp({ auth: signedIn(), api, route: '/users' });
    expect(await screen.findByText('No users found.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email or phone'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    const link = await screen.findByRole('link', { name: 'Alice Smith' });
    expect(link).toHaveAttribute('href', `/users/${U1}`);
    expect(screen.getByText('+21698111111')).toBeInTheDocument();
    expect(api.get.mock.calls.at(-1)?.[0]).toContain('q=alice');
  });

  it('shows the profiles, verification status, counts and recent trips', async () => {
    const api = createFakeApi({
      get: () => ({
        ...user({ id: U2, driverName: 'Dan Driver', customerName: 'Dan Driver' }),
        customerProfile: { fullName: 'Dan Driver', phone: '+21698222222' },
        driverProfile: {
          fullName: 'Dan Driver',
          phone: '+21698222222',
          truckType: 'flatbed',
          plateNumber: '123TUN1',
          verificationStatus: 'approved',
        },
        counts: { tripsAsCustomer: 1, tripsAsDriver: 7, reportsMade: 2, reportsAgainst: 3 },
        recentTrips: [tripItem()],
      }),
    });
    renderApp({ auth: signedIn(), api, route: `/users/${U2}` });

    const driver = await screen.findByRole('region', { name: 'Driver profile' });
    expect(within(driver).getByText('Approved')).toBeInTheDocument();
    expect(within(driver).getByText('123TUN1')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Customer profile' })).toBeInTheDocument();
    const counts = screen.getByRole('region', { name: 'Counts' });
    expect(within(counts).getByText('Trips as driver').nextSibling).toHaveTextContent('7');
    expect(within(counts).getByText('Reports against').nextSibling).toHaveTextContent('3');
    expect(
      within(screen.getByRole('region', { name: 'Recent trips' })).getByRole('link'),
    ).toHaveAttribute('href', `/trips/${T1}`);
  });

  it('says so for an unknown user', async () => {
    const { ApiError } = await import('../api/client');
    const api = createFakeApi({
      get: () => {
        throw new ApiError(404, 'User not found');
      },
    });
    renderApp({ auth: signedIn(), api, route: `/users/${U1}` });
    expect(await screen.findByText('User not found.')).toBeInTheDocument();
  });
});

describe('trip lookup', () => {
  it('sends the search, status and date range to the API', async () => {
    const api = createFakeApi({ get: () => ({ items: [tripItem()], nextCursor: null }) });
    renderApp({ auth: signedIn(), api, route: '/trips' });
    expect(
      await screen.findByRole('link', { name: 'Avenue Habib Bourguiba, Tunis' }),
    ).toBeVisible();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'completed');
    await userEvent.type(screen.getByLabelText('From'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('To'), '2026-10-19');
    await userEvent.type(screen.getByLabelText('Trip id, receipt, customer or driver'), 'DPN-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const last = api.get.mock.calls.at(-1)?.[0] as string;
      expect(last).toContain('status=completed');
      expect(last).toContain('from=2026-10-01');
      expect(last).toContain('to=2026-10-19');
      expect(last).toContain('q=DPN-2026');
    });
  });

  it('shows the timeline, offers, payment, both ratings with comments, and reports', async () => {
    const api = createFakeApi({ get: () => tripDetail() });
    renderApp({ auth: signedIn(), api, route: `/trips/${T1}` });

    await screen.findByRole('heading', { name: /Avenue Habib Bourguiba, Tunis to Sousse/ });
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    for (const stage of ['Requested', 'Accepted', 'On the way', 'Arrived', 'Towing', 'Completed']) {
      expect(within(timeline).getByText(stage)).toBeInTheDocument();
    }
    expect(within(timeline).queryByText('Cancelled')).not.toBeInTheDocument();

    const offers = screen.getByRole('region', { name: 'Offers' });
    expect(within(offers).getByText('Eve Driver')).toBeInTheDocument();

    const payment = screen.getByRole('region', { name: 'Payment' });
    expect(within(payment).getByText('DPN-2026-000001')).toBeInTheDocument();
    expect(within(payment).getByText('Disputed')).toBeInTheDocument();
    expect(within(payment).getByText('I paid less')).toBeInTheDocument();

    const ratings = screen.getByRole('region', { name: 'Ratings' });
    expect(within(ratings).getByText('Took ages, private note')).toBeInTheDocument();
    expect(within(ratings).getByText('Fine customer')).toBeInTheDocument();

    const reports = screen.getByRole('region', { name: 'Reports' });
    expect(within(reports).getByText('Charged twice')).toBeInTheDocument();
  });

  it('handles a cancelled trip with no payment or ratings', async () => {
    const api = createFakeApi({
      get: () =>
        tripDetail({
          status: 'cancelled',
          payment: null,
          customerRating: null,
          driverRating: null,
          reports: [],
          offers: [],
          completedAt: null,
          cancelledAt: later,
          cancelledBy: 'customer',
          cancelReason: 'Fixed it myself',
        }),
    });
    renderApp({ auth: signedIn(), api, route: `/trips/${T1}` });
    expect(await screen.findByText('No payment yet.')).toBeInTheDocument();
    expect(screen.getAllByText('Not rated.')).toHaveLength(2);
    expect(screen.getByText('No reports.')).toBeInTheDocument();
    expect(screen.getByText(/Fixed it myself/)).toBeInTheDocument();
  });
});

describe('reports queue', () => {
  it('asks for open reports first and refuses to resolve without a note', async () => {
    const api = createFakeApi({ get: () => ({ items: [report()], nextCursor: null }) });
    renderApp({ auth: signedIn(), api, route: '/reports' });

    expect(await screen.findByText('Charged twice')).toBeInTheDocument();
    expect(api.get.mock.calls[0]?.[0]).toContain('status=open');

    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm resolution' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Write a note');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('resolves with the note through the confirm dialog and refreshes the queue', async () => {
    let resolved = false;
    const api = createFakeApi({
      get: () => ({
        items: resolved ? [] : [report()],
        nextCursor: null,
      }),
      post: () => {
        resolved = true;
        return report({ status: 'resolved', resolutionNote: 'Refunded' });
      },
    });
    renderApp({ auth: signedIn(), api, route: '/reports' });

    await userEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Resolution note/), '  Refunded  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm resolution' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/admin/reports/${R1}/resolve`,
        { note: 'Refunded' },
        expect.anything(),
      ),
    );
    expect(await screen.findByText('No open reports.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows who resolved a report and when', async () => {
    const api = createFakeApi({
      get: () => ({
        items: [
          report({
            status: 'resolved',
            resolutionNote: 'Refunded the difference',
            resolvedAt: later,
            resolvedByEmail: 'root@depanini.test',
          }),
        ],
        nextCursor: null,
      }),
    });
    renderApp({ auth: signedIn(), api, route: '/reports?status=resolved' });
    expect(await screen.findByText(/Resolved by root@depanini.test on/)).toBeInTheDocument();
    expect(screen.getByText('Refunded the difference')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
    expect(api.get.mock.calls[0]?.[0]).toContain('status=resolved');
  });

  it('shows the error from the API in the dialog', async () => {
    const { ApiError } = await import('../api/client');
    const api = createFakeApi({
      get: () => ({ items: [report()], nextCursor: null }),
      post: () => {
        throw new ApiError(409, 'This report is already resolved');
      },
    });
    renderApp({ auth: signedIn(), api, route: '/reports' });
    await userEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Resolution note/), 'Done');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm resolution' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This report is already resolved',
    );
  });
});

describe('payment disputes queue', () => {
  it('resolves a dispute by trip id with a note', async () => {
    const api = createFakeApi({
      get: () => ({ items: [dispute()], nextCursor: null }),
      post: () => dispute({ status: 'resolved' }),
    });
    renderApp({ auth: signedIn(), api, route: '/disputes' });

    expect(await screen.findByText('I paid less')).toBeInTheDocument();
    expect(api.get.mock.calls[0]?.[0]).toContain('status=open');
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm resolution' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Write a note');
    await userEvent.type(within(dialog).getByLabelText(/Resolution note/), 'Driver agreed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm resolution' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/admin/disputes/${T1}/resolve`,
        {
          note: 'Driver agreed',
        },
        expect.anything(),
      ),
    );
  });

  it('shows who resolved a dispute', async () => {
    const api = createFakeApi({
      get: () => ({
        items: [
          dispute({
            status: 'resolved',
            resolutionNote: 'Driver agreed',
            resolvedAt: later,
            resolvedByEmail: 'root@depanini.test',
          }),
        ],
        nextCursor: null,
      }),
    });
    renderApp({ auth: signedIn(), api, route: '/disputes?status=resolved' });
    expect(await screen.findByText(/Resolved by root@depanini.test on/)).toBeInTheDocument();
    expect(screen.getByText('Driver agreed')).toBeInTheDocument();
  });
});

describe('audit log', () => {
  const entry = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    adminUserId: U1,
    adminEmail: 'root@depanini.test',
    action: 'report_resolved',
    targetType: 'report',
    targetId: R1,
    details: { note: 'Refunded', requestId: T1 },
    createdAt: at,
    ...overrides,
  });

  it('lists who did what to which target, and loads the next page', async () => {
    const api = createFakeApi({
      get: (path) =>
        path.includes('cursor=next')
          ? {
              items: [
                entry('4f5a6b7c-8d9e-4fa0-b1c2-3d4e5f6a7b8c', {
                  action: 'driver_rejected',
                  targetType: 'driver',
                  targetId: U2,
                  details: { decision: 'reject', reason: 'Blurry licence' },
                }),
              ],
              nextCursor: null,
            }
          : {
              items: [
                entry('5a6b7c8d-9eaf-40b1-c2d3-4e5f6a7b8c9d', {
                  action: 'dispute_resolved',
                  targetType: 'dispute',
                  targetId: T1,
                  details: { note: 'Driver agreed' },
                }),
                entry('6b7c8d9e-afb0-41c2-d3e4-5f6a7b8c9d0e'),
              ],
              nextCursor: 'next',
            },
    });
    renderApp({ auth: signedIn(), api, route: '/audit' });

    expect(await screen.findByText('Resolved a payment dispute')).toBeInTheDocument();
    expect(screen.getAllByText('root@depanini.test')).toHaveLength(2);
    expect(screen.getByText('Driver agreed')).toBeInTheDocument();
    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links).toContain(`/trips/${T1}`);
    expect(screen.queryByText('Rejected a driver')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Rejected a driver')).toBeInTheDocument();
    expect(screen.getByText('Blurry licence')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Driver' })).toHaveAttribute('href', `/drivers/${U2}`);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(api.get.mock.calls.at(-1)?.[0]).toContain('cursor=next');
  });

  it('says so when nothing has happened yet', async () => {
    renderApp({ auth: signedIn(), api: createFakeApi({ get: () => empty }), route: '/audit' });
    expect(await screen.findByText('No admin actions yet.')).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('links every screen from the sidebar', async () => {
    renderApp({ auth: signedIn(), api: createFakeApi({ get: () => empty }), route: '/users' });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const name of ['Users', 'Trips', 'Reports', 'Disputes', 'Audit log']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
  });
});
