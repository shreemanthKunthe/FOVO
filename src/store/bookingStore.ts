import { create } from 'zustand';

export type Step = 'landing' | 'movies' | 'showtimes' | 'seats' | 'preview' | 'checkout' | 'confirmed';
export type CityFilter = 'hubballi' | 'dharwad' | 'all';

interface BookingState {
  step: Step;
  cityId: CityFilter;
  movieId: string | null;
  cinemaId: string | null;
  date: string | null;
  time: string | null;
  /** Selection persists across map, preview and checkout. */
  selectedSeatId: string | null;
  /** Optional second seat kept for side-by-side comparison. */
  pinnedSeatId: string | null;
  /** Optional language override for trailer playback. */
  trailerLanguage: string | null;
  bookingRef: string | null;

  go: (step: Step) => void;
  setCity: (cityId: CityFilter) => void;
  selectMovie: (id: string) => void;
  selectShow: (cinemaId: string, date: string, time: string) => void;
  selectSeat: (id: string | null) => void;
  pinSeat: (id: string | null) => void;
  setTrailerLanguage: (lang: string | null) => void;
  /** Launches directly into the full 3D seat experience for a preset seat & show. */
  launchSeatPreview: (movieId: string, cinemaId: string, date: string, time: string, seatId: string) => void;
  /** SIMULATED: nothing is reserved and no payment is taken. */
  confirmSimulatedBooking: () => void;
  reset: () => void;
}

export const useBooking = create<BookingState>((set) => ({
  step: 'landing',
  cityId: 'hubballi',
  movieId: null,
  cinemaId: null,
  date: null,
  time: null,
  selectedSeatId: null,
  pinnedSeatId: null,
  trailerLanguage: null,
  bookingRef: null,

  go: (step) => set({ step }),
  setCity: (cityId) => set({ cityId }),
  selectMovie: (id) =>
    set({
      movieId: id,
      cinemaId: null,
      date: null,
      time: null,
      selectedSeatId: null,
      pinnedSeatId: null,
      trailerLanguage: null,
      step: 'showtimes',
    }),
  selectShow: (cinemaId, date, time) =>
    set({ cinemaId, date, time, selectedSeatId: null, pinnedSeatId: null, step: 'seats' }),
  selectSeat: (id) => set({ selectedSeatId: id }),
  pinSeat: (id) => set({ pinnedSeatId: id }),
  setTrailerLanguage: (trailerLanguage) => set({ trailerLanguage }),
  launchSeatPreview: (movieId, cinemaId, date, time, seatId) =>
    set({
      movieId,
      cinemaId,
      date,
      time,
      selectedSeatId: seatId,
      pinnedSeatId: null,
      step: 'preview',
    }),
  confirmSimulatedBooking: () =>
    set({ bookingRef: 'SIM-' + Math.random().toString(36).slice(2, 8).toUpperCase(), step: 'confirmed' }),
  reset: () =>
    set({
      step: 'movies',
      movieId: null,
      cinemaId: null,
      date: null,
      time: null,
      selectedSeatId: null,
      pinnedSeatId: null,
      trailerLanguage: null,
      bookingRef: null,
    }),
}));
