import type { Earnings, TowRequest, TripStage } from '@depanini/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { EARNINGS_KEY, JOB_KEY, JOBS_KEY } from '@/api/driver';
import { EarningsScreen } from '@/features/driver/EarningsScreen';
import { driverStrings } from '@/features/driver/strings';
import { setLastSent } from '@/features/driver/usePresence';
import { Summary, JobScreen } from '@/features/driver/JobScreen';
import { MyJobsScreen } from '@/features/driver/MyJobsScreen';
import { THEME_PREFERENCES, useThemeSetting, type ThemePreference } from '@/theme/theme';

const TRIP_STAGES: readonly TripStage[] = ['accepted', 'en_route', 'arrived', 'towing'];

const TIMES = {
  assignedAt: '2026-10-20T09:02:00.000Z',
  enRouteAt: '2026-10-20T09:04:00.000Z',
  arrivedAt: '2026-10-20T09:15:00.000Z',
  towingAt: '2026-10-20T09:24:00.000Z',
} as const;

const PICKUP = { latitude: 36.8065, longitude: 10.1815, address: 'Avenue Habib Bourguiba 42' };
const DROPOFF = { latitude: 36.8782, longitude: 10.3247, address: 'Garage El Amen, La Marsa' };

function sampleJob(stage: TripStage) {
  return {
    id: '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f',
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: 'car',
    problemType: 'breakdown',
    note: 'Front left wheel is stuck',
    distanceM: 12_000,
    proposedFare: 80,
    suggestedFare: 85,
    expiresAt: '2026-10-20T09:30:00.000Z',
    createdAt: '2026-10-20T08:55:00.000Z',
    status: 'assigned',
    agreedFare: 85,
    tripStage: stage,
    customer: { fullName: 'Ayoub Khemiri', phone: '+21622333444' },
    ...TIMES,
    ...(stage === 'accepted' ? { enRouteAt: undefined } : {}),
    ...(stage === 'accepted' || stage === 'en_route' ? { arrivedAt: undefined } : {}),
    ...(stage !== 'towing' ? { towingAt: undefined } : {}),
  };
}

function sampleHistory(count: number) {
  const items = Array.from({ length: count }, (_, n) => ({
    ...sampleJob('towing'),
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    status: n === 2 ? 'cancelled' : 'completed',
    tripStage: null,
    agreedFare: 85 - n * 10,
    proposedFare: 80 - n * 10,
    pickup: { ...PICKUP, address: ['Avenue Habib Bourguiba', 'Rue de Marseille', 'Lac 2'][n % 3]! },
    dropoff: { ...DROPOFF, address: ['La Marsa', 'Ariana', 'Ben Arous'][n % 3]! },
    completedAt: `2026-10-${20 - n}T10:30:00.000Z`,
    payment:
      n === 2
        ? undefined
        : {
            status: n === 1 ? 'disputed' : 'driver_confirmed',
            amountTnd: 85 - n * 10,
            receiptNo: `DPN-2026-00000${n}`,
          },
  }));
  return { pages: [{ items, nextCursor: null }], pageParams: [null] };
}

const EARNINGS: Earnings = {
  today: { trips: 3, totalTnd: 240 },
  week: { trips: 14, totalTnd: 1180 },
  month: { trips: 52, totalTnd: 4350 },
};

function isPreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

function seededClient(stage: TripStage) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  client.setQueryData(JOB_KEY, sampleJob(stage));
  client.setQueryData(JOBS_KEY, sampleHistory(3));
  client.setQueryData(EARNINGS_KEY, EARNINGS);
  return client;
}

/**
 * The driver's job screens with sample data, dev builds only (`/dev/driver`),
 * for review screenshots without an API. `?screen=job|summary|earnings|history`,
 * `&stage=accepted|en_route|arrived|towing` and `&theme=light|dark|system`.
 */
export function DriverKitScreen() {
  const params = useLocalSearchParams<{ screen?: string; stage?: string; theme?: string }>();
  const stage = TRIP_STAGES.find((s) => s === params.stage) ?? 'accepted';
  const [client] = useState(() => seededClient(stage));
  const { setPreference } = useThemeSetting();
  const forced = params.theme;
  useEffect(() => {
    if (isPreference(forced)) setPreference(forced);
  }, [forced, setPreference]);
  // The truck marker and the banner's distance.
  useEffect(() => {
    // The realtime provider forgets the truck location when it sees no user, so wait for it.
    const timer = setTimeout(() => setLastSent({ latitude: 36.8, longitude: 10.17 }), 1500);
    return () => {
      clearTimeout(timer);
      setLastSent(null);
    };
  }, []);

  const finished = {
    ...sampleJob('towing'),
    status: 'completed',
    tripStage: null,
    completedAt: '2026-10-20T09:40:00.000Z',
    payment: { status: 'driver_confirmed', amountTnd: 85, receiptNo: 'DPN-2026-000007' },
  } as unknown as TowRequest;

  return (
    <QueryClientProvider client={client}>
      <Stack.Screen
        options={{
          title: { earnings: driverStrings.earningsTitle, history: driverStrings.myJobsTitle }[
            params.screen ?? ''
          ],
        }}
      />
      {params.screen === 'summary' ? (
        <Summary request={finished} />
      ) : params.screen === 'earnings' ? (
        <EarningsScreen />
      ) : params.screen === 'history' ? (
        <MyJobsScreen />
      ) : (
        <JobScreen />
      )}
    </QueryClientProvider>
  );
}
