import type {
  AuditoriumConfig,
  CityRecord,
  SeatMapProviderType,
  SeatStatus,
} from '../domain/types';
import {
  attachAuditoriumToCinema,
  SUPPORTED_CITIES,
} from '../data/cinemas';

const CITY_STORAGE_KEY = 'fovo_selected_city_v1';
const CUSTOM_AUDI_STORAGE_KEY = 'fovo_custom_auditoriums_v1';

export type LocationPermissionState =
  | 'idle'
  | 'locating'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'error';

export interface UserLocationSnapshot {
  status: LocationPermissionState;
  coordinates: { lat: number; lng: number } | null;
  resolvedCity: CityRecord;
  errorMessage?: string | null;
}

/** Great-circle Haversine distance in kilometres. */
export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return Number((2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(1));
}

export function slugifyCityId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'custom-city'
  );
}

export function findMatchingSupportedCity(
  nameOrId: string,
  coords?: { lat: number; lng: number },
): CityRecord | null {
  const q = nameOrId.trim().toLowerCase();
  for (const c of SUPPORTED_CITIES) {
    if (
      c.id.toLowerCase() === q ||
      c.name.toLowerCase() === q ||
      (c.alternateName && c.alternateName.toLowerCase() === q)
    ) {
      return c;
    }
  }
  if (coords) {
    let closest: CityRecord | null = null;
    let minKm = Infinity;
    for (const c of SUPPORTED_CITIES) {
      const km = haversineDistanceKm(coords, c.coordinates);
      if (km < minKm) {
        minKm = km;
        closest = c;
      }
    }
    if (closest && minKm <= 32) {
      return closest;
    }
  }
  return null;
}

export function loadPersistedCity(): CityRecord {
  if (typeof window === 'undefined') return SUPPORTED_CITIES[0];
  try {
    const raw = window.localStorage.getItem(CITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CityRecord;
      if (parsed && parsed.id && parsed.name && parsed.coordinates) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  // Default to Bengaluru (or Hubballi pilot)
  return SUPPORTED_CITIES[0];
}

export function savePersistedCity(city: CityRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(city));
  } catch {
    // ignore storage errors
  }
}

interface PersistedCustomAudiEntry {
  cinemaId: string;
  config: AuditoriumConfig;
  providerType: SeatMapProviderType;
  availability?: Record<string, SeatStatus>;
}

export function hydratePersistedAuditoriums(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(CUSTOM_AUDI_STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as PersistedCustomAudiEntry[];
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      if (e && e.cinemaId && e.config) {
        attachAuditoriumToCinema(e.cinemaId, e.config, e.providerType, e.availability);
      }
    }
  } catch {
    // ignore
  }
}

