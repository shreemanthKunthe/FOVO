import { describe, it, expect } from 'vitest';
import {
  referenceAuditorium as cfg,
  grandAuditorium,
  imaxCurvedAuditorium,
  boutiqueReclinerAuditorium,
} from '../src/domain/layout/presets';
import { generateSeats, validateAuditoriumGeometry } from '../src/domain/layout/generateSeats';
import { createMapTransform } from '../src/domain/coords';
import { computeCameraPose, viewingStats } from '../src/domain/viewing';
import { neighbourSeat } from '../src/domain/navigation';
import { mockAvailability } from '../src/data/mockAvailability';
import {
  cinemas,
  getCinema,
  getCinemasByCity,
  getShowtimesForCinema,
  SUPPORTED_CITIES,
  type Cinema,
} from '../src/data/cinemas';
import { getMovie, getPrimaryTrailer, registerMovies, type Movie } from '../src/data/movies';
import { deduplicateMovies, DISCOVERY_CACHE_TTL_MS, isCacheStale } from '../src/services/tmdbClient';
import {
  convertVistaSeatPlanToFovo,
  SAMPLE_VISTA_SEAT_PLAN_PAYLOAD,
} from '../src/services/vistaSeatPlanConverter';
import { deduplicateAndEnrichCinemas } from '../src/services/cinemaProviders';
import { haversineDistanceKm } from '../src/services/locationService';
import { trailer, useTrailer } from '../src/features/trailer/TrailerController';

const seats = generateSeats(cfg);
const byId = (id: string) => seats.find((s) => s.id === id)!;

describe('reference auditorium', () => {
  it('has 183 seats with the expected section counts', () => {
    expect(seats).toHaveLength(183);
    const count = (s: string) => seats.filter((x) => x.section === s).length;
    expect(count('prime')).toBe(51);
    expect(count('classicPlus')).toBe(90);
    expect(count('classic')).toBe(30);
    expect(count('lounger')).toBe(12);
  });

  it('has unique ids and unique map/world positions', () => {
    expect(new Set(seats.map((s) => s.id)).size).toBe(seats.length);
    const keys = new Set(seats.map((s) => s.map.x.toFixed(3) + ',' + s.map.y.toFixed(3)));
    expect(keys.size).toBe(seats.length);
  });

  it('seat 1 is on the audience left (negative x)', () => {
    expect(byId('A-1').world.position[0]).toBeLessThan(byId('A-17').world.position[0]);
  });

  it('map <-> world round-trips', () => {
    const pts = seats.map((s) => ({ x: s.world.position[0], z: s.world.position[2] }));
    const t = createMapTransform(pts);
    for (const s of seats) {
      const m = t.worldToMap(s.world.position[0], s.world.position[2]);
      const w = t.mapToWorld(m.x, m.y);
      expect(Math.abs(w.x - s.world.position[0])).toBeLessThan(1e-6);
      expect(Math.abs(w.z - s.world.position[2])).toBeLessThan(1e-6);
    }
  });

  it('rows get farther from the screen and higher toward the back', () => {
    for (let i = 1; i < cfg.rows.length; i++) {
      expect(cfg.rows[i].z).toBeGreaterThan(cfg.rows[i - 1].z);
      expect(cfg.rows[i].riser).toBeGreaterThan(cfg.rows[i - 1].riser);
    }
  });

  it('the room is large enough for every seat and eye position', () => {
    for (const s of seats) {
      expect(Math.abs(s.eye.position[0])).toBeLessThan(cfg.dims.width / 2);
      expect(s.eye.position[2]).toBeLessThan(cfg.dims.length);
      expect(s.eye.position[1]).toBeLessThan(cfg.dims.height - 1);
    }
  });
});

describe.each([cfg, grandAuditorium])('sightlines: $id', (c) => {
  it('every row has an unobstructed sightline to the screen bottom (C-value)', () => {
    const HEAD = 0.12;
    const MIN_CLEARANCE = 0.06;
    for (let i = 1; i < c.rows.length; i++) {
      const front = c.rows[i - 1];
      const back = c.rows[i];
      const fs = c.sections[front.section];
      const bs = c.sections[back.section];
      const eyeBack = back.riser + bs.seatHeight + bs.eyeOffset;
      const headFront = front.riser + fs.seatHeight + fs.eyeOffset + HEAD;
      const frac = (back.z - front.z) / back.z;
      const rayY = eyeBack + (c.screen.bottomY - eyeBack) * frac;
      expect(rayY - headFront, `row ${back.label}`).toBeGreaterThanOrEqual(MIN_CLEARANCE);
    }
  });
});

