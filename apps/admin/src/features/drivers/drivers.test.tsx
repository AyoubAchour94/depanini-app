import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeApi, createFakeAuth } from '../../test/fakes';
import { renderApp } from '../../test/render';

const accounts = { 'admin@example.com': { password: 'pw', isAdmin: true } };
const signedIn = () => createFakeAuth(accounts, 'admin@example.com');

const ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const OTHER = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const at = '2026-10-19T09:00:00.000Z';

const driver = (overrides: Record<string, unknown> = {}) => ({
  userId: ID,
  fullName: 'Ali Ben Salah',
  email: 'ali@example.com',
  phone: '+21620123456',
  truckType: 'flatbed',
  plateNumber: '123TUN4567',
  verificationStatus: 'pending',
  submittedAt: at,
  ...overrides,
});

const documents = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'licence',
    page: 1,
    contentType: 'image/png',
    sizeBytes: 10,
    createdAt: at,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'insurance',
    page: 1,
    contentType: 'application/pdf',
    sizeBytes: 10,
    createdAt: at,
  },
];

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('review queue', () => {
  it('asks for pending drivers and lists them', async () => {
    const api = createFakeApi({
      get: () => ({
        items: [driver(), driver({ userId: OTHER, fullName: 'Sami Trabelsi' })],
        nextCursor: null,
      }),
    });
    renderApp({ auth: signedIn(), api, route: '/queue' });

    const link = await screen.findByRole('link', { name: 'Ali Ben Salah' });
    expect(link).toHaveAttribute('href', `/drivers/${ID}`);
    expect(screen.getByRole('link', { name: 'Sami Trabelsi' })).toBeInTheDocument();
    expect(api.get.mock.calls[0]?.[0]).toContain('status=pending');
  });

  it('says so when nobody is waiting', async () => {
    const api = createFakeApi({ get: () => ({ items: [], nextCursor: null }) });
    renderApp({ auth: signedIn(), api, route: '/queue' });
    expect(await screen.findByText('No drivers are waiting for review.')).toBeInTheDocument();
  });

  it('loads the next page with the cursor', async () => {
    const api = createFakeApi({
      get: (path) =>
        path.includes('cursor=abc')
          ? { items: [driver({ userId: OTHER, fullName: 'Second Page' })], nextCursor: null }
          : { items: [driver()], nextCursor: 'abc' },
    });
    renderApp({ auth: signedIn(), api, route: '/queue' });
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('link', { name: 'Second Page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ali Ben Salah' })).toBeInTheDocument();
  });
});

describe('drivers list', () => {
  it('shows pending drivers first and filters by status', async () => {
    const api = createFakeApi({
      get: (path) =>
        path.includes('status=approved')
          ? {
              items: [driver({ fullName: 'Approved One', verificationStatus: 'approved' })],
              nextCursor: null,
            }
          : {
              items: [
                driver({ userId: OTHER, fullName: 'Approved One', verificationStatus: 'approved' }),
                driver({ fullName: 'Pending One' }),
              ],
              nextCursor: null,
            },
    });
    renderApp({ auth: signedIn(), api, route: '/drivers' });

    await screen.findByRole('link', { name: 'Pending One' });
    const names = screen.getAllByRole('link', { name: /One$/ }).map((a) => a.textContent);
    expect(names).toEqual(['Pending One', 'Approved One']);

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'approved');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Pending One' })).toBeNull());
    expect(api.get.mock.calls.at(-1)?.[0]).toContain('status=approved');
  });
});

describe('driver detail', () => {
  function setup(status = 'pending') {
    let current: Record<string, unknown> = driver({ verificationStatus: status, documents });
    const api = createFakeApi({
      get: () => current,
      post: (_path, body) => {
        const input = body as { decision: string; reason?: string };
        current =
          input.decision === 'approve'
            ? { ...current, verificationStatus: 'approved' }
            : { ...current, verificationStatus: 'rejected', rejectionReason: input.reason };
        return current;
      },
      blob: (path) =>
        path.endsWith('1111-4111-8111-111111111111')
          ? new Blob(['png'], { type: 'image/png' })
          : new Blob(['pdf'], { type: 'application/pdf' }),
    });
    renderApp({ auth: signedIn(), api, route: `/drivers/${ID}` });
    return api;
  }

  it('shows the profile and each document: images in <img>, PDFs in <iframe>', async () => {
    const api = setup();
    expect(await screen.findByRole('heading', { name: 'Ali Ben Salah' })).toBeInTheDocument();
    const image = await screen.findByRole('img', { name: "Driver's licence, page 1" });
    expect(image).toHaveAttribute('src', 'blob:fake');
    const pdf = await screen.findByTitle('Insurance certificate, page 1');
    expect(pdf.tagName).toBe('IFRAME');
    expect(pdf).toHaveAttribute('src', 'blob:fake');
    const paths = api.blob.mock.calls.map((call) => call[0]);
    expect(paths).toContain('/admin/files/11111111-1111-4111-8111-111111111111');
    expect(paths).toContain('/admin/files/22222222-2222-4222-8222-222222222222');
  });

  it('reports a document that cannot be loaded', async () => {
    const api = createFakeApi({ get: () => driver({ documents: [documents[0]] }) });
    api.blob.mockRejectedValue(new Error('boom'));
    renderApp({ auth: signedIn(), api, route: `/drivers/${ID}` });
    expect(await screen.findByText("Could not load Driver's licence, page 1.")).toBeInTheDocument();
  });

  it('approves after a confirmation', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve Ali Ben Salah?' });
    expect(api.post).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm approval' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/admin/drivers/${ID}/review`,
        { decision: 'approve' },
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('cancelling the confirmation sends nothing', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('will not reject without a reason', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give a reason');
    expect(api.post).not.toHaveBeenCalled();

    // Spaces only is no reason either.
    await userEvent.type(screen.getByLabelText(/Reason/), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('rejects with the trimmed reason', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    await userEvent.type(screen.getByLabelText(/Reason/), ' Licence is blurry ');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/admin/drivers/${ID}/review`,
        { decision: 'reject', reason: 'Licence is blurry' },
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Licence is blurry')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('shows the API error when the review fails', async () => {
    const api = setup();
    api.post.mockRejectedValue(new Error('Driver is not pending'));
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Driver is not pending');
  });

  it('offers no review on a driver who is not pending', async () => {
    setup('approved');
    await screen.findByRole('heading', { name: 'Ali Ben Salah' });
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
