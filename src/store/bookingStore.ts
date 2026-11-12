import { create } from 'zustand';
import type { CityRecord } from '../domain/types';
import { SUPPORTED_CITIES } from '../data/cinemas';
import {
  findMatchingSupportedCity,
  loadPersistedCity,
  savePersistedCity,
  type LocationPermissionState,
} from '../services/locationService';

export type Step = 'landing' | 'movies' | 'showtimes' | 'seats' | 'preview' | 'checkout' | 'confirmed';
export type CityFilter = string;

const initialCity = loadPersistedCity();

interface BookingState {
  step: Step;
  cityId: CityFilter;
  selectedCity: CityRecord;
  locationStatus: LocationPermissionState;
  userCoordinates: { lat: number; lng: number } | null;
  locationMessage: string | null;
  movieId: string | null;
  cinemaId: string | null;
  auditoriumId: string | null;
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
  setCity: (cityOrId: CityFilter | CityRecord) => void;
  setLocationState: (opts: {
    status: LocationPermissionState;
    coordinates?: { lat: number; lng: number } | null;
    city?: CityRecord | null;
    message?: string | null;
  }) => void;
  selectMovie: (id: string) => void;
  selectShow: (cinemaId: string, date: string, time: string, auditoriumId?: string | null) => void;
  setAuditorium: (auditoriumId: string) => void;
  selectSeat: (id: string | null) => void;
  pinSeat: (id: string | null) => void;
  setTrailerLanguage: (lang: string | null) => void;
  /** Launches directly into the full 3D seat experience for a preset seat & show. */
  launchSeatPreview: (
    movieId: string,
    cinemaId: string,
    date: string,
    time: string,
    seatId: string,
    auditoriumId?: string | null,
  ) => void;
  /** SIMULATED: nothing is reserved and no payment is taken. */
  confirmSimulatedBooking: () => void;
  reset: () => void;
}

export const useBooking = create<BookingState>((set) => ({
  step: 'landing',
  cityId: initialCity.id,
  selectedCity: initialCity,
  locationStatus: 'idle',
  userCoordinates: null,
  locationMessage: null,
  movieId: null,
  cinemaId: null,
  auditoriumId: null,
  date: null,
  time: null,
  selectedSeatId: null,
  pinnedSeatId: null,
  trailerLanguage: null,
  bookingRef: null,

  go: (step) => set({ step }),
  setCity: (cityOrId) => {
    if (typeof cityOrId === 'string') {
      const matched =
        findMatchingSupportedCity(cityOrId) ??
        SUPPORTED_CITIES[0];
      savePersistedCity(matched);
      set({
        cityId: cityOrId,
        selectedCity: matched,
        locationMessage: null,
      });
    } else {
      savePersistedCity(cityOrId);
      set({
        cityId: cityOrId.id,
        selectedCity: cityOrId,
        locationMessage: null,
      });
    }
  },
  setLocationState: ({ status, coordinates, city, message }) =>
    set((prev) => {
      const nextCity = city ?? prev.selectedCity;
      if (city) savePersistedCity(city);
      return {
        locationStatus: status,
        userCoordinates: coordinates !== undefined ? coordinates : prev.userCoordinates,
        selectedCity: nextCity,
        cityId: nextCity.id,
        locationMessage: message !== undefined ? message : prev.locationMessage,
      };
    }),
  selectMovie: (id) =>
    set({
      movieId: id,
      cinemaId: null,
      auditoriumId: null,
      date: null,
      time: null,
      selectedSeatId: null,
      pinnedSeatId: null,
      trailerLanguage: null,
      step: 'showtimes',
    }),
  selectShow: (cinemaId, date, time, auditoriumId = null) =>
    set({
      cinemaId,
      auditoriumId,
      date,
      time,
      selectedSeatId: null,
      pinnedSeatId: null,
      step: 'seats',
    }),
  setAuditorium: (auditoriumId) =>
    set({
      auditoriumId,
      selectedSeatId: null,
      pinnedSeatId: null,
    }),
  selectSeat: (id) => set({ selectedSeatId: id }),
  pinSeat: (id) => set({ pinnedSeatId: id }),
  setTrailerLanguage: (trailerLanguage) => set({ trailerLanguage }),
  launchSeatPreview: (movieId, cinemaId, date, time, seatId, auditoriumId = null) =>
    set({
      movieId,
      cinemaId,
      auditoriumId,
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
      auditoriumId: null,
      date: null,
      time: null,
      selectedSeatId: null,
      pinnedSeatId: null,
      trailerLanguage: null,
      bookingRef: null,
    }),
}));
