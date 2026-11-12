import {
  cinemas as seedRegistryCinemas,
  registerDiscoveredCinemas,
  type Cinema,
} from '../data/cinemas';
import type {
  BookingProviderInfo,
  CinemaDiscoverySource,
  CityRecord,
} from '../domain/types';
import { haversineDistanceKm, hydratePersistedAuditoriums, slugifyCityId } from './locationService';

export interface ProviderFeasibilityEntry {
  id: string;
  name: string;
  officialDocsUrl: string;
  accessType: 'Public Cloud API (API Key)' | 'Public Open API' | 'Partner / Operator Authorized Only' | 'Commercial B2B Evaluation / Licensed';
  authRequirements: string;
  indiaSupported: boolean;
  operatorAuthRequired: boolean;
  capabilities: {
    cinemaDirectory: boolean;
    auditoriumIds: boolean;
    sessionsAndShowtimes: boolean;
    seatLayoutGrid2D: boolean;
    physical3DCoordinates: boolean;
    liveSeatAvailability: boolean;
  };
  actualFieldsReturned: string[];
  commercialRestrictions: string;
  complexity: 'Low' | 'Medium' | 'High (Requires Exhibitor Contract)';
  statusInFovo: 'ACTIVE_LIVE' | 'ADAPTER_READY_AWAITING_KEY' | 'ADAPTER_READY_PARTNER_GATE';
}

