import type {
  AuditoriumConfig,
  BookingProviderInfo,
  CityRecord,
  DataVerificationTier,
  ShowtimeRecord,
} from '../domain/types';
import { grandAuditorium, referenceAuditorium } from '../domain/layout/presets';

export const SUPPORTED_CITIES: CityRecord[] = [
  {
    id: 'hubballi',
    name: 'Hubballi',
    alternateName: 'Hubli',
    state: 'Karnataka',
    country: 'India',
    coordinates: { lat: 15.3647, lng: 75.124 },
    isPrimaryMarket: true,
  },
  {
    id: 'dharwad',
    name: 'Dharwad',
    state: 'Karnataka',
    country: 'India',
    coordinates: { lat: 15.4589, lng: 75.0078 },
    isPrimaryMarket: false,
  },
];

export const BOOKING_PROVIDERS: Record<BookingProviderInfo['id'], BookingProviderInfo> = {
  bookmyshow: {
    id: 'bookmyshow',
    name: 'BookMyShow',
    websiteUrl: 'https://in.bookmyshow.com/explore/movies-hubli',
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
    notes: 'Official chain portal for Cinépolis Urban Oasis Mall, Hubballi.',
  },
  pvr_official: {
    id: 'pvr_official',
    name: 'PVR INOX',
    websiteUrl: 'https://www.pvrcinemas.com/',
    integrationType: 'EXTERNAL_HANDOFF',
    notes: 'Official chain portal for PVR Laxmi Mall (Hubballi) and INOX Smartcity Mall (Dharwad).',
  },
};

export interface Cinema {
  id: string;
  name: string;
  brand: string;
  cityId: 'hubballi' | 'dharwad';
  city: string;
  area: string;
  address: string;
  coordinates: { lat: number; lng: number };
  /** Null when exact screen count is not publicly confirmed. */
  auditoriumCount: number | null;
  supportedFormats: string[];
  format: string;
  auditorium: AuditoriumConfig;
  bookingProvider: BookingProviderInfo['id'];
  secondaryProviders?: BookingProviderInfo['id'][];
  externalBookingUrl: string;
  verificationTier: DataVerificationTier;
  verificationNotes: string;
  lastVerifiedAt: string;
  isPrimaryPilot?: boolean;
}

/**
 * Verified Hubballi–Dharwad cinema directory.
 * Addresses, brands and screen counts checked against public listings
 * (BookMyShow, District, Justdial, cinema portals) on 2026-11-11.
 */