describe('second auditorium is data driven', () => {
  it('has centre aisles and a different seat count', () => {
    const g = generateSeats(grandAuditorium);
    expect(g.length).toBe(12 + 2 * 16 + 7 * 16 + 3 * 18);
    const a9 = g.find((s) => s.id === 'A-9')!;
    const a10 = g.find((s) => s.id === 'A-10')!;
    const pitch = grandAuditorium.sections.prime.seatPitch;
    expect(a10.world.position[0] - a9.world.position[0]).toBeCloseTo(pitch + grandAuditorium.aisleWidth, 6);
  });
});

describe('first-person camera', () => {
  it('is at seated eye height above the row floor', () => {
    const s = byId('F-8');
    const row = cfg.rows.find((r) => r.label === 'F')!;
    const sec = cfg.sections[s.section];
    expect(s.eye.position[1]).toBeCloseTo(row.riser + sec.seatHeight + sec.eyeOffset, 6);
  });

  it('turns toward the screen from side seats', () => {
    expect(computeCameraPose(byId('C-1')).yaw).toBeLessThan(0);
    expect(computeCameraPose(byId('C-17')).yaw).toBeGreaterThan(0);
    expect(Math.abs(computeCameraPose(byId('C-9')).yaw)).toBeLessThan(0.02);
  });

  it('front rows fill more of the view than back rows', () => {
    const front = viewingStats(byId('L-6'), cfg);
    const back = viewingStats(byId('A-9'), cfg);
    expect(front.coverageDeg).toBeGreaterThan(back.coverageDeg);
    expect(front.distance).toBeLessThan(back.distance);
  });

  it('side seats have a larger off-axis angle than centre seats', () => {
    expect(viewingStats(byId('C-1'), cfg).offAxisDeg).toBeGreaterThan(viewingStats(byId('C-9'), cfg).offAxisDeg + 5);
  });
});

describe('seat navigation', () => {
  const av = mockAvailability(seats, 'test');
  it('never returns an unavailable seat and moves in the right direction', () => {
    const cur = seats.find((s) => av[s.id] === 'available' && s.row === 'F')!;
    for (const dir of ['left', 'right', 'front', 'back'] as const) {
      const n = neighbourSeat(seats, av, cur, dir);
      if (!n) continue;
      expect(av[n.id]).toBe('available');
      if (dir === 'left') expect(n.world.position[0]).toBeLessThan(cur.world.position[0]);
      if (dir === 'right') expect(n.world.position[0]).toBeGreaterThan(cur.world.position[0]);
      if (dir === 'front') expect(n.world.position[2]).toBeLessThan(cur.world.position[2]);
      if (dir === 'back') expect(n.world.position[2]).toBeGreaterThan(cur.world.position[2]);
    }
  });
});

