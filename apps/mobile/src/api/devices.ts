import type { DeviceInput } from '@depanini/shared';
import { z } from 'zod';

import { apiRequest } from './client';

/** `PUT /me/devices`: this install's push token (a token moving to another account is reassigned). */
export function putDevice(input: DeviceInput): Promise<void> {
  return apiRequest('/me/devices', z.undefined(), { method: 'PUT', json: input });
}

/** `DELETE /me/devices/:token`: stops pushes to this install for the caller. */
export function deleteDevice(token: string): Promise<void> {
  return apiRequest(`/me/devices/${encodeURIComponent(token)}`, z.undefined(), {
    method: 'DELETE',
  });
}
