import type {
  AuditoriumConfig,
  BookingProviderInfo,
  CinemaDiscoverySource,
  CityRecord,
  DataVerificationTier,
  ExternalCinemaIds,
  SeatMapProviderType,
  SeatStatus,
  ShowtimeRecord,
} from '../domain/types';
import {
  boutiqueReclinerAuditorium,
  grandAuditorium,
  imaxCurvedAuditorium,
  referenceAuditorium,
} from '../domain/layout/presets';

export const SUPPORTED_CITIES: CityRecord[] = [
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    alternateName: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 12.9716, lng: 77.5946 },
    isPrimaryMarket: true,
    defaultLanguages: ['kn', 'en', 'hi', 'te', 'ta', 'ml'],
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    alternateName: 'Bombay',
    state: 'Maharashtra',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 19.076, lng: 72.8777 },
    isPrimaryMarket: true,
    defaultLanguages: ['hi', 'en', 'mr', 'ta', 'te'],
  },
  {
    id: 'delhi-ncr',
    name: 'Delhi NCR',
    alternateName: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 28.6139, lng: 77.209 },
    isPrimaryMarket: true,
    defaultLanguages: ['hi', 'en', 'pa'],
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    state: 'Telangana',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 17.385, lng: 78.4867 },
    isPrimaryMarket: true,
    defaultLanguages: ['te', 'hi', 'en'],
  },
  {
    id: 'chennai',
    name: 'Chennai',
    alternateName: 'Madras',
    state: 'Tamil Nadu',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 13.0827, lng: 80.2707 },
    isPrimaryMarket: true,
    defaultLanguages: ['ta', 'en', 'te', 'ml', 'hi'],
  },
  {
    id: 'pune',
    name: 'Pune',
    state: 'Maharashtra',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 18.5204, lng: 73.8567 },
    isPrimaryMarket: false,
    defaultLanguages: ['hi', 'mr', 'en'],
  },
  {
    id: 'kolkata',
    name: 'Kolkata',
    alternateName: 'Calcutta',
    state: 'West Bengal',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 22.5726, lng: 88.3639 },
    isPrimaryMarket: false,
    defaultLanguages: ['bn', 'hi', 'en'],
  },
  {
    id: 'kochi',
    name: 'Kochi',
    alternateName: 'Cochin',
    state: 'Kerala',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 9.9312, lng: 76.2673 },
    isPrimaryMarket: false,
    defaultLanguages: ['ml', 'en', 'ta', 'hi'],
  },
  {
    id: 'hubballi',
    name: 'Hubballi',
    alternateName: 'Hubli',
    state: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 15.3647, lng: 75.124 },
    isPrimaryMarket: true,
    defaultLanguages: ['kn', 'hi', 'en', 'te'],
  },
  {
    id: 'dharwad',
    name: 'Dharwad',
    state: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 15.4589, lng: 75.0078 },
    isPrimaryMarket: false,
    defaultLanguages: ['kn', 'hi', 'en'],
  },
  {
    id: 'mysuru',
    name: 'Mysuru',
    alternateName: 'Mysore',
    state: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 12.2958, lng: 76.6394 },
    isPrimaryMarket: false,
    defaultLanguages: ['kn', 'en', 'hi'],
  },
  {
    id: 'ahmedabad',
    name: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    countryCode: 'IN',
    coordinates: { lat: 23.0225, lng: 72.5714 },
    isPrimaryMarket: false,
    defaultLanguages: ['hi', 'en'],
  },
];