describe('Hubballi–Dharwad cinema directory & dynamic discovery engine', () => {
  it('supports multi-city Indian markets (Bengaluru, Mumbai, Hubballi) and verifies Cinépolis Urban Oasis Mall', () => {
    expect(SUPPORTED_CITIES.some((c) => c.id === 'bengaluru')).toBe(true);
    expect(SUPPORTED_CITIES.some((c) => c.id === 'mumbai')).toBe(true);
    expect(SUPPORTED_CITIES.some((c) => c.id === 'hubballi')).toBe(true);
    const hubballiCinemas = getCinemasByCity('hubballi');
    expect(hubballiCinemas.length).toBeGreaterThanOrEqual(4);
    const cinepolis = getCinema('cinepolis-urban-oasis-hbl');
    expect(cinepolis).toBeDefined();
    expect(cinepolis?.city).toBe('Hubballi');
    expect(cinepolis?.auditoriumCount).toBe(5);
    expect(cinepolis?.verificationTier).toBe('MANUALLY_VERIFIED');
    expect(cinepolis?.auditorium?.verificationStatus).toBe('ESTIMATED_PROTOTYPE_LAYOUT');
  });

  it('registers, deduplicates, and resolves official trailers for dynamically discovered Indian releases', () => {
    const sampleA: Movie = {
      id: 'tmdb-112233',
      tmdbId: 112233,
      title: 'Kantara: Chapter 1',
      originalTitle: 'ಕಾಂತಾರ: ಅಧ್ಯಾಯ 1',
      genre: 'Action · Drama',
      genres: ['Action', 'Drama'],
      runtime: '2h 38m',
      runtimeMinutes: 158,
      rating: 'UA',
      language: 'Kannada',
      originalLanguage: 'kn',
      releaseDate: '2025-10-02',
      releaseStatus: 'Now Showing',
      synopsis: 'Prequel exploring the origins of the ancestral deity in Kadambas era.',
      posterUrl: 'https://image.tmdb.org/t/p/w500/sample.jpg',
      backdropUrl: null,
      accent: '#1B2430',
      cast: [{ id: 1, name: 'Rishab Shetty', character: 'Shiva' }],
      trailers: [
        {
          id: 'yt-kn',
          movieId: 'tmdb-112233',
          title: 'Official Kannada Trailer',
          provider: 'YouTube',
          videoId: 'TMQUFhWm8C0',
          language: 'Kannada',
          type: 'Trailer',
          official: true,
          embeddable: true,
        },
        {
          id: 'yt-hi',
          movieId: 'tmdb-112233',
          title: 'Official Hindi Trailer',
          provider: 'YouTube',
          videoId: '8mrVmf239GU',
          language: 'Hindi',
          type: 'Trailer',
          official: true,
          embeddable: true,
        },
      ],
      trailerUrl: '',
      dataSource: 'TMDB_LIVE',
    };

    const deduped = deduplicateMovies([sampleA, { ...sampleA }]);
    expect(deduped).toHaveLength(1);

    registerMovies(deduped);
    const lookedUp = getMovie('tmdb-112233');
    expect(lookedUp?.title).toBe('Kantara: Chapter 1');
    expect(getPrimaryTrailer(lookedUp, 'Kannada')?.videoId).toBe('TMQUFhWm8C0');
    expect(getPrimaryTrailer(lookedUp, 'Hindi')?.videoId).toBe('8mrVmf239GU');
  });

  it('enforces a 3-hour cache TTL for discovery freshness', () => {
    const now = Date.now();
    expect(DISCOVERY_CACHE_TTL_MS).toBe(3 * 60 * 60 * 1000);
    expect(isCacheStale(null, now)).toBe(true);
    expect(isCacheStale(now - 30 * 60 * 1000, now)).toBe(false);
    expect(isCacheStale(now - 4 * 60 * 60 * 1000, now)).toBe(true);
  });

  it('configures TrailerController for 3D screen playback without any obsolete MP4 upload method', () => {
    expect('loadFile' in trailer).toBe(false);
    trailer.enter(
      {
        id: 'tmdb-112233',
        title: 'Kantara: Chapter 1',
        accent: '#1B2430',
        trailerMeta: {
          id: 'yt-kn',
          movieId: 'tmdb-112233',
          title: 'Official Kannada Trailer',
          provider: 'YouTube',
          videoId: 'TMQUFhWm8C0',
          language: 'Kannada',
          type: 'Trailer',
          official: true,
          embeddable: true,
        },
      },
      { width: 11, centerY: 3.9 },
    );
    expect(useTrailer.getState().source).toBe('youtube');
    expect(useTrailer.getState().videoId).toBe('TMQUFhWm8C0');

    trailer.setVolume(0.5);
    expect(useTrailer.getState().volume).toBe(0.5);
    expect(useTrailer.getState().muted).toBe(false);

    trailer.setMuted(true);
    expect(useTrailer.getState().muted).toBe(true);

    trailer.leave();
    expect(useTrailer.getState().status).toBe('idle');
    expect(useTrailer.getState().source).toBe('none');
  });

  it('generates provider-independent showtime records labeled as DEMO_DATA with external handoff URLs', () => {
    const cinepolis = cinemas[0];
    const records = getShowtimesForCinema(cinepolis, 'tmdb-112233', '2026-11-12', 'Kannada');
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].verificationTier).toBe('DEMO_DATA');
    expect(records[0].externalBookingUrl).toContain('https://');
  });
});

