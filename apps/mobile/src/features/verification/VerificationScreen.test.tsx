import { RATE_LIMITED, UPLOAD_LIMIT_REACHED } from '@depanini/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { pickPdf, pickPhoto } from './pickers';
import { VerificationScreen } from './VerificationScreen';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { apiUrl: 'http://api.test', environment: 'dev' },
}));
jest.mock('./pickers');

const photo = { file: { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' } };
const pdf = { file: { uri: 'file:///doc.pdf', name: 'document.pdf', type: 'application/pdf' } };

const KINDS = ['licence', 'registration', 'insurance', 'national_id'] as const;

let documents: { id: string; kind: string; page: number }[] = [];
let status = 'unsubmitted';
let rejectionReason: string | null = null;
let nextId = 1;
/** Status codes the next upload/submit/delete answers with, when set. */
let failUpload: number | null = null;
let failSubmit: number | null = null;
let failDelete: number | null = null;
/** The body of a failed upload. */
let failBody: object = {};

const uuid = (n: number) => `0b8e3f3e-6a52-4a39-9b1c-${String(n).padStart(12, '0')}`;

function verificationBody() {
  return {
    status,
    rejectionReason,
    documents: documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      page: d.page,
      contentType: 'image/jpeg',
      sizeBytes: 1_200_000,
      createdAt: '2026-01-01T10:00:00.000Z',
    })),
    missingKinds: KINDS.filter((kind) => !documents.some((d) => d.kind === kind)),
  };
}

/** Fakes the API and records the calls as `METHOD path`. */
function mockApi() {
  const calls: { call: string; body?: unknown }[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? 'GET';
    calls.push({ call: `${method} ${path}`, body: init?.body });
    if (path === '/driver/verification') return Response.json(verificationBody());
    if (path === '/driver/documents') {
      if (failUpload) return Response.json(failBody, { status: failUpload });
      const form = init?.body as FormData;
      const kind = String(form.get('kind'));
      const page = documents.filter((d) => d.kind === kind).length + 1;
      const id = uuid(nextId++);
      documents.push({ id, kind, page });
      return Response.json(
        {
          id,
          kind,
          page,
          contentType: 'image/jpeg',
          sizeBytes: 1_200_000,
          createdAt: '2026-01-01T10:00:00.000Z',
        },
        { status: 201 },
      );
    }
    if (path.startsWith('/driver/documents/')) {
      if (failDelete) return new Response('{}', { status: failDelete });
      documents = documents.filter((d) => d.id !== path.split('/').pop());
      return new Response(null, { status: 204 });
    }
    if (path === '/driver/verification/submit') {
      if (failSubmit) return new Response('{}', { status: failSubmit });
      status = 'pending';
      rejectionReason = null;
      return Response.json(verificationBody());
    }
    return new Response('{}', { status: 404 });
  });
  return { calls: (name: string) => calls.filter((c) => c.call === name) };
}

async function renderScreen() {
  const queryClient = createTestQueryClient();
  return await render(
    <QueryClientProvider client={queryClient}>
      <VerificationScreen />
    </QueryClientProvider>,
  );
}

const withAll = (kinds: readonly string[] = KINDS) =>
  kinds.map((kind, i) => ({ id: uuid(100 + i), kind, page: 1 }));

beforeEach(() => {
  documents = [];
  status = 'unsubmitted';
  rejectionReason = null;
  nextId = 1;
  failUpload = failSubmit = failDelete = null;
  failBody = {};
  jest.mocked(pickPhoto).mockResolvedValue(photo as never);
  jest.mocked(pickPdf).mockResolvedValue(pdf as never);
});
afterEach(() => jest.restoreAllMocks());

const press = async (name: string) => {
  await fireEvent.press(await screen.findByRole('button', { name }));
};