export const BOOKING_PROVIDERS: Record<BookingProviderInfo['id'], BookingProviderInfo> = {
  bookmyshow: {
    id: 'bookmyshow',
    name: 'BookMyShow',
    websiteUrl: 'https://in.bookmyshow.com/explore/home',
    integrationType: 'EXTERNAL_HANDOFF',
    notes: 'Public consumer web portal. Live showtime/seat inventory API requires commercial partner credentials.',
  },
  district: {
    id: 'district',
    name: 'District (by Zomato / Paytm)',
    websiteUrl: 'https://www.district.in/movies/',
    integrationType: 'EXTERNAL_HANDOFF',
    notes: 'Public ticketing listing. Authorized API feed requires partner onboarding.',
  },
  cinepolis_official: {
    id: 'cinepolis_official',
    name: 'Cinépolis India',
    websiteUrl: 'https://www.cinepolisindia.com/',
    integrationType: 'EXTERNAL_HANDOFF',
    notes: 'Official Cinépolis India chain portal (runs Vista Cinema Connect internally for partner ticketing).',
  },
  pvr_official: {
    id: 'pvr_official',
    name: 'PVR INOX',
    websiteUrl: 'https://www.pvrcinemas.com/',
    integrationType: 'EXTERNAL_HANDOFF',
    notes: 'Official PVR INOX chain portal across Indian cities.',
  },
};

export interface Cinema {
  id: string;
  externalIds?: ExternalCinemaIds;
  name: string;
  brand: string;
  cityId: string;
  city: string;
  state: string;
  country: string;
  area: string;
  address: string;
  coordinates: { lat: number; lng: number };
  distanceKm?: number | null;
  websiteUrl?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  /** Null when exact screen count is not publicly confirmed by the external Places provider. */
  auditoriumCount: number | null;
  supportedFormats: string[];
  format: string;
  /** Primary default auditorium (or null if no seat-map / floorplan is connected for this discovered venue). */
  auditorium: AuditoriumConfig | null;
  /** Complete list of auditoriums configured for this cinema (Country -> City -> Cinema -> Auditorium). */
  auditoriums: AuditoriumConfig[];
  hasSeatMapSupport: boolean;
  seatMapProvider: SeatMapProviderType;
  dataSource: CinemaDiscoverySource;
  bookingProvider: BookingProviderInfo['id'];
  secondaryProviders?: BookingProviderInfo['id'][];
  externalBookingUrl: string;
  verificationTier: DataVerificationTier;
  verificationNotes: string;
  lastVerifiedAt: string;
  isPrimaryPilot?: boolean;
}

/**
 * Seed verified cinema records with calibrated multi-auditorium templates.
 * Note: Automated discovery via Google Places API (New) and OpenStreetMap Overpass API
 * dynamically discovers all other cinemas in the user's selected city and merges/deduplicates
 * with this registry.
 */