export const PROVIDER_FEASIBILITY_REPORT: ProviderFeasibilityEntry[] = [
  {
    id: 'google_places_new',
    name: 'Google Places API (New)',
    officialDocsUrl: 'https://developers.google.com/maps/documentation/places/web-service/search-nearby',
    accessType: 'Public Cloud API (API Key)',
    authRequirements: 'X-Goog-Api-Key header + X-Goog-FieldMask header (GOOGLE_PLACES_API_KEY in server env)',
    indiaSupported: true,
    operatorAuthRequired: false,
    capabilities: {
      cinemaDirectory: true,
      auditoriumIds: false,
      sessionsAndShowtimes: false,
      seatLayoutGrid2D: false,
      physical3DCoordinates: false,
      liveSeatAvailability: false,
    },
    actualFieldsReturned: [
      'places.id (Place ID)',
      'places.displayName.text',
      'places.formattedAddress',
      'places.location (latitude, longitude)',
      'places.websiteUri',
      'places.rating / userRatingCount',
    ],
    commercialRestrictions:
      'Standard Google Cloud Maps Platform billing SKU; caching Place IDs is permitted, bulk offline scraping is prohibited.',
    complexity: 'Low',
    statusInFovo: 'ADAPTER_READY_AWAITING_KEY',
  },
  {
    id: 'osm_overpass_nominatim',
    name: 'OpenStreetMap Overpass + Nominatim API',
    officialDocsUrl: 'https://wiki.openstreetmap.org/wiki/Overpass_API',
    accessType: 'Public Open API',
    authRequirements: 'HTTP User-Agent header (no secret key required)',
    indiaSupported: true,
    operatorAuthRequired: false,
    capabilities: {
      cinemaDirectory: true,
      auditoriumIds: false,
      sessionsAndShowtimes: false,
      seatLayoutGrid2D: false,
      physical3DCoordinates: false,
      liveSeatAvailability: false,
    },
    actualFieldsReturned: [
      'elements[].id (OSM Node/Way ID)',
      'tags.name / tags.brand / tags.operator',
      'lat / lon or center.lat / center.lon',
      'tags["addr:full"] / addr:street / addr:suburb / addr:city',
      'tags.screens (screen count when mapped)',
      'tags.website',
    ],
    commercialRestrictions:
      'ODbL open data license; subject to fair-use rate limits (cached per city in FOVO).',
    complexity: 'Low',
    statusInFovo: 'ACTIVE_LIVE',
  },
  {
    id: 'vista_cinema_connect',
    name: 'Vista Cinema Connect API (GetSessionSeatPlan / OCAPI)',
    officialDocsUrl: 'https://developer.vista.co/',
    accessType: 'Partner / Operator Authorized Only',
    authRequirements:
      'connectApiToken header or OAuth2 client credentials + exhibitor-hosted Vista Connect Server URL (VISTA_CONNECT_URL, VISTA_API_TOKEN)',
    indiaSupported: true,
    operatorAuthRequired: true,
    capabilities: {
      cinemaDirectory: true,
      auditoriumIds: true,
      sessionsAndShowtimes: true,
      seatLayoutGrid2D: true,
      physical3DCoordinates: false,
      liveSeatAvailability: true,
    },
    actualFieldsReturned: [
      'SeatLayoutData.Areas[].Number / Description / AreaCategoryCode',
      'Areas[].Rows[].PhysicalName / RowIndex',
      'Rows[].Seats[].Id / Status (0=Available, 1=Sold, 2=Reserved, 4=Blocked)',
      'Seats[].Position { AreaNumber, RowIndex, ColumnIndex }',
      'BoundaryLeft / BoundaryRight / ScreenWidth (2D logical canvas units)',
    ],
    commercialRestrictions:
      'Requires commercial agreement with Vista Entertainment Solutions and explicit per-chain authorization (e.g., Cinépolis / PVR INOX). Returns a 2D logical seat/aisle grid rather than 3D elevation metres; FOVO converts this via vistaSeatPlanConverter.ts and labels it VISTA_GRID_CALIBRATED.',
    complexity: 'High (Requires Exhibitor Contract)',
    statusInFovo: 'ADAPTER_READY_PARTNER_GATE',
  },
  {
    id: 'movieglu_api',
    name: 'MovieGlu Global Showtimes API',
    officialDocsUrl: 'https://developer.movieglu.com/',
    accessType: 'Commercial B2B Evaluation / Licensed',
    authRequirements:
      'x-api-key, client, authorization, territory: IN, api-version: v201, geolocation headers',
    indiaSupported: true,
    operatorAuthRequired: false,
    capabilities: {
      cinemaDirectory: true,
      auditoriumIds: false,
      sessionsAndShowtimes: true,
      seatLayoutGrid2D: false,
      physical3DCoordinates: false,
      liveSeatAvailability: false,
    },
    actualFieldsReturned: [
      'cinemas[] (cinema_id, cinema_name, address, lat, lng, distance)',
      'showings.Standard.times[] (start_time, end_time)',
      'purchaseConfirmation deep link URL to official checkout',
    ],
    commercialRestrictions:
      'Explicitly does NOT expose auditorium seat maps or seat availability; provides showtimes and deep-link handoff only.',
    complexity: 'Medium',
    statusInFovo: 'ADAPTER_READY_AWAITING_KEY',
  },
  {
    id: 'tmdb_india_v3',
    name: 'TMDB API v3 (India Region + Live Release Fallback)',
    officialDocsUrl: 'https://developer.themoviedb.org/docs',
    accessType: 'Public Cloud API (API Key)',
    authRequirements: 'TMDB_API_READ_TOKEN or TMDB_API_KEY in server environment',
    indiaSupported: true,
    operatorAuthRequired: false,
    capabilities: {
      cinemaDirectory: false,
      auditoriumIds: false,
      sessionsAndShowtimes: false,
      seatLayoutGrid2D: false,
      physical3DCoordinates: false,
      liveSeatAvailability: false,
    },
    actualFieldsReturned: [
      'results[] (id, title, original_title, release_date, original_language, poster_path)',
      'videos.results[] (YouTube Official Trailer keys)',
      'credits.cast[] & runtime',
    ],
    commercialRestrictions: 'Global/regional movie metadata only; never treated as verified local cinema showtimes.',
    complexity: 'Low',
    statusInFovo: 'ACTIVE_LIVE',
  },
];

