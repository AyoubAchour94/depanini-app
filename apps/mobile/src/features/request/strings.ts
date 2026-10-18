/** User-facing text of the request flow, in one place until localization (Phase 9). */
export const requestStrings = {
  requestTow: 'Request a tow',
  pickupTitle: 'Pickup',
  locating: 'Finding your location…',
  findingAddress: 'Finding the address…',
  addressUnavailable: 'Address unavailable, using the pin position.',
  outsideTunisia: 'Move the pin to a place in Tunisia.',
  locationDenied:
    'Location access is off, so the map starts in Tunis. Move it to where your vehicle is.',
  locationUnavailable:
    'Could not find your location, so the map starts in Tunis. Move it to where your vehicle is.',
  confirmPickup: 'Confirm pickup',
  pickupLabel: 'Pickup point',
} as const;
