import { GeocodingError, reverseGeocode, searchPlaces } from './geocoding';

const feature = {
  geometry: { coordinates: [10.1815, 36.8065] },
  properties: {
    name: 'Avenue Habib Bourguiba',
    full_address: 'Avenue Habib Bourguiba, Tunis, Tunisie',
  },
};

function mockFetch(body: unknown, status = 200) {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status }));
}

function requestedUrl(): URL {
  const [input] = (fetch as jest.Mock).mock.calls[0] as [URL | string];
  return new URL(input.toString());
}

afterEach(() => jest.restoreAllMocks());

describe('reverseGeocode', () => {
  it('asks Mapbox for a French address in Tunisia and maps the first feature to a Place', async () => {
    mockFetch({ features: [feature] });

    const place = await reverseGeocode({ latitude: 36.8065, longitude: 10.1815 }, 'pk.test');

    const url = requestedUrl();
    expect(url.origin + url.pathname).toBe('https://api.mapbox.com/search/geocode/v6/reverse');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      latitude: '36.8065',
      longitude: '10.1815',
      country: 'tn',
      language: 'fr',
      limit: '1',
      access_token: 'pk.test',
    });
    expect(place).toEqual({
      latitude: 36.8065,
      longitude: 10.1815,
      address: 'Avenue Habib Bourguiba, Tunis, Tunisie',
    });
  });

  it('keeps the requested coordinates, not the address point', async () => {
    mockFetch({ features: [feature] });
    const place = await reverseGeocode({ latitude: 36.81, longitude: 10.19 }, 'pk.test');
    expect(place).toMatchObject({ latitude: 36.81, longitude: 10.19 });
  });

  it('cuts addresses to the 200 characters a Place allows', async () => {
    mockFetch({ features: [{ ...feature, properties: { full_address: 'a'.repeat(250) } }] });
    const place = await reverseGeocode({ latitude: 36.8, longitude: 10.2 }, 'pk.test');
    expect(place?.address).toHaveLength(200);
  });

  it('returns null when there is no address at that spot', async () => {
    mockFetch({ features: [] });
    expect(await reverseGeocode({ latitude: 33, longitude: 9 }, 'pk.test')).toBeNull();
  });

  it('throws a GeocodingError when Mapbox answers with an error status', async () => {
    mockFetch({ message: 'Forbidden' }, 403);
    await expect(reverseGeocode({ latitude: 33, longitude: 9 }, 'pk.test')).rejects.toBeInstanceOf(
      GeocodingError,
    );
  });

  it('throws when the response has an unexpected shape', async () => {
    mockFetch({ nope: true });
    await expect(reverseGeocode({ latitude: 33, longitude: 9 }, 'pk.test')).rejects.toBeInstanceOf(
      GeocodingError,
    );
  });

  it('lets network failures through', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
    await expect(reverseGeocode({ latitude: 33, longitude: 9 }, 'pk.test')).rejects.toThrow(
      'Network request failed',
    );
  });
});

describe('searchPlaces', () => {
  it('searches near a point and maps every feature to a Place', async () => {
    mockFetch({ features: [feature] });

    const places = await searchPlaces('bourguiba', { latitude: 36.8, longitude: 10.2 }, 'pk.test');

    expect(requestedUrl().pathname).toBe('/search/geocode/v6/forward');
    expect(Object.fromEntries(requestedUrl().searchParams)).toMatchObject({
      q: 'bourguiba',
      proximity: '10.2,36.8',
      country: 'tn',
      language: 'fr',
      autocomplete: 'true',
      access_token: 'pk.test',
    });
    expect(places).toEqual([
      { latitude: 36.8065, longitude: 10.1815, address: 'Avenue Habib Bourguiba, Tunis, Tunisie' },
    ]);
  });

  it('builds an address from name and place_formatted when full_address is missing', async () => {
    mockFetch({
      features: [
        {
          geometry: { coordinates: [10, 36] },
          properties: { name: 'La Marsa', place_formatted: 'Tunis, Tunisie' },
        },
      ],
    });
    const [place] = await searchPlaces('marsa', undefined, 'pk.test');
    expect(place?.address).toBe('La Marsa, Tunis, Tunisie');
    expect(requestedUrl().searchParams.has('proximity')).toBe(false);
  });
});
