import { haversineM, TUNISIA_BOUNDS, type LatLng, type Place } from '@depanini/shared';
import { z } from 'zod';

const GEOCODING_URL = 'https://api.mapbox.com/search/geocode/v6';

/** Mapbox answered with an error status or a body we don't understand. */
export class GeocodingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}

const responseSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({
        name: z.string().optional(),
        full_address: z.string().optional(),
        place_formatted: z.string().optional(),
      }),
    }),
  ),
});

type Feature = z.infer<typeof responseSchema>['features'][number];

/** Searches only Tunisia, answering in French (the language of local street names). */
function endpoint(path: string, params: Record<string, string>, accessToken: string): URL {
  const url = new URL(`${GEOCODING_URL}/${path}`);
  const all = { ...params, country: 'tn', language: 'fr', access_token: accessToken };
  for (const [key, value] of Object.entries(all)) url.searchParams.set(key, value);
  return url;
}

async function request(url: URL, signal?: AbortSignal): Promise<Feature[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new GeocodingError('Geocoding request failed', response.status);
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new GeocodingError('Unexpected geocoding response');
  return parsed.data.features;
}

/** The longest address a Place accepts (`placeSchema`). */
const MAX_ADDRESS_LENGTH = 200;

function addressOf({ properties }: Feature): string | null {
  const parts = [properties.name, properties.place_formatted].filter(Boolean);
  const address = properties.full_address || parts.join(', ');
  return address ? address.slice(0, MAX_ADDRESS_LENGTH) : null;
}

/** The address at a coordinate, as a Place at that same coordinate; null when Mapbox knows none. */
export async function reverseGeocode(
  { latitude, longitude }: LatLng,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Place | null> {
  const url = endpoint(
    'reverse',
    { latitude: String(latitude), longitude: String(longitude), limit: '1' },
    accessToken,
  );
  const [feature] = await request(url, signal);
  const address = feature ? addressOf(feature) : null;
  return address ? { latitude, longitude, address } : null;
}

/** A search result: the Place plus what the list needs to tell look-alike names apart. */
export interface PlaceSuggestion {
  place: Place;
  /** Locality and region ("Tunis, Tunisie"), when Mapbox gave one. */
  secondary?: string;
  /** Straight-line distance from the search's `proximity`, in km. */
  distanceKm?: number;
}

/** Results further than this from the pickup are listed after the closer ones. */
export const NEARBY_RADIUS_KM = 150;

/** `minLng,minLat,maxLng,maxLat`, the order Mapbox expects. */
const TUNISIA_BBOX = [
  TUNISIA_BOUNDS.minLongitude,
  TUNISIA_BOUNDS.minLatitude,
  TUNISIA_BOUNDS.maxLongitude,
  TUNISIA_BOUNDS.maxLatitude,
].join(',');

/** Nearby results first, then the rest; Mapbox's order is kept inside each group. */
export function nearbyFirst(suggestions: PlaceSuggestion[]): PlaceSuggestion[] {
  const isFar = ({ distanceKm }: PlaceSuggestion) => (distanceKm ?? 0) > NEARBY_RADIUS_KM;
  return [...suggestions.filter((s) => !isFar(s)), ...suggestions.filter(isFar)];
}

/** Places matching a text query within Tunisia, ranked toward `proximity`. */
export async function searchPlaces(
  query: string,
  proximity: LatLng | undefined,
  accessToken: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const url = endpoint(
    'forward',
    {
      q: query,
      limit: '5',
      autocomplete: 'true',
      bbox: TUNISIA_BBOX,
      ...(proximity ? { proximity: `${proximity.longitude},${proximity.latitude}` } : {}),
    },
    accessToken,
  );
  const features = await request(url, signal);
  const suggestions = features.flatMap((feature): PlaceSuggestion[] => {
    const address = addressOf(feature);
    if (!address) return [];
    const [longitude, latitude] = feature.geometry.coordinates;
    const place = { latitude, longitude, address };
    return [
      {
        place,
        secondary: feature.properties.place_formatted,
        distanceKm: proximity && Math.round(haversineM(proximity, place) / 1000),
      },
    ];
  });
  return nearbyFirst(suggestions);
}