const CINEMA_CACHE_PREFIX = 'fovo_discovered_cinemas_v2:';
const CINEMA_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function inferCinemaBrand(name: string, operator?: string): {
  brand: string;
  primaryProvider: BookingProviderInfo['id'];
  secondaryProviders: BookingProviderInfo['id'][];
} {
  const combined = `${name} ${operator || ''}`.toLowerCase();
  if (combined.includes('pvr') || combined.includes('inox')) {
    return {
      brand: 'PVR INOX',
      primaryProvider: 'bookmyshow',
      secondaryProviders: ['district', 'pvr_official'],
    };
  }
  if (combined.includes('cinepolis') || combined.includes('cinépolis')) {
    return {
      brand: 'Cinépolis',
      primaryProvider: 'bookmyshow',
      secondaryProviders: ['district', 'cinepolis_official'],
    };
  }
  if (combined.includes('miraj')) {
    return {
      brand: 'Miraj Cinemas',
      primaryProvider: 'bookmyshow',
      secondaryProviders: ['district'],
    };
  }
  if (combined.includes('carnival') || combined.includes('ny cinemas') || combined.includes('mukta')) {
    return {
      brand: 'Multiplex Chain',
      primaryProvider: 'bookmyshow',
      secondaryProviders: ['district'],
    };
  }
  return {
    brand: operator || 'Cinema Venue',
    primaryProvider: 'bookmyshow',
    secondaryProviders: ['district'],
  };
}

function normalizeVenueNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/cinépolis/g, 'cinepolis')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(cinema|cinemas|theatre|theater|multiplex|talkies|screens|screen|pvr|inox)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicates discovered cinemas across Google Places API (New),
 * OpenStreetMap Overpass API, and the FOVO Registry using:
 * 1. Exact external provider IDs (`googlePlaceId`, `osmId`)
 * 2. Geographic proximity (`<= 0.22 km`) + normalized name token overlap
 */