describe('Universal Auditorium Architecture, Vista SeatPlan Converter & Automated Discovery', () => {
  it('supports curved IMAX and boutique recliner auditorium geometries with inward-angled seats', () => {
    const imaxSeats = generateSeats(imaxCurvedAuditorium);
    expect(imaxSeats.length).toBe(288);
    expect(validateAuditoriumGeometry(imaxCurvedAuditorium).valid).toBe(true);

    // Outer seats in a curved IMAX row curve slightly forward (smaller z) and angle inward (non-zero rotationY)
    const rowASeats = imaxSeats.filter((s) => s.row === 'A');
    const leftMost = rowASeats[0];
    const centerSeat = rowASeats[Math.floor(rowASeats.length / 2)];
    const rightMost = rowASeats[rowASeats.length - 1];
    expect(leftMost.world.position[2]).toBeLessThan(centerSeat.world.position[2]);
    expect(leftMost.world.rotationY).toBeGreaterThan(0);
    expect(rightMost.world.rotationY).toBeLessThan(0);

    const reclinerSeats = generateSeats(boutiqueReclinerAuditorium);
    expect(reclinerSeats.length).toBe(64);
    expect(validateAuditoriumGeometry(boutiqueReclinerAuditorium).valid).toBe(true);
  });

  it('converts a Vista Cinema Connect GetSessionSeatPlan payload into FOVO 3D coordinates and live availability', () => {
    const res = convertVistaSeatPlanToFovo(SAMPLE_VISTA_SEAT_PLAN_PAYLOAD, {
      cinemaId: 'pvr-nexus-koramangala-blr',
      city: 'Bengaluru',
      country: 'India',
    });
    expect(res.ok).toBe(true);
    expect(res.config).not.toBeNull();
    expect(res.config?.layoutSource).toBe('VISTA_CONNECT_API');
    expect(res.config?.verificationStatus).toBe('VISTA_GRID_CALIBRATED');
    expect(res.config?.rows.length).toBe(9);

    // Row J has ColumnIndex jumps at 4->6 and 11->13, which should be detected as aislesAfter [4, 10]
    const rowJ = res.config!.rows.find((r) => r.label === 'J');
    expect(rowJ?.aislesAfter).toEqual([4, 10]);

    // Check mapped seat availability from Vista Status codes (0=Available, 1=Sold)
    expect(res.availability['J-1']).toBe('available');
    expect(res.availability['J-6']).toBe('occupied');
  });

  it('rejects malformed Vista payloads that lack SeatLayoutData.Areas', () => {
    // @ts-expect-error testing invalid payload
    const bad = convertVistaSeatPlanToFovo({ SeatLayoutData: {} });
    expect(bad.ok).toBe(false);
    expect(bad.config).toBeNull();
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('deduplicates discovered cinemas by external Place/OSM ID and proximity, and preserves honest fallback when no seat map exists', () => {
    const blrCoords = { lat: 12.9716, lng: 77.5946 };
    const placeA: Cinema = {
      id: 'gplace-ChIJ123',
      externalIds: { googlePlaceId: 'ChIJ123' },
      name: 'INOX: Garuda Mall, Magrath Road',
      brand: 'PVR INOX',
      cityId: 'bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      area: 'Ashok Nagar',
      address: 'Garuda Mall, Magrath Road, Bengaluru',
      coordinates: { lat: 12.9703, lng: 77.6094 },
      auditoriumCount: null,
      supportedFormats: ['2D', '3D'],
      format: 'Discovered via Google Places API (New)',
      auditorium: null,
      auditoriums: [],
      hasSeatMapSupport: false,
      seatMapProvider: 'NONE',
      dataSource: 'GOOGLE_PLACES_NEW',
      bookingProvider: 'bookmyshow',
      externalBookingUrl: 'https://in.bookmyshow.com/explore/cinemas-bengaluru',
      verificationTier: 'LIVE_VERIFIED',
      verificationNotes: 'Discovered via Google Places API (New).',
      lastVerifiedAt: '2026-11-12',
    };
    const duplicateOsmNearPlaceA: Cinema = {
      ...placeA,
      id: 'cinema-osm-node-999',
      externalIds: { osmId: 'osm-node-999' },
      name: 'INOX Garuda Mall',
      coordinates: { lat: 12.9704, lng: 77.6095 },
      dataSource: 'OSM_OVERPASS_LIVE',
    };

    const deduped = deduplicateAndEnrichCinemas([placeA, duplicateOsmNearPlaceA], blrCoords);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].externalIds?.googlePlaceId).toBe('ChIJ123');
    expect(deduped[0].externalIds?.osmId).toBe('osm-node-999');
    expect(deduped[0].hasSeatMapSupport).toBe(false);
    expect(deduped[0].auditorium).toBeNull();
    expect(deduped[0].distanceKm).toBeCloseTo(
      haversineDistanceKm(blrCoords, placeA.coordinates),
      1,
    );
  });
});