export const cinemas: Cinema[] = [
  {
    id: 'cinepolis-urban-oasis-hbl',
    externalIds: { osmId: 'osm-cinepolis-urban-oasis-hbl' },
    name: 'Cinépolis: Urban Oasis Mall',
    brand: 'Cinépolis',
    cityId: 'hubballi',
    city: 'Hubballi',
    state: 'Karnataka',
    country: 'India',
    area: 'Gokul Road',
    address: '3rd Floor, Urban Oasis Mall, 4784/B, Gokul Road, Chaitanya Nagar, Rajendra Nagar, Hubballi, Karnataka 580030',
    coordinates: { lat: 15.3578, lng: 75.1072 },
    auditoriumCount: 5,
    supportedFormats: ['2D', '3D', 'Dolby 7.1'],
    format: '5 Screens · 2D / 3D · Dolby 7.1',
    auditorium: referenceAuditorium,
    auditoriums: [
      {
        ...referenceAuditorium,
        id: 'cinepolis-hbl-audi-1',
        name: 'Audi 1 · Dolby 7.1 (183 Seats · Estimated)',
        cinemaId: 'cinepolis-urban-oasis-hbl',
        screenNumber: 1,
        city: 'Hubballi',
      },
      {
        ...grandAuditorium,
        id: 'cinepolis-hbl-audi-2',
        name: 'Audi 2 · Center-Aisle Stadium (212 Seats · Estimated)',
        cinemaId: 'cinepolis-urban-oasis-hbl',
        screenNumber: 2,
        city: 'Hubballi',
      },
    ],
    hasSeatMapSupport: true,
    seatMapProvider: 'CALIBRATED_MODEL',
    dataSource: 'VERIFIED_REGISTRY',
    bookingProvider: 'bookmyshow',
    secondaryProviders: ['district', 'cinepolis_official'],
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-hubli',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified 5-screen Cinépolis multiplex at Urban Oasis Mall, Gokul Road, Hubballi. Auditorium seat geometry uses our clearly labelled prototype configurations.',
    lastVerifiedAt: '2026-11-12',
    isPrimaryPilot: true,
  },
  {
    id: 'pvr-laxmi-mall-hbl',
    externalIds: { osmId: 'osm-pvr-laxmi-mall-hbl' },
    name: 'PVR: Laxmi Mall (Laxmi Citypride)',
    brand: 'PVR INOX',
    cityId: 'hubballi',
    city: 'Hubballi',
    state: 'Karnataka',
    country: 'India',
    area: 'Coen Road · J C Nagar',
    address: '3rd Floor, Laxmi Mall, Coen Road, Shree Shakti Road, J C Nagar, New Hubli, Hubballi, Karnataka 580020',
    coordinates: { lat: 15.3492, lng: 75.1419 },
    auditoriumCount: 4,
    supportedFormats: ['2D', '3D'],
    format: '4 Screens · Multiplex · Coen Road',
    auditorium: grandAuditorium,
    auditoriums: [
      {
        ...grandAuditorium,
        id: 'pvr-hbl-audi-1',
        name: 'Audi 1 · Stadium Center-Aisle (212 Seats · Estimated)',
        cinemaId: 'pvr-laxmi-mall-hbl',
        screenNumber: 1,
        city: 'Hubballi',
      },
    ],
    hasSeatMapSupport: true,
    seatMapProvider: 'CALIBRATED_MODEL',
    dataSource: 'VERIFIED_REGISTRY',
    bookingProvider: 'bookmyshow',
    secondaryProviders: ['district', 'pvr_official'],
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-hubli',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified PVR multiplex inside Laxmi Mall on Coen Road, J C Nagar, Hubballi.',
    lastVerifiedAt: '2026-11-12',
  },
  {
    id: 'apsara-sudha-hbl',
    externalIds: { osmId: 'osm-apsara-sudha-hbl' },
    name: 'Apsara & Sudha Cinemas',
    brand: 'Independent Twin Cinema',
    cityId: 'hubballi',
    city: 'Hubballi',
    state: 'Karnataka',
    country: 'India',
    area: 'Durgadbail · Coen Road',
    address: 'Shree Shakti Road, Coen Road, Durgadbail, New Hubli, Hubballi, Karnataka 580020',
    coordinates: { lat: 15.3468, lng: 75.1432 },
    auditoriumCount: 2,
    supportedFormats: ['2D'],
    format: 'Twin Screen · Coen Road',
    auditorium: referenceAuditorium,
    auditoriums: [referenceAuditorium],
    hasSeatMapSupport: true,
    seatMapProvider: 'CALIBRATED_MODEL',
    dataSource: 'VERIFIED_REGISTRY',
    bookingProvider: 'bookmyshow',
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-hubli',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Historic twin-cinema complex (Apsara & Sudha) on Shree Shakti Road / Coen Road, New Hubli.',
    lastVerifiedAt: '2026-11-12',
  },
  {
    id: 'rupam-talkies-hbl',
    externalIds: { osmId: 'osm-rupam-talkies-hbl' },
    name: 'Rupam Talkies (Rupam Chitramandira)',
    brand: 'Single Screen',
    cityId: 'hubballi',
    city: 'Hubballi',
    state: 'Karnataka',
    country: 'India',
    area: 'Station Road',
    address: 'Station Road, New Hubli, Hubballi, Karnataka 580020',
    coordinates: { lat: 15.3451, lng: 75.1488 },
    auditoriumCount: 1,
    supportedFormats: ['2D'],
    format: 'Single Screen · Station Road',
    auditorium: null,
    auditoriums: [],
    hasSeatMapSupport: false,
    seatMapProvider: 'NONE',
    dataSource: 'VERIFIED_REGISTRY',
    bookingProvider: 'bookmyshow',
    externalBookingUrl: 'https://in.bookmyshow.com/explore/movies-hubli',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified single-screen theatre on Station Road, Hubballi. No digital seat-map API or verified floorplan is currently connected.',
    lastVerifiedAt: '2026-11-12',
  },
  {
    id: 'inox-smartcity-dwd',
    externalIds: { osmId: 'osm-inox-smartcity-dwd' },
    name: 'INOX: Smartcity Mall, Dharwad',
    brand: 'PVR INOX',
    cityId: 'dharwad',
    city: 'Dharwad',
    state: 'Karnataka',
    country: 'India',
    area: 'P B Road · Lakamanahalli',
    address: 'Smartcity Mall, P B Road, Lakamanahalli, Dharwad, Karnataka 580004',
    coordinates: { lat: 15.4325, lng: 75.0395 },
    auditoriumCount: 4,
    supportedFormats: ['2D', '3D'],
    format: '4 Screens · Multiplex · Dharwad',
    auditorium: grandAuditorium,
    auditoriums: [grandAuditorium],
    hasSeatMapSupport: true,
    seatMapProvider: 'CALIBRATED_MODEL',
    dataSource: 'VERIFIED_REGISTRY',
    bookingProvider: 'bookmyshow',
    secondaryProviders: ['district', 'pvr_official'],
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-dharwad',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified nearby multiplex in twin-city Dharwad along P B Road.',
    lastVerifiedAt: '2026-11-12',
  },
  {
    id: 'pvr-nexus-koramangala-blr',
    externalIds: { osmId: 'osm-pvr-nexus-koramangala-blr' },
    name: 'PVR: Nexus Mall, Koramangala',
    brand: 'PVR INOX',
    cityId: 'bengaluru',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    area: 'Koramangala',
    address: 'The Nexus Mall, 21, Hosur Road, Chikku Lakshmaiah Layout, Koramangala, Bengaluru, Karnataka 560095',
    coordinates: { lat: 12.9345, lng: 77.6113 },
    auditoriumCount: 11,
    supportedFormats: ['IMAX with Laser', '4DX', 'Playhouse', 'Dolby Atmos', '2D'],
    format: '11 Screens · IMAX with Laser · Gold Class',
    auditorium: imaxCurvedAuditorium,
    auditoriums: [
      {
        ...imaxCurvedAuditorium,
        id: 'pvr-koramangala-imax-1',
        name: 'Audi 1 · IMAX Curved Stadium (286 Seats · Estimated)',
        cinemaId: 'pvr-nexus-koramangala-blr',
        screenNumber: 1,
        city: 'Bengaluru',
      },
      {
        ...referenceAuditorium,
        id: 'pvr-koramangala-audi-2',
        name: 'Audi 2 · Dolby Atmos Premiere (183 Seats · Estimated)',
        cinemaId: 'pvr-nexus-koramangala-blr',
        screenNumber: 2,
        city: 'Bengaluru',
      },
      {
        ...boutiqueReclinerAuditorium,
        id: 'pvr-koramangala-gold-3',
        name: 'Gold Class Suite 3 · All-Recliner (64 Seats · Estimated)',
        cinemaId: 'pvr-nexus-koramangala-blr',
        screenNumber: 3,
        city: 'Bengaluru',
      },
    ],
    hasSeatMapSupport: true,
    seatMapProvider: 'CALIBRATED_MODEL',
    dataSource: 'VERIFIED_REGISTRY',
    bookingProvider: 'bookmyshow',
    secondaryProviders: ['district', 'pvr_official'],
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-bengaluru',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Flagship 11-screen PVR multiplex at Nexus Mall Koramangala, Bengaluru. Includes curved IMAX, standard Dolby Atmos, and Gold Class recliner prototype layouts.',
    lastVerifiedAt: '2026-11-12',
    isPrimaryPilot: true,
  },
  {
    id: 'pvr-icon-phoenix-palladium-bom',
    externalIds: { osmId: 'osm-pvr-icon-palladium-bom' },
    name: 'PVR ICON: Phoenix Palladium, Lower Parel',
    brand: 'PVR INOX',
    cityId: 'mumbai',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    area: 'Lower Parel',
    address: 'Phoenix Palladium Mall, 462, Senapati Bapat Marg, Lower Parel, Mumbai, Maharashtra 400013',
    coordinates: { lat: 18.9947, lng: 72.8246 },
    auditoriumCount: 9,
    supportedFormats: ['IMAX', 'Luxe Recliner', 'Dolby Atmos', '2D'],
    format: '9 Screens · IMAX · Luxe Recliner',
    auditorium: imaxCurvedAuditorium,
    auditoriums: [
      {
        ...imaxCurvedAuditorium,
        id: 'pvr-palladium-imax-1',
        name: 'IMAX Screen 1 · Curved Stadium (286 Seats · Estimated)',
        cinemaId: 'pvr-icon-phoenix-palladium-bom',
        screenNumber: 1,
        city: 'Mumbai',
      },
      {
        ...boutiqueReclinerAuditorium,
        id: 'pvr-palladium-luxe-2',
        name: 'Luxe Suite 2 · All-Recliner (64 Seats · Estimated)',
        cinemaId: 'pvr-icon-phoenix-palladium-bom',
        screenNumber: 2,
        city: 'Mumbai',
      },
    ],
    hasSeatMapSupport: true,
    seatMapProvider: 'CALIBRATED_MODEL',
    dataSource: 'VERIFIED_REGISTRY',
    bookingProvider: 'bookmyshow',
    secondaryProviders: ['district', 'pvr_official'],
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-mumbai',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified PVR ICON multiplex at Phoenix Palladium, Lower Parel, Mumbai.',
    lastVerifiedAt: '2026-11-12',
  },
];

