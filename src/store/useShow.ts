import { useMemo } from 'react';
import { useBooking } from './bookingStore';
import { getMovie, type Movie } from '../data/movies';
import { getCinema, getShowtimesForCinema, type Cinema } from '../data/cinemas';
import { getSeats } from '../domain/layout/generateSeats';
import { mockAvailability } from '../data/mockAvailability';
import type { AuditoriumConfig, Seat, SeatStatus, ShowtimeRecord } from '../domain/types';

export interface Show {
  movie: Movie;
  cinema: Cinema;
  config: AuditoriumConfig;
  seats: Seat[];
  availability: Record<string, SeatStatus>;
  date: string;
  time: string;
  showtimeRecord: ShowtimeRecord;
}

/** The currently chosen showtime plus its seats, or null until fully chosen. */
export function useShow(): Show | null {
  const movieId = useBooking((s) => s.movieId);
  const cinemaId = useBooking((s) => s.cinemaId);
  const date = useBooking((s) => s.date);
  const time = useBooking((s) => s.time);
  return useMemo(() => {
    const movie = getMovie(movieId);
    const cinema = getCinema(cinemaId);
    if (!movie || !cinema || !date || !time) return null;
    const config = cinema.auditorium;
    const seats = getSeats(config);
    const availability = mockAvailability(seats, `${cinema.id}|${date}|${time}`);
    const records = getShowtimesForCinema(cinema, movie.id, date, movie.language);
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
    return { movie, cinema, config, seats, availability, date, time, showtimeRecord };
  }, [movieId, cinemaId, date, time]);
}
