import { useMemo } from 'react';
import { useBooking } from './bookingStore';
import { getMovie, type Movie } from '../data/movies';
import { getCinema, type Cinema } from '../data/cinemas';
import { getSeats } from '../domain/layout/generateSeats';
import { mockAvailability } from '../data/mockAvailability';
import type { AuditoriumConfig, Seat, SeatStatus } from '../domain/types';

export interface Show {
  movie: Movie;
  cinema: Cinema;
  config: AuditoriumConfig;
  seats: Seat[];
  availability: Record<string, SeatStatus>;
  date: string;
  time: string;
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
    return { movie, cinema, config, seats, availability, date, time };
  }, [movieId, cinemaId, date, time]);
}

