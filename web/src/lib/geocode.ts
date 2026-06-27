import type { LatLng } from '../types';

// Free geocoding via OpenStreetMap Nominatim. Be polite: low volume, debounced.
// https://nominatim.org/release-docs/develop/api/Search/
const NOMINATIM = 'https://nominatim.openstreetmap.org';

export interface GeocodeResult extends LatLng {
  label: string;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
}

export async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const places = (await res.json()) as NominatimPlace[];
  return places.map((p) => ({
    label: p.display_name,
    lat: Number.parseFloat(p.lat),
    lng: Number.parseFloat(p.lon),
  }));
}

export async function reverseGeocode(
  point: LatLng,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}`;
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const place = (await res.json()) as { display_name?: string };
    return place.display_name ?? null;
  } catch {
    return null;
  }
}