/**
 * Dynamic runtime registry so cinemas discovered live from Google Places API (New)
 * or OpenStreetMap Overpass API (and custom imported Vista/JSON auditoriums) are
 * immediately accessible by ID throughout the booking and 3D preview flow.
 */
const runtimeCinemaMap = new Map<string, Cinema>();
const customAvailabilityMap = new Map<string, Record<string, SeatStatus>>();

for (const c of cinemas) {
  runtimeCinemaMap.set(c.id, c);
}

export function registerDiscoveredCinemas(list: Cinema[]): void {
  for (const c of list) {
    const existing = runtimeCinemaMap.get(c.id);
    if (existing && existing.hasSeatMapSupport && !c.hasSeatMapSupport) {
      // Preserve attached auditoriums if the user already imported a floorplan for this cinema
      runtimeCinemaMap.set(c.id, {
        ...c,
        auditorium: existing.auditorium,
        auditoriums: existing.auditoriums,
        hasSeatMapSupport: true,
        seatMapProvider: existing.seatMapProvider,
      });
    } else {
      runtimeCinemaMap.set(c.id, c);
    }
  }
}

export function attachAuditoriumToCinema(
  cinemaId: string,
  config: AuditoriumConfig,
  providerType: SeatMapProviderType = 'IMPORTED_JSON',
  seatAvailability?: Record<string, SeatStatus>,
): Cinema | null {
  const existing = runtimeCinemaMap.get(cinemaId);
  if (!existing) return null;
  const updatedList = [
    config,
    ...existing.auditoriums.filter((a) => a.id !== config.id),
  ];
  const updated: Cinema = {
    ...existing,
    auditorium: config,
    auditoriums: updatedList,
    hasSeatMapSupport: true,
    seatMapProvider: providerType,
    auditoriumCount: existing.auditoriumCount ?? updatedList.length,
  };
  runtimeCinemaMap.set(cinemaId, updated);
  if (seatAvailability) {
    customAvailabilityMap.set(`${cinemaId}|${config.id}`, seatAvailability);
  }
  return updated;
}