describe('kind rows', () => {
  it('shows each kind as missing, uploaded with its page count', async () => {
    documents = [
      { id: uuid(1), kind: 'licence', page: 1 },
      { id: uuid(2), kind: 'licence', page: 2 },
      { id: uuid(3), kind: 'insurance', page: 1 },
    ];
    mockApi();
    await renderScreen();

    expect(await screen.findByText('Uploaded (2 pages)')).toBeOnTheScreen();
    expect(screen.getByText('Uploaded (1 page)')).toBeOnTheScreen();
    expect(screen.getAllByText('Missing')).toHaveLength(2);
    expect(screen.getByText("Driver's licence")).toBeOnTheScreen();
    expect(screen.getByText('National ID (CIN)')).toBeOnTheScreen();
  });

  it('shows the rejection reason and keeps the rows editable', async () => {
    documents = withAll();
    status = 'rejected';
    rejectionReason = 'The insurance is expired';
    mockApi();
    await renderScreen();

    expect(await screen.findByText('Rejected: The insurance is expired')).toBeOnTheScreen();
    expect(screen.getAllByText('Rejected (1 page)')).toHaveLength(4);
    expect(screen.getByLabelText("Add PDF: Driver's licence")).toBeOnTheScreen();
  });

  it('shows "Under review" and no edit controls while pending', async () => {
    documents = withAll();
    status = 'pending';
    mockApi();
    await renderScreen();

    expect(await screen.findByText(/^Under review/)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Add PDF: Driver's licence")).toBeNull();
    expect(screen.queryByLabelText('Remove page 1', { exact: false })).toBeNull();
    expect(screen.queryByText('Submit for review')).toBeNull();
  });

  it('shows the approved state', async () => {
    documents = withAll();
    status = 'approved';
    mockApi();
    await renderScreen();

    expect(await screen.findByText('Approved. You can go online.')).toBeOnTheScreen();
    expect(screen.queryByText('Submit for review')).toBeNull();
  });
});

describe('uploading', () => {
  it('uploads a library photo and shows the new page', async () => {
    const api = mockApi();
    await renderScreen();

    await press("Choose photo: Driver's licence");

    expect(pickPhoto).toHaveBeenCalledWith('library');
    expect(await screen.findByText('Uploaded (1 page)')).toBeOnTheScreen();
    const [upload] = api.calls('POST /driver/documents');
    const form = upload!.body as FormData;
    expect(form.get('kind')).toBe('licence');
  });

  it('takes a photo with the camera', async () => {
    mockApi();
    await renderScreen();

    await press('Take photo: Insurance certificate');

    expect(pickPhoto).toHaveBeenCalledWith('camera');
    expect(await screen.findByText('Uploaded (1 page)')).toBeOnTheScreen();
  });

  it('uploads a PDF', async () => {
    const api = mockApi();
    await renderScreen();

    await press('Add PDF: National ID (CIN)');

    expect(pickPdf).toHaveBeenCalled();
    expect(await screen.findByText('Uploaded (1 page)')).toBeOnTheScreen();
    expect(api.calls('POST /driver/documents')).toHaveLength(1);
  });

  it.each([
    ['tooLarge', 'That file is too large. Use a file of 5 MB at most.'],
    ['wrongType', 'That file type is not accepted. Use a JPEG or PNG photo, or a PDF.'],
    ['denied', /^Camera access is needed/],
  ] as const)('explains a picker problem: %s', async (error, message) => {
    jest.mocked(pickPhoto).mockResolvedValue({ error });
    const api = mockApi();
    await renderScreen();

    await press("Choose photo: Driver's licence");

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(api.calls('POST /driver/documents')).toHaveLength(0);
  });

  it('says nothing when the picker is cancelled', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ error: 'cancelled' });
    const api = mockApi();
    await renderScreen();

    await press("Choose photo: Driver's licence");

    expect(api.calls('POST /driver/documents')).toHaveLength(0);
    expect(screen.queryByText(/too large|not accepted|Could not/)).toBeNull();
  });

  it.each([
    [413, 'That file is too large. Use a file of 5 MB at most.'],
    [415, 'That file type is not accepted. Use a JPEG or PNG photo, or a PDF.'],
    [500, 'Could not upload that file. Try again.'],
  ])('explains an upload the API refused with %s', async (code, message) => {
    failUpload = code;
    mockApi();
    await renderScreen();

    await press("Choose photo: Driver's licence");

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.getAllByText('Missing')).toHaveLength(4);
  });

  it.each([
    [
      UPLOAD_LIMIT_REACHED,
      'You have uploaded a lot of files in a short time. Wait a while, then try again.',
    ],
    [RATE_LIMITED, 'Too many attempts. Wait a moment, then try again.'],
  ])('explains a 429 with code %s', async (code, message) => {
    failUpload = 429;
    failBody = { statusCode: 429, code, message: 'Too many' };
    mockApi();
    await renderScreen();

    await press("Choose photo: Driver's licence");

    expect(await screen.findByText(message)).toBeOnTheScreen();
  });
});

