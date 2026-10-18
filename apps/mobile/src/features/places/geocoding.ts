import type { LatLng, Place } from '@depanini/shared';
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

/** Places matching a text query, nearest to `proximity` first. */
export async function searchPlaces(
  query: string,
  proximity: LatLng | undefined,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const url = endpoint(
    'forward',
    {
      q: query,
      limit: '5',
      autocomplete: 'true',
      ...(proximity ? { proximity: `${proximity.longitude},${proximity.latitude}` } : {}),
    },
    accessToken,
  );
  const features = await request(url, signal);
  return features.flatMap((feature) => {
    const address = addressOf(feature);
    const [longitude, latitude] = feature.geometry.coordinates;
    return address ? [{ latitude, longitude, address }] : [];
  });
}
