import type { DriverCancelReason, DriverRatingTag, TripStage } from '@depanini/shared';

import { formatTnd } from '@/features/trip/money';

/** User-facing text of the driver app, in one place until localization (Phase 9). */
export const driverStrings = {
  homeTitle: 'Requests',
  online: 'Online',
  offline: 'Offline',
  onlineSwitch: 'Online',
  locationDenied:
    'Location access is needed to go online. Allow it in your settings and try again.',
  locationUnavailable: 'Could not read your location. Try again.',
  offlineState: 'Go online to see requests',
  requestCancelledNotice: 'The customer cancelled that request.',
  dismissNotice: 'Dismiss',
  loading: 'Looking for requests…',
  loadFailed: 'Could not load requests. Retrying…',
  empty: 'No requests nearby right now',

  testLocationTitle: 'Test location',
  testLocationUsingGps: 'Using: device GPS',
  testLocationUsing: (where: string) => `Using: ${where} (test)`,
  setOnMap: 'Set on map',
  useDeviceGps: 'Use device GPS',
  confirmTestLocation: 'Use this location',
  findingAddress: 'Finding the address…',
  outsideTunisia: 'Move the pin to a place in Tunisia.',

  distanceToPickup: (m: number) => `${(m / 1000).toFixed(1)} km away`,
  route: (pickup: string, dropoff: string) => `${pickup} → ${dropoff}`,
  timeLeft: (time: string) => `${time} left`,
  offerSent: 'Offer sent',
  viewRequest: 'View request',

  detailsTitle: 'Request',
  notFound: 'This request is no longer available.',
  backToRequests: 'Back to requests',
  pickupLabel: 'Pickup',
  dropoffLabel: 'Drop-off',
  towDistance: (m: number) => `Tow distance: ${(m / 1000).toFixed(1)} km`,
  customerFare: 'Customer fare',
  fareRange: (minFare: number, maxFare: number) => `Allowed range: ${minFare} to ${maxFare} TND`,

  acceptFor: (fare: number) => `Accept for ${fare} TND`,
  counterOffer: 'Or make a counter-offer',
  sendOffer: 'Send offer',
  sendFailed: 'Could not send your offer. Try again.',
  fareRejected: 'That fare is not allowed for this request. Check the range and try again.',
  offerPending: 'Offer sent',
  offerFare: (fare: number) => `Your offer: ${fare} TND`,
  offerExpiresIn: (time: string) => `Expires in ${time}`,
  withdraw: 'Withdraw offer',
  withdrawFailed: 'Could not withdraw your offer. Try again.',
  offerRejected: 'The customer chose another driver',
  offerExpired: 'Your offer expired',
  offerWithdrawn: 'You withdrew your offer',
  offerDeclined: 'The customer declined your offer',

  jobTitle: 'Job',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  jobCard: 'Current job',
  jobCardAction: 'View job',
  jobLoading: 'Loading your job…',
  jobLoadFailed: 'Could not load your job. Retrying…',
  noJob: 'You have no job right now.',
  backToHome: 'Back to requests',
  customerLabel: 'Customer',
  callCustomer: (name: string) => `Call ${name}`,
  agreedFare: 'Agreed fare',
  cancelJob: 'Cancel job',
  cancelJobTitle: 'Cancel this job?',
  cancelJobMessage: 'The customer will be told you are not coming.',
  keepJob: 'Keep job',
  cancelJobFailed: 'Could not cancel the job. Try again.',

  cancelReasonLabel: 'Why are you cancelling?',
  cancelReasonRequired: 'Pick a reason to cancel.',
  cancelReasons: {
    vehicle_not_there: 'Vehicle not there',
    customer_unreachable: 'Customer unreachable',
    unsafe: 'Unsafe situation',
    truck_problem: 'Truck problem',
    other: 'Other',
  } satisfies Record<DriverCancelReason, string>,

  /** The primary button for each stage: what the driver does next. */
  nextStep: {
    accepted: 'Start driving',
    en_route: "I've arrived",
    arrived: 'Vehicle loaded',
    towing: 'Dropped off',
  } satisfies Record<TripStage, string>,
  /** The last step's button: the drop-off that also confirms the cash. */
  droppedOffCash: (fare: number) => `Dropped off · cash received ${formatTnd(fare)}`,
  stageConflict: 'The job has changed. We refreshed it, check the next step.',
  stageFailed: 'Could not update the job. Try again.',
  completeFailed: 'Could not finish the job. Try again.',
  confirmDropoffTitle: 'Vehicle dropped off?',
  confirmDropoffMessage: (fare: number) =>
    `Confirm you received ${formatTnd(fare)} in cash from the customer. This ends the job.`,
  confirmDropoff: 'Yes, dropped off',
  notYet: 'Not yet',

  collectInCash: 'Collect in cash',
  /** The stage bar's labels, in order. */
  stageBar: ['Accepted', 'On the way', 'Arrived', 'Towing', 'Done'],
  /** The navigation banner: what the driver is heading for, by stage. */
  navTarget: {
    accepted: 'to pickup',
    en_route: 'to pickup',
    arrived: 'at pickup',
    towing: 'to drop-off',
  } satisfies Record<TripStage, string>,
  navDistance: (m: number) =>
    m < 995 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`,
  cashReceived: 'Cash received',

  timelineTitle: 'Trip',
  timeline: {
    assigned: 'Accepted',
    enRoute: 'On the way',
    arrived: 'Arrived',
    towing: 'Towing',
    completed: 'Completed',
  },
  /** Local time of day, e.g. "10:05". */
  time: (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

  summaryTitle: 'Job done',
  summaryHeading: 'Trip complete',
  summaryRoute: 'Route',
  receiptNo: 'Receipt no.',

  myJobs: 'My jobs',
  myJobsTitle: 'My jobs',
  myJobsEmpty: 'No finished jobs yet.',
  myJobsFailed: 'Could not load your jobs. Check your connection and try again.',
  loadMore: 'Load more',
  retry: 'Try again',
  viewJob: 'View job',
  jobDetailTitle: 'Trip',
  jobNotFound: 'This trip is not available.',

  earnings: 'Earnings',
  earningsTitle: 'Earnings',
  earningsFailed: 'Could not load your earnings. Check your connection and try again.',
  earningsPeriods: { today: 'Today', week: 'This week', month: 'This month' },
  trips: (n: number) => (n === 1 ? '1 trip' : `${n} trips`),

  /** What the driver can say about the customer, by tag id. */
  customerTagLabels: {
    clear_location: 'Clear location',
    ready_on_time: 'Ready on time',
    friendly: 'Friendly',
    wrong_location: 'Wrong location',
    made_me_wait: 'Made me wait',
    rude: 'Rude',
  } satisfies Record<DriverRatingTag, string>,
};
