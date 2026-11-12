import { useMemo } from 'react';
import { useBooking } from './bookingStore';
import { getMovie, type Movie } from '../data/movies';
import {
  getCinema,
  getCustomSeatAvailability,
  getShowtimesForCinema,
  type Cinema,
} from '../data/cinemas';
import { getSeats, validateAuditoriumGeometry } from '../domain/layout/generateSeats';
import { mockAvailability } from '../data/mockAvailability';
import type { AuditoriumConfig, Seat, SeatStatus, ShowtimeRecord } from '../domain/types';

export interface Show {
  movie: Movie;
  cinema: Cinema;
  config: AuditoriumConfig;
  seats: Seat[];
  availability: Record<string, SeatStatus>;
  availabilitySource: 'VISTA_SESSION_SEATPLAN' | 'DEMO_SIMULATION';
  date: string;
  time: string;
  showtimeRecord: ShowtimeRecord;
}

/** The currently chosen showtime plus its auditorium seats, or null until chosen and geometry is valid. */
export function useShow(): Show | null {
  const movieId = useBooking((s) => s.movieId);
  const cinemaId = useBooking((s) => s.cinemaId);
  const auditoriumId = useBooking((s) => s.auditoriumId);
  const date = useBooking((s) => s.date);
  const time = useBooking((s) => s.time);

  return useMemo(() => {
    const movie = getMovie(movieId);
    const cinema = getCinema(cinemaId);
    if (!movie || !cinema || !date || !time) return null;

    const config =
      (auditoriumId
        ? cinema.auditoriums.find((a) => a.id === auditoriumId)
        : null) ??
      cinema.auditorium ??
      cinema.auditoriums[0] ??
      null;

    if (!config) return null;
    const validation = validateAuditoriumGeometry(config);
    if (!validation.valid) return null;

    const seats = getSeats(config);
    const customAvail = getCustomSeatAvailability(cinema.id, config.id);
    const availability =
      customAvail ?? mockAvailability(seats, `${cinema.id}|${config.id}|${date}|${time}`);
    const availabilitySource = customAvail ? 'VISTA_SESSION_SEATPLAN' : 'DEMO_SIMULATION';

    const records = getShowtimesForCinema(cinema, movie.id, date, movie.language, config.id);
    const showtimeRecord =
      records.find((r) => r.startTime === time) ?? {
        id: `${cinema.id}|${movie.id}|${date}|${time}`,
        cinemaId: cinema.id,
        movieId: movie.id,
        auditoriumId: config.id,
        date,
        startTime: time,
        language: movie.language,
        screeningFormat: cinema.format,
        verifiedPriceRange: null,
        availabilityStatus: 'UNVERIFIED_EXTERNAL',
        externalBookingUrl: cinema.externalBookingUrl,
        bookingProvider: cinema.bookingProvider,
        verificationTier: 'DEMO_DATA',
        lastVerifiedAt: cinema.lastVerifiedAt,
      };

    return {
      movie,
      cinema,
      config,
      seats,
      availability,
      availabilitySource,
      date,
      time,
      showtimeRecord,
    };
  }, [movieId, cinemaId, auditoriumId, date, time]);
}