export function getCustomSeatAvailability(
  cinemaId: string,
  auditoriumId: string,
): Record<string, SeatStatus> | null {
  return customAvailabilityMap.get(`${cinemaId}|${auditoriumId}`) ?? null;
}

export const SHOW_TIMES = ['10:45', '14:15', '18:30', '21:45'];

export function getCinema(id: string | null): Cinema | null {
  if (!id) return null;
  if (id === 'lumiere') return cinemas[0];
  if (id === 'orion') return cinemas[1];
  return runtimeCinemaMap.get(id) ?? cinemas.find((c) => c.id === id) ?? null;
}

export function getAllRegisteredCinemas(): Cinema[] {
  return Array.from(runtimeCinemaMap.values());
}

export function getCinemasByCity(cityId: string): Cinema[] {
  const all = getAllRegisteredCinemas();
  if (cityId === 'all') {
    return all.filter((c) => c.cityId === 'hubballi' || c.cityId === 'dharwad');
  }
  const norm = cityId.toLowerCase();
  return all.filter(
    (c) =>
      c.cityId.toLowerCase() === norm ||
      c.city.toLowerCase() === norm,
  );
}

export function getCinemaProviders(cinema: Cinema): BookingProviderInfo[] {
  const ids = [cinema.bookingProvider, ...(cinema.secondaryProviders ?? [])];
  return ids.map((id) => BOOKING_PROVIDERS[id]).filter(Boolean);
}