export function savePersistedAuditorium(
  cinemaId: string,
  config: AuditoriumConfig,
  providerType: SeatMapProviderType,
  availability?: Record<string, SeatStatus>,
): void {
  attachAuditoriumToCinema(cinemaId, config, providerType, availability);
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(CUSTOM_AUDI_STORAGE_KEY);
    const list: PersistedCustomAudiEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(list)
      ? list.filter((x) => !(x.cinemaId === cinemaId && x.config?.id === config.id))
      : [];
    filtered.push({ cinemaId, config, providerType, availability });
    window.localStorage.setItem(CUSTOM_AUDI_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

/**
 * Reverse geocodes { lat, lng } into a CityRecord using our server endpoint
 * `/api/places/reverse` with automatic browser fallback to OpenStreetMap Nominatim.
 */
export async function reverseGeocodeCoordinates(
  lat: number,
  lng: number,
): Promise<CityRecord> {
  const nearestPreset = findMatchingSupportedCity('', { lat, lng });

  try {
    const res = await fetch(`/api/places/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.city) {
        const matched = findMatchingSupportedCity(data.city, { lat, lng });
        if (matched) return matched;
        return {
          id: slugifyCityId(data.city),
          name: data.city,
          state: data.state || '',
          country: data.country || 'India',
          countryCode: data.countryCode || 'IN',
          coordinates: { lat, lng },
          isPrimaryMarket: false,
        };
      }
    }
  } catch {
    // Fall through to direct Nominatim reverse geocoding
  }

  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&accept-language=en`,
    );
    if (nomRes.ok) {
      const nom = await nomRes.json();
      const addr = nom.address || {};
      const cityName =
        addr.city ||
        addr.town ||
        addr.municipality ||
        addr.county ||
        addr.state_district ||
        nearestPreset?.name ||
        'Detected City';
      const matched = findMatchingSupportedCity(cityName, { lat, lng });
      if (matched) return matched;
      return {
        id: slugifyCityId(cityName),
        name: cityName,
        state: addr.state || '',
        country: addr.country || 'India',
        countryCode: (addr.country_code || 'in').toUpperCase(),
        coordinates: { lat, lng },
        isPrimaryMarket: false,
      };
    }
  } catch {
    // Ignore network error
  }

  return (
    nearestPreset ?? {
      id: `loc-${lat.toFixed(2)}-${lng.toFixed(2)}`,
      name: 'Nearby Location',
      state: 'Karnataka',
      country: 'India',
      countryCode: 'IN',
      coordinates: { lat, lng },
      isPrimaryMarket: false,
    }
  );
}

/**
 * Searches cities by name across SUPPORTED_CITIES and live geocoding so users
 * can explore cinemas in any Indian or international city.
 */
export async function searchCitiesByName(query: string): Promise<CityRecord[]> {
  const q = query.trim().toLowerCase();
  if (!q) return SUPPORTED_CITIES;

  const localMatches = SUPPORTED_CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q) ||
      (c.alternateName && c.alternateName.toLowerCase().includes(q)),
  );

  if (q.length < 2) return localMatches;

  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&featuretype=city&addressdetails=1&limit=6&accept-language=en`;
    const res = await fetch(nomUrl);
    if (res.ok) {
      const items = (await res.json()) as Array<{
        name?: string;
        display_name?: string;
        lat?: string;
        lon?: string;
        address?: Record<string, string>;
      }>;
      const seen = new Set(localMatches.map((c) => c.id));
      for (const item of items) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const addr = item.address || {};
        const name =
          item.name ||
          addr.city ||
          addr.town ||
          addr.state_district ||
          (item.display_name ? item.display_name.split(',')[0] : '');
        if (!name) continue;
        const existingPreset = findMatchingSupportedCity(name, { lat, lng });
        const cityRec: CityRecord = existingPreset ?? {
          id: slugifyCityId(name),
          name,
          state: addr.state || '',
          country: addr.country || 'India',
          countryCode: (addr.country_code || 'in').toUpperCase(),
          coordinates: { lat, lng },
          isPrimaryMarket: false,
        };
        if (!seen.has(cityRec.id)) {
          seen.add(cityRec.id);
          localMatches.push(cityRec);
        }
      }
    }
  } catch {
    // Return local matches if offline
  }

  return localMatches;
}

/**
 * Requests user location via the Browser Geolocation API ONLY when invoked by user action.
 * Never blocks the app or loops on permission denial.
 */
export function requestUserGeolocation(): Promise<{
  status: LocationPermissionState;
  coordinates: { lat: number; lng: number } | null;
  city: CityRecord | null;
  errorMessage: string | null;
}> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve({
      status: 'unavailable',
      coordinates: null,
      city: null,
      errorMessage: 'Browser Geolocation API is not supported on this device.',
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const city = await reverseGeocodeCoordinates(lat, lng);
        savePersistedCity(city);
        resolve({
          status: 'granted',
          coordinates: { lat, lng },
          city,
          errorMessage: null,
        });
      },
      (err) => {
        if (err.code === 1) {
          resolve({
            status: 'denied',
            coordinates: null,
            city: null,
            errorMessage:
              'Location permission was declined. You can manually select or search any city below.',
          });
        } else {
          resolve({
            status: 'unavailable',
            coordinates: null,
            city: null,
            errorMessage:
              'Could not determine current GPS coordinates. Select any city manually to explore cinemas.',
          });
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 10 * 60 * 1000,
      },
    );
  });
}
