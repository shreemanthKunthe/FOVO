export type SectionId = 'prime' | 'classicPlus' | 'classic' | 'lounger';
export type Vec3 = [number, number, number];
/** Availability of a seat for a given showtime. "Selected" is derived from the booking store. */
export type SeatStatus = 'available' | 'occupied' | 'unavailable';

export interface SectionDef {
  id: SectionId;
  label: string;
  price: number;
  color: string;
  seatStyle: 'standard' | 'recliner' | 'lounger';
  /** Centre-to-centre spacing between seats in this section (m). */
  seatPitch: number;
  /** Seat cushion height above the row floor (m). */
  seatHeight: number;
  /** Eye height above the seat cushion (m). */
  eyeOffset: number;
}

export interface RowDef {
  /** Display label, e.g. "A". */
  label: string;
  section: SectionId;
  seatCount: number;
  /** Seat numbers after which an aisle gap is inserted. */
  aislesAfter?: number[];
  /** Seat numbers that physically do not exist. */
  missingSeats?: number[];
  /** Distance of the row from the screen plane (m). */
  z: number;
  /** Floor elevation of the row (m). */
  riser: number;
  /** Optional horizontal radius of curvature (m) for curved / IMAX rows. */
  curveRadius?: number;
}

export type AuditoriumArchShape =
  | 'rectangular'
  | 'curved'
  | 'imax'
  | 'recliner_lounge'
  | 'irregular';

export type LayoutSourceType =
  | 'VISTA_CONNECT_API'
  | 'OPERATOR_CAD_SURVEY'
  | 'IMPORTED_JSON_LAYOUT'
  | 'CALIBRATED_TEMPLATE';

export type AuditoriumVerificationStatus =
  | 'VERIFIED_LAYOUT'
  | 'VISTA_GRID_CALIBRATED'
  | 'ESTIMATED_PROTOTYPE_LAYOUT';

export interface AuditoriumConfig {
  id: string;
  name: string;
  cinemaId?: string;
  screenNumber?: number;
  country?: string;
  city?: string;
  archShape?: AuditoriumArchShape;
  layoutSource?: LayoutSourceType;
  lastVerifiedAt?: string;
  /** Clearly distinguishes verified floorplans from Vista-calibrated or estimated configurations. */
  verificationStatus?: AuditoriumVerificationStatus;
  verificationNotes?: string;
  dims: { width: number; length: number; height: number };
  /** Screen centred on x = 0, on the plane z = 0. */
  screen: { width: number; height: number; bottomY: number };
  aisleWidth: number;
  sections: Record<SectionId, SectionDef>;
  /** Ordered front (nearest screen) to back. */
  rows: RowDef[];
}

/**
 * Data verification tier required across cinemas, showtimes and seat availability:
 * - LIVE_VERIFIED: obtained in real time from an authorized API.
 * - MANUALLY_VERIFIED: checked against reliable public listings and entered with a timestamp.
 * - DEMO_DATA: simulated/estimated prototype data, never presented as live availability.
 */
export type DataVerificationTier = 'LIVE_VERIFIED' | 'MANUALLY_VERIFIED' | 'DEMO_DATA';

export type CinemaDiscoverySource =
  | 'GOOGLE_PLACES_NEW'
  | 'OSM_OVERPASS_LIVE'
  | 'VERIFIED_REGISTRY';

export type SeatMapProviderType =
  | 'VISTA_CONNECT'
  | 'VERIFIED_SURVEY'
  | 'IMPORTED_JSON'
  | 'CALIBRATED_MODEL'
  | 'NONE';

export interface ExternalCinemaIds {
  googlePlaceId?: string;
  osmId?: string;
  vistaCinemaId?: string;
  movieGluCinemaId?: string;
}

export interface CityRecord {
  id: string;
  name: string;
  alternateName?: string;
  state: string;
  country: string;
  countryCode?: string;
  coordinates: { lat: number; lng: number };
  isPrimaryMarket: boolean;
  defaultLanguages?: string[];
}

export interface BookingProviderInfo {
  id: 'bookmyshow' | 'district' | 'cinepolis_official' | 'pvr_official';
  name: string;
  websiteUrl: string;
  integrationType: 'EXTERNAL_HANDOFF' | 'PARTNERSHIP_REQUIRED';
  notes: string;
}

export interface TrailerMetadata {
  id: string;
  movieId: string;
  title: string;
  provider: 'YouTube' | 'DirectVideo';
  /** YouTube 11-char ID or direct video path. */
  videoId: string;
  language: string;
  type: 'Trailer' | 'Teaser' | 'Clip';
  official: boolean;
  embeddable: boolean;
  directVideoUrl?: string;
}

export interface ShowtimeRecord {
  id: string;
  movieId: string;
  cinemaId: string;
  auditoriumId: string;
  date: string;
  startTime: string;
  language: string;
  screeningFormat: string;
  /** Only populated when verified; otherwise null and shown as "See provider". */
  verifiedPriceRange: string | null;
  availabilityStatus: 'AVAILABLE' | 'FILLING_FAST' | 'UNVERIFIED_EXTERNAL';
  externalBookingUrl: string;
  bookingProvider: BookingProviderInfo['id'];
  verificationTier: DataVerificationTier;
  lastVerifiedAt: string;
}

export interface Seat {
  id: string; // "A-12"
  row: string;
  number: number;
  section: SectionId;
  world: { position: Vec3; rotationY: number };
  eye: { position: Vec3; lookAt: Vec3 };
  map: { x: number; y: number };
}
