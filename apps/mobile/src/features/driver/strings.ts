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
  loading: 'Looking for requests…',
  loadFailed: 'Could not load requests. Retrying…',
  empty: 'No requests nearby right now',

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
  // Placeholder until the offer actions land (#38).
  offerActionsPlaceholder: 'Offer actions coming soon',
};
