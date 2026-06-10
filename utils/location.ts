export interface GeoCoords {
  latitude: number;
  longitude: number;
}

export interface GeocodedPlace {
  name: string;
  coords: GeoCoords;
  timezone?: string; // IANA timezone string e.g. "America/New_York"
  savedAt?: number;  // Unix ms timestamp of when this location was saved
}

const NOMINATIM_HEADERS = {
  'User-Agent': 'AstroWatch/1.0 (https://github.com/YOUR_USERNAME/astrowatch)',
};

const FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

function buildName(addr: any, namedetails: any, displayName: string | undefined, fallback: string): string {
  const city = addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.county ?? '';
  const state = addr.state ?? '';
  const stateAbbr = addr['ISO3166-2-lvl4']?.split('-')[1] ?? state;
  const country = addr.country_code?.toUpperCase() ?? '';
  const countryName = addr.country ?? '';

  // Structured address fields — most precise and always Latin-script-friendly
  if (city && stateAbbr && country === 'US') return `${city}, ${stateAbbr}`;
  if (city && countryName) return `${city}, ${countryName}`;
  if (city && state) return `${city}, ${state}`;
  if (city) return city;

  // English name from namedetails, then any bare name field
  const enName: string | undefined = namedetails?.['name:en'];
  if (enName) return enName;
  if (namedetails?.name) return namedetails.name;

  // display_name last — may contain local script for some regions
  return displayName ?? fallback;
}

export async function searchPlaces(query: string): Promise<GeocodedPlace[]> {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(query)}` +
    `&format=json&addressdetails=1&namedetails=1&accept-language=en&limit=5`;
  const res = await fetchWithTimeout(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error('Search failed');
  const results: any[] = await res.json();
  return results.map((r) => ({
    name: buildName(r.address ?? {}, r.namedetails ?? {}, r.display_name, `${r.lat}, ${r.lon}`),
    coords: { latitude: parseFloat(r.lat), longitude: parseFloat(r.lon) },
  }));
}

export async function reverseGeocode(lat: number, lon: number): Promise<GeocodedPlace> {
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse` +
        `?lat=${lat}&lon=${lon}&format=json&addressdetails=1&namedetails=1&accept-language=en`,
      { headers: NOMINATIM_HEADERS },
    );
    if (!res.ok) throw new Error('failed');
    const data = await res.json();
    const name = buildName(
      data.address ?? {},
      data.namedetails ?? {},
      data.display_name,
      `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
    );
    return { name, coords: { latitude: lat, longitude: lon } };
  } catch {
    return { name: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`, coords: { latitude: lat, longitude: lon } };
  }
}

export async function fetchTimezone(lat: number, lon: number): Promise<string | undefined> {
  try {
    const res = await fetchWithTimeout(
      `https://timeapi.io/api/timezone/coordinate?latitude=${lat}&longitude=${lon}`,
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.timeZone ?? undefined;
  } catch {
    return undefined;
  }
}