describe('removing a page', () => {
  it('removes a page while editable', async () => {
    documents = [{ id: uuid(1), kind: 'licence', page: 1 }];
    const api = mockApi();
    await renderScreen();

    await press("Remove page 1: Driver's licence");

    expect(await screen.findAllByText('Missing')).toHaveLength(4);
    expect(api.calls(`DELETE /driver/documents/${uuid(1)}`)).toHaveLength(1);
  });

  it('explains a failed removal', async () => {
    documents = [{ id: uuid(1), kind: 'licence', page: 1 }];
    failDelete = 409;
    mockApi();
    await renderScreen();

    await press("Remove page 1: Driver's licence");

    expect(
      await screen.findByText('Your documents are under review, so they cannot be changed.'),
    ).toBeOnTheScreen();
  });
});

describe('submitting', () => {
  it('is disabled until every kind has a page', async () => {
    documents = withAll(['licence', 'registration', 'insurance']);
    const api = mockApi();
    await renderScreen();

    const submit = await screen.findByRole('button', { name: 'Submit for review' });
    expect(submit).toBeDisabled();
    fireEvent.press(submit);
    expect(api.calls('POST /driver/verification/submit')).toHaveLength(0);

    await press('Add PDF: National ID (CIN)');
    expect(await screen.findByRole('button', { name: 'Submit for review' })).toBeEnabled();
  });

  it('submits and then shows the review state', async () => {
    documents = withAll();
    const api = mockApi();
    await renderScreen();

    await press('Submit for review');

    expect(await screen.findByText(/^Under review/)).toBeOnTheScreen();
    expect(api.calls('POST /driver/verification/submit')).toHaveLength(1);
  });

  it('explains a failed submit', async () => {
    documents = withAll();
    failSubmit = 500;
    mockApi();
    await renderScreen();

    await press('Submit for review');

    expect(
      await screen.findByText('Could not submit your documents. Try again.'),
    ).toBeOnTheScreen();
  });

  it('takes a rejected driver through re-upload and resubmit', async () => {
    documents = withAll();
    status = 'rejected';
    rejectionReason = 'Blurry photo';
    mockApi();
    await renderScreen();

    expect(await screen.findByText('Rejected: Blurry photo')).toBeOnTheScreen();
    await press("Remove page 1: Driver's licence");
    expect(await screen.findByText('Missing')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled();

    await press("Choose photo: Driver's licence");
    await screen.findAllByText('Rejected (1 page)');
    await press('Submit for review');

    expect(await screen.findByText(/^Under review/)).toBeOnTheScreen();
    expect(screen.queryByText(/Rejected/)).toBeNull();
  });
});

describe('loading', () => {
  it('offers a retry when the documents do not load', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await renderScreen();

    expect(await screen.findByText(/^Could not load your documents/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});
