import {
  type DocumentKind,
  type DriverDocument,
  driverDocumentSchema,
  type Verification,
  verificationSchema,
} from '@depanini/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { z } from 'zod';

import { usePollMs } from '@/realtime/status';

import { apiRequest, setDriverNotApprovedHandler } from './client';

/** How often a pending verification is re-read while the home screen is showing. */
export const VERIFICATION_POLL_MS = 15_000;

export const VERIFICATION_KEY = ['driver', 'verification'] as const;

/** A file ready to upload, from the pickers in `features/verification/pickers.ts`. */
export interface UploadFile {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png' | 'application/pdf';
}

/**
 * `GET /driver/verification`: the driver's documents and where the check stands.
 * Only fetches while `enabled`; polls while `poll` is set and the check is pending.
 */
export function useVerification({
  enabled = true,
  poll = false,
}: { enabled?: boolean; poll?: boolean } = {}) {
  const pollMs = usePollMs(VERIFICATION_POLL_MS);
  return useQuery({
    queryKey: VERIFICATION_KEY,
    queryFn: ({ signal }): Promise<Verification> =>
      apiRequest('/driver/verification', verificationSchema, { signal }),
    enabled,
    // The admin decides while the app is open; keep looking only while a decision is pending.
    refetchInterval: (query) => (poll && query.state.data?.status === 'pending' ? pollMs : false),
  });
}

/**
 * Reads the verification state again whenever any API call fails with
 * `403 driver_not_approved`, so the driver app notices it lost (or never had) approval.
 * Mount once, inside the `QueryClientProvider`.
 */
export function useRefetchVerificationWhenNotApproved() {
  const queryClient = useQueryClient();
  useEffect(() => {
    setDriverNotApprovedHandler(
      () => void queryClient.invalidateQueries({ queryKey: VERIFICATION_KEY }),
    );
    return () => setDriverNotApprovedHandler(undefined);
  }, [queryClient]);
}

/** The multipart body of `POST /driver/documents`: the kind and one file. */
async function uploadBody(kind: DocumentKind, file: UploadFile): Promise<FormData> {
  const form = new FormData();
  form.append('kind', kind);
  if (Platform.OS === 'web') {
    // The browser has no file paths; picked files are blob or data URLs it can read back.
    const blob = await (await fetch(file.uri)).blob();
    form.append('file', new Blob([blob], { type: file.type }), file.name);
  } else {
    // React Native reads the file from the URI when the form is sent.
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  return form;
}

/**
 * `POST /driver/documents`: adds one page. Fails with an `ApiError`: 413 for a file over
 * 5 MB, 415 for a type other than JPEG, PNG or PDF, 409 once the documents were submitted,
 * 429 with `code` `upload_limit_reached` past the per-driver upload limit.
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kind,
      file,
    }: {
      kind: DocumentKind;
      file: UploadFile;
    }): Promise<DriverDocument> =>
      apiRequest('/driver/documents', driverDocumentSchema, {
        method: 'POST',
        body: await uploadBody(kind, file),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: VERIFICATION_KEY }),
  });
}

/** `DELETE /driver/documents/:id`. Fails with 409 once the documents were submitted. */
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> =>
      apiRequest(`/driver/documents/${id}`, z.undefined(), { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: VERIFICATION_KEY }),
  });
}

/** `POST /driver/verification/submit`. Fails with 409 until every kind has a page. */
export function useSubmitVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<Verification> =>
      apiRequest('/driver/verification/submit', verificationSchema, { method: 'POST' }),
    onSuccess: (verification) => queryClient.setQueryData(VERIFICATION_KEY, verification),
    onSettled: () => queryClient.invalidateQueries({ queryKey: VERIFICATION_KEY }),
  });
}
