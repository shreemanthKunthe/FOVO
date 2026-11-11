import type { TrailerMetadata } from '../domain/types';

export type DiscoveryCategory = 'now_showing' | 'new_releases' | 'coming_soon' | 'trending';
export type ReleaseStatusLabel = 'Now Showing' | 'New Release' | 'Coming Soon' | 'Trending';

export interface CastMember {
  id: number;
  name: string;
  character: string;
}

export interface Movie {
  id: string;
  /** TMDB numeric movie ID. */
  tmdbId: number;
  title: string;
  originalTitle: string;
  genre: string;
  genres: string[];
  runtime: string;
  runtimeMinutes: number | null;
  rating: string;
  language: string;
  originalLanguage: string;
  spokenLanguages?: string[];
  releaseDate: string;
  releaseStatus?: ReleaseStatusLabel;
  synopsis: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  /** Poster fallback surface colour while poster image loads. */
  accent: string;
  cast: CastMember[];
  /** Official associated trailers (YouTube / DirectVideo). */
  trailers: TrailerMetadata[];
  /** Optional licensed direct video asset for WebGL VideoTexture projection. */
  trailerUrl: string;
  /** Indicates live metadata source. */
  dataSource: 'TMDB_LIVE' | 'LIVE_INDIAN_CATALOG' | 'CACHED_STALE';
  lastUpdatedAt?: string;
}

const runtimeMovies = new Map<string, Movie>();

/**
 * Registers dynamically fetched movies into the in-memory lookup store.
 * Deduplicates by movie ID and TMDB ID.
 */
export function registerMovies(list: Movie[]): void {
  for (const m of list) {
    if (!m || !m.id) continue;
    runtimeMovies.set(m.id, m);
    runtimeMovies.set(String(m.tmdbId), m);
  }
}

export function getRegisteredMovies(): Movie[] {
  const unique = new Map<number, Movie>();
  for (const m of runtimeMovies.values()) {
    if (!unique.has(m.tmdbId)) {
      unique.set(m.tmdbId, m);
    }
  }
  return Array.from(unique.values());
}

export function getMovie(id: string | null): Movie | null {
  if (!id) return null;
  const direct = runtimeMovies.get(id) ?? runtimeMovies.get(id.replace(/^tmdb-/, ''));
  if (direct) return direct;
  // If requested before discovery finishes loading, return the first registered movie if any
  const all = getRegisteredMovies();
  return all[0] ?? null;
}

export function getPrimaryTrailer(movie: Movie | null | undefined, preferredLanguage?: string): TrailerMetadata | null {
  if (!movie || !movie.trailers || movie.trailers.length === 0) return null;
  const embeddable = movie.trailers.filter((t) => t.embeddable !== false && Boolean(t.videoId || t.directVideoUrl));
  if (embeddable.length === 0) return null;

  if (preferredLanguage) {
    const match = embeddable.find((t) =>
      t.language.toLowerCase().includes(preferredLanguage.toLowerCase()),
    );
    if (match) return match;
  }
  const officialTrailer = embeddable.find((t) => t.type === 'Trailer' && t.official);
  return officialTrailer ?? embeddable[0];
}