export const cinemas: Cinema[] = [
  {
    id: 'cinepolis-urban-oasis-hbl',
    name: 'Cinépolis: Urban Oasis Mall',
    brand: 'Cinépolis',
    cityId: 'hubballi',
    city: 'Hubballi',
    area: 'Gokul Road',
    address: '3rd Floor, Urban Oasis Mall, 4784/B, Gokul Road, Chaitanya Nagar, Rajendra Nagar, Hubballi, Karnataka 580030',
    coordinates: { lat: 15.3578, lng: 75.1072 },
    auditoriumCount: 5,
    supportedFormats: ['2D', '3D', 'Dolby 7.1'],
    format: '5 Screens · 2D / 3D · Primary Pilot',
    auditorium: referenceAuditorium,
    bookingProvider: 'bookmyshow',
    secondaryProviders: ['district', 'cinepolis_official'],
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-hubli',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified 5-screen Cinépolis multiplex on 3rd Floor, Urban Oasis Mall, Gokul Road, Hubballi. Auditorium seat geometry uses our clearly labelled 183-seat estimated prototype layout.',
    lastVerifiedAt: '2026-11-11',
    isPrimaryPilot: true,
  },
  {
    id: 'pvr-laxmi-mall-hbl',
    name: 'PVR: Laxmi Mall (Laxmi Citypride)',
    brand: 'PVR INOX',
    cityId: 'hubballi',
    city: 'Hubballi',
    area: 'Coen Road · J C Nagar',
    address: '3rd Floor, Laxmi Mall, Coen Road, Shree Shakti Road, J C Nagar, New Hubli, Hubballi, Karnataka 580020',
    coordinates: { lat: 15.3492, lng: 75.1419 },
    auditoriumCount: 4,
    supportedFormats: ['2D', '3D'],
    format: 'Multiplex · Coen Road, New Hubli',
    auditorium: grandAuditorium,
    bookingProvider: 'bookmyshow',
    secondaryProviders: ['district', 'pvr_official'],
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-hubli',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified PVR multiplex inside Laxmi Mall (also known locally as Laxmi Citypride Multiplex) on Coen Road, J C Nagar, Hubballi.',
    lastVerifiedAt: '2026-11-11',
  },
  {
    id: 'apsara-sudha-hbl',
    name: 'Apsara & Sudha Cinemas',
    brand: 'Independent Twin Cinema',
    cityId: 'hubballi',
    city: 'Hubballi',
    area: 'Durgadbail · Coen Road',
    address: 'Shree Shakti Road, Coen Road, Durgadbail, New Hubli, Hubballi, Karnataka 580020',
    coordinates: { lat: 15.3468, lng: 75.1432 },
    auditoriumCount: 2,
    supportedFormats: ['2D'],
    format: 'Twin Screen · Coen Road',
    auditorium: referenceAuditorium,
    bookingProvider: 'bookmyshow',
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-hubli',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Historic twin-cinema complex (Apsara & Sudha) on Shree Shakti Road / Coen Road, New Hubli. Listed on BookMyShow Hubli.',
    lastVerifiedAt: '2026-11-11',
  },
  {
    id: 'rupam-talkies-hbl',
    name: 'Rupam Talkies (Rupam Chitramandira)',
    brand: 'Single Screen',
    cityId: 'hubballi',
    city: 'Hubballi',
    area: 'Station Road',
    address: 'Station Road, New Hubli, Hubballi, Karnataka 580020',
    coordinates: { lat: 15.3451, lng: 75.1488 },
    auditoriumCount: 1,
    supportedFormats: ['2D'],
    format: 'Single Screen · Station Road',
    auditorium: referenceAuditorium,
    bookingProvider: 'bookmyshow',
    externalBookingUrl: 'https://in.bookmyshow.com/explore/movies-hubli',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified single-screen theatre on Station Road, Hubballi. Online showtime availability varies by release week; verify current schedule on ticketing portal.',
    lastVerifiedAt: '2026-11-11',
  },
  {
    id: 'inox-smartcity-dwd',
    name: 'INOX: Smartcity Mall, Dharwad',
    brand: 'PVR INOX',
    cityId: 'dharwad',
    city: 'Dharwad',
    area: 'P B Road · Lakamanahalli',
    address: 'Smartcity Mall, P B Road, Lakamanahalli, Dharwad, Karnataka 580004',
    coordinates: { lat: 15.4325, lng: 75.0395 },
    auditoriumCount: 4,
    supportedFormats: ['2D', '3D'],
    format: 'Multiplex · Twin-City Dharwad',
    auditorium: grandAuditorium,
    bookingProvider: 'bookmyshow',
    secondaryProviders: ['district', 'pvr_official'],
    externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-dharwad',
    verificationTier: 'MANUALLY_VERIFIED',
    verificationNotes:
      'Verified nearby multiplex in twin-city Dharwad along P B Road between Hubballi and Dharwad.',
    lastVerifiedAt: '2026-11-11',
  },
];

export const SHOW_TIMES = ['10:45', '14:15', '18:30', '21:45'];

export function getCinema(id: string | null): Cinema | null {
  if (!id) return null;
  if (id === 'lumiere') return cinemas[0];
  if (id === 'orion') return cinemas[1];
  return cinemas.find((c) => c.id === id) ?? null;
}

export function getCinemasByCity(cityId: 'hubballi' | 'dharwad' | 'all'): Cinema[] {
  if (cityId === 'all') return cinemas;
  return cinemas.filter((c) => c.cityId === cityId);
}

export function getCinemaProviders(cinema: Cinema): BookingProviderInfo[] {
  const ids = [cinema.bookingProvider, ...(cinema.secondaryProviders ?? [])];
  return ids.map((id) => BOOKING_PROVIDERS[id]).filter(Boolean);
}

/**
 * Generates provider-independent showtime records for a cinema + movie + date.
 * Because BookMyShow / District / Cinépolis do not expose open unauthenticated
 * showtime APIs, these slots are explicitly tagged as `DEMO_DATA` for the
 * 3D seat-preview prototype while linking out to the verified external booking portal.
 */
export function getShowtimesForCinema(
  cinema: Cinema,
  movieId: string,
  date: string,
  language = 'Kannada · Hindi · English',
): ShowtimeRecord[] {
  return SHOW_TIMES.map((startTime) => ({
    id: `${cinema.id}|${movieId}|${date}|${startTime}`,
    movieId,
    cinemaId: cinema.id,
    auditoriumId: cinema.auditorium.id,
    date,
    startTime,
    language,
    screeningFormat: cinema.supportedFormats[0] ?? '2D',
    verifiedPriceRange: null,
    availabilityStatus: 'UNVERIFIED_EXTERNAL',
    externalBookingUrl: cinema.externalBookingUrl,
    bookingProvider: cinema.bookingProvider,
    verificationTier: 'DEMO_DATA',
    lastVerifiedAt: cinema.lastVerifiedAt,
  }));
}

/** Local-date ISO key, e.g. 2026-11-11. */
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