export function deduplicateAndEnrichCinemas(
  rawList: Cinema[],
  referenceCoords?: { lat: number; lng: number } | null,
): Cinema[] {
  hydratePersistedAuditoriums();
  const deduped: Cinema[] = [];

  for (const candidate of rawList) {
    const existingIdx = deduped.findIndex((item) => {
      if (item.id === candidate.id) return true;
      if (
        item.externalIds?.googlePlaceId &&
        candidate.externalIds?.googlePlaceId &&
        item.externalIds.googlePlaceId === candidate.externalIds.googlePlaceId
      ) {
        return true;
      }
      if (
        item.externalIds?.osmId &&
        candidate.externalIds?.osmId &&
        item.externalIds.osmId === candidate.externalIds.osmId
      ) {
        return true;
      }
      const distKm = haversineDistanceKm(item.coordinates, candidate.coordinates);
      if (distKm <= 0.22) {
        const n1 = normalizeVenueNameForMatch(item.name);
        const n2 = normalizeVenueNameForMatch(candidate.name);
        if (!n1 || !n2 || n1.includes(n2) || n2.includes(n1)) {
          return true;
        }
      }
      return false;
    });

    if (existingIdx === -1) {
      deduped.push(candidate);
    } else {
      const prev = deduped[existingIdx];
      // Merge external IDs and preserve whichever record has auditorium seat-map support
      const hasSeats = prev.hasSeatMapSupport || candidate.hasSeatMapSupport;
      const mergedAuditoriums =
        prev.auditoriums.length > 0 ? prev.auditoriums : candidate.auditoriums;
      deduped[existingIdx] = {
        ...prev,
        externalIds: {
          ...candidate.externalIds,
          ...prev.externalIds,
        },
        address:
          prev.address.length >= candidate.address.length
            ? prev.address
            : candidate.address,
        websiteUrl: prev.websiteUrl || candidate.websiteUrl,
        rating: prev.rating ?? candidate.rating,
        userRatingCount: prev.userRatingCount ?? candidate.userRatingCount,
        hasSeatMapSupport: hasSeats,
        auditorium: prev.auditorium ?? candidate.auditorium,
        auditoriums: mergedAuditoriums,
        seatMapProvider:
          prev.seatMapProvider !== 'NONE'
            ? prev.seatMapProvider
            : candidate.seatMapProvider,
      };
    }
  }

  // Compute distance from user/city reference coordinates and sort nearest first
  const withDistance = deduped.map((c) => ({
    ...c,
    distanceKm: referenceCoords
      ? haversineDistanceKm(referenceCoords, c.coordinates)
      : c.distanceKm ?? null,
  }));

  withDistance.sort((a, b) => {
    // Keep seat-map enabled pilot venues prominent when distances are comparable, or sort by distance
    const dA = a.distanceKm ?? 9999;
    const dB = b.distanceKm ?? 9999;
    if (Math.abs(dA - dB) > 0.05) return dA - dB;
    if (a.hasSeatMapSupport !== b.hasSeatMapSupport) {
      return a.hasSeatMapSupport ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  registerDiscoveredCinemas(withDistance);
  return withDistance;
}

/**
 * Direct OpenStreetMap Overpass API discovery for any coordinates `{ lat, lng }`
 * when running in browser or when server proxy falls back.
 */
async function fetchOverpassCinemasClient(
  city: CityRecord,
  searchCenter: { lat: number; lng: number },
  radiusMeters = 22000,
): Promise<Cinema[]> {
  const query = `[out:json][timeout:12];(nwr["amenity"="cinema"](around:${radiusMeters},${searchCenter.lat},${searchCenter.lng}););out center tags 35;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const results: Cinema[] = [];

      for (const el of elements) {
        const tags = el.tags || {};
        const name = tags.name || tags['name:en'];
        if (!name) continue;
        const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
        const lng = typeof el.lon === 'number' ? el.lon : el.center?.lon;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;

        const osmId = `osm-${el.type || 'node'}-${el.id}`;
        const brandInfo = inferCinemaBrand(name, tags.brand || tags.operator);
        const addrParts = [
          tags['addr:housename'],
          tags['addr:street'],
          tags['addr:suburb'] || tags['addr:neighbourhood'] || tags['addr:district'],
          tags['addr:city'] || city.name,
          tags['addr:state'] || city.state,
          tags['addr:postcode'],
        ].filter(Boolean);

        const area =
          tags['addr:suburb'] ||
          tags['addr:neighbourhood'] ||
          tags['addr:street'] ||
          city.name;
        const address =
          tags['addr:full'] ||
          (addrParts.length >= 2
            ? addrParts.join(', ')
            : `${name}, ${area}, ${city.name}${city.state ? `, ${city.state}` : ''}`);
        const screensNum = Number(tags.screens);
        const auditoriumCount =
          Number.isFinite(screensNum) && screensNum > 0 ? screensNum : null;

        const bmsSlug = slugifyCityId(city.name);
        results.push({
          id: `cinema-${osmId}`,
          externalIds: { osmId },
          name,
          brand: brandInfo.brand,
          cityId: city.id,
          city: city.name,
          state: city.state || 'India',
          country: city.country || 'India',
          area,
          address,
          coordinates: { lat, lng },
          websiteUrl: tags.website || tags['contact:website'] || null,
          auditoriumCount,
          supportedFormats: ['2D', '3D'],
          format: auditoriumCount
            ? `${auditoriumCount} Screens · Discovered via OpenStreetMap`
            : 'Discovered Cinema Venue',
          auditorium: null,
          auditoriums: [],
          hasSeatMapSupport: false,
          seatMapProvider: 'NONE',
          dataSource: 'OSM_OVERPASS_LIVE',
          bookingProvider: brandInfo.primaryProvider,
          secondaryProviders: brandInfo.secondaryProviders,
          externalBookingUrl: `https://in.bookmyshow.com/explore/cinemas-${bmsSlug}`,
          verificationTier: 'LIVE_VERIFIED',
          verificationNotes:
            'Automatically discovered via OpenStreetMap Overpass cinema geolocation query. No external seat-map API or physical auditorium floorplan is attached yet.',
          lastVerifiedAt: new Date().toISOString().slice(0, 10),
        });
      }

      if (results.length > 0) return results;
    } catch {
      // Try next Overpass mirror
    }
  }

  return [];
}

export interface CinemaDiscoveryResponse {
  cinemas: Cinema[];
  providerUsed: CinemaDiscoverySource;
  googlePlacesConfigured: boolean;
  vistaConfigured: boolean;
  lastUpdatedAt: string;
  fromCache: boolean;
}

/**
 * Automated Cinema Discovery Pipeline:
 * User Location / Selected City -> Server Places Proxy (Google Places API New / Overpass)
 * -> Registry Matching & Deduplication -> Distance Sorting -> Runtime Registration.
 */