/**
 * Generates provider-independent showtime records for a cinema + movie + date.
 * Explicitly tagged as `DEMO_DATA` unless populated by an authorized live showtime adapter.
 */
export function getShowtimesForCinema(
  cinema: Cinema,
  movieId: string,
  date: string,
  language = 'Hindi · English · Regional',
  auditoriumIdOverride?: string | null,
): ShowtimeRecord[] {
  const targetAudi =
    cinema.auditoriums.find((a) => a.id === auditoriumIdOverride) ??
    cinema.auditorium;
  const audiId = targetAudi?.id ?? 'unassigned-screen';

  return SHOW_TIMES.map((startTime, idx) => {
    const audiForSlot =
      !auditoriumIdOverride && cinema.auditoriums.length > 0
        ? cinema.auditoriums[idx % cinema.auditoriums.length]
        : targetAudi;
    return {
      id: `${cinema.id}|${movieId}|${date}|${startTime}`,
      movieId,
      cinemaId: cinema.id,
      auditoriumId: audiForSlot?.id ?? audiId,
      date,
      startTime,
      language,
      screeningFormat: cinema.supportedFormats[idx % Math.max(1, cinema.supportedFormats.length)] ?? '2D',
      verifiedPriceRange: null,
      availabilityStatus: 'UNVERIFIED_EXTERNAL',
      externalBookingUrl: cinema.externalBookingUrl,
      bookingProvider: cinema.bookingProvider,
      verificationTier: 'DEMO_DATA',
      lastVerifiedAt: cinema.lastVerifiedAt,
    };
  });
}

/** Local-date ISO key, e.g. 2026-11-12. */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nextDates(count = 3): { key: string; label: string; day: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      key: dateKey(d),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short' }),
      day: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    };
  });
}

export function isPast(date: string, time: string, now = new Date()): boolean {
  if (date !== dateKey(now)) return false;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m <= now.getHours() * 60 + now.getMinutes();
}
