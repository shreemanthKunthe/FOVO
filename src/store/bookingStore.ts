import { create } from 'zustand';

export type Step = 'movies' | 'showtimes' | 'seats' | 'preview' | 'checkout' | 'confirmed';

interface BookingState {
  step: Step;
  movieId: string | null;
  cinemaId: string | null;
  date: string | null;
  time: string | null;
  /** Selection persists across map, preview and checkout. */
  selectedSeatId: string | null;
  /** Optional second seat kept for side-by-side comparison. */
  pinnedSeatId: string | null;
  bookingRef: string | null;

  go: (step: Step) => void;
  selectMovie: (id: string) => void;
  selectShow: (cinemaId: string, date: string, time: string) => void;
  selectSeat: (id: string | null) => void;
  pinSeat: (id: string | null) => void;
  /** SIMULATED: nothing is reserved and no payment is taken. */
  confirmSimulatedBooking: () => void;
  reset: () => void;
}

export const useBooking = create<BookingState>((set) => ({
  step: 'movies',
  movieId: null,
  cinemaId: null,
  date: null,
  time: null,
  selectedSeatId: null,
  pinnedSeatId: null,
  bookingRef: null,

  go: (step) => set({ step }),
  selectMovie: (id) =>
    set({ movieId: id, cinemaId: null, date: null, time: null, selectedSeatId: null, pinnedSeatId: null, step: 'showtimes' }),
  selectShow: (cinemaId, date, time) =>
    set({ cinemaId, date, time, selectedSeatId: null, pinnedSeatId: null, step: 'seats' }),
  selectSeat: (id) => set({ selectedSeatId: id }),
  pinSeat: (id) => set({ pinnedSeatId: id }),
  confirmSimulatedBooking: () =>
    set({ bookingRef: 'SIM-' + Math.random().toString(36).slice(2, 8).toUpperCase(), step: 'confirmed' }),
  reset: () =>
    set({
      step: 'movies', movieId: null, cinemaId: null, date: null, time: null,
      selectedSeatId: null, pinnedSeatId: null, bookingRef: null,
    }),
}));