export async function discoverCinemasForCity(opts: {
  city: CityRecord;
  userCoordinates?: { lat: number; lng: number } | null;
  radiusKm?: number;
  forceRefresh?: boolean;
}): Promise<CinemaDiscoveryResponse> {
  const { city, userCoordinates, radiusKm = 25, forceRefresh = false } = opts;
  const refCoords = userCoordinates ?? city.coordinates;
  const cacheKey = `${CINEMA_CACHE_PREFIX}${city.id}`;

  const seedMatches = seedRegistryCinemas.filter(
    (c) =>
      c.cityId.toLowerCase() === city.id.toLowerCase() ||
      c.city.toLowerCase() === city.name.toLowerCase() ||
      haversineDistanceKm(city.coordinates, c.coordinates) <= radiusKm,
  );

  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as {
          timestamp: number;
          cinemas: Cinema[];
          providerUsed: CinemaDiscoverySource;
          googlePlacesConfigured: boolean;
          vistaConfigured: boolean;
          lastUpdatedAt: string;
        };
        if (Date.now() - cached.timestamp < CINEMA_CACHE_TTL_MS && cached.cinemas.length > 0) {
          const merged = deduplicateAndEnrichCinemas(
            [...seedMatches, ...cached.cinemas],
            refCoords,
          );
          return {
            cinemas: merged,
            providerUsed: cached.providerUsed,
            googlePlacesConfigured: cached.googlePlacesConfigured,
            vistaConfigured: cached.vistaConfigured,
            lastUpdatedAt: cached.lastUpdatedAt,
            fromCache: true,
          };
        }
      }
    } catch {
      // ignore cache parse errors
    }
  }

  // 1. Try server-side `/api/places/cinemas` (supports Google Places API (New) + server Overpass)
  try {
    const params = new URLSearchParams({
      cityId: city.id,
      city: city.name,
      state: city.state || '',
      country: city.country || 'India',
      lat: String(city.coordinates.lat),
      lng: String(city.coordinates.lng),
      radiusKm: String(radiusKm),
    });
    const res = await fetch(`/api/places/cinemas?${params.toString()}`);
    if (res.ok) {
      const payload = await res.json();
      const serverCinemas = Array.isArray(payload.cinemas) ? (payload.cinemas as Cinema[]) : [];
      if (serverCinemas.length > 0 || seedMatches.length > 0) {
        const merged = deduplicateAndEnrichCinemas(
          [...seedMatches, ...serverCinemas],
          refCoords,
        );
        const nowIso = payload.lastUpdatedAt || new Date().toISOString();
        if (typeof window !== 'undefined' && serverCinemas.length > 0) {
          try {
            window.localStorage.setItem(
              cacheKey,
              JSON.stringify({
                timestamp: Date.now(),
                cinemas: merged,
                providerUsed: payload.providerUsed || 'OSM_OVERPASS_LIVE',
                googlePlacesConfigured: Boolean(payload.googlePlacesConfigured),
                vistaConfigured: Boolean(payload.vistaConfigured),
                lastUpdatedAt: nowIso,
              }),
            );
          } catch {
            // ignore
          }
        }
        return {
          cinemas: merged,
          providerUsed: payload.providerUsed || 'OSM_OVERPASS_LIVE',
          googlePlacesConfigured: Boolean(payload.googlePlacesConfigured),
          vistaConfigured: Boolean(payload.vistaConfigured),
          lastUpdatedAt: nowIso,
          fromCache: false,
        };
      }
    }
  } catch {
    // Fall back to direct browser Overpass query
  }

  // 2. Direct browser Overpass query fallback
  const clientOverpass = await fetchOverpassCinemasClient(
    city,
    city.coordinates,
    radiusKm * 1000,
  );
  const merged = deduplicateAndEnrichCinemas(
    [...seedMatches, ...clientOverpass],
    refCoords,
  );
  const nowIso = new Date().toISOString();

  if (typeof window !== 'undefined' && merged.length > 0) {
    try {
      window.localStorage.setItem(
        cacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          cinemas: merged,
          providerUsed: clientOverpass.length > 0 ? 'OSM_OVERPASS_LIVE' : 'VERIFIED_REGISTRY',
          googlePlacesConfigured: false,
          vistaConfigured: false,
          lastUpdatedAt: nowIso,
        }),
      );
    } catch {
      // ignore
    }
  }

  return {
    cinemas: merged,
    providerUsed: clientOverpass.length > 0 ? 'OSM_OVERPASS_LIVE' : 'VERIFIED_REGISTRY',
    googlePlacesConfigured: false,
    vistaConfigured: false,
    lastUpdatedAt: nowIso,
    fromCache: false,
  };
}
