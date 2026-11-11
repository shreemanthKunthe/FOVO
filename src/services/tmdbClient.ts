import {
  getRegisteredMovies,
  registerMovies,
  type DiscoveryCategory,
  type Movie,
} from '../data/movies';

export const DISCOVERY_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const STORAGE_KEY_PREFIX = 'fovo_movie_discovery_v2:';

export interface TmdbStatus {
  configured: boolean;
  provider: string;
  region: string;
  timezone: string;
  language: string;
  market: string;
  cacheTtlHours: number;
  message: string;
}

export interface DiscoveryResult {
  movies: Movie[];
  source: 'TMDB_LIVE' | 'LIVE_INDIAN_CATALOG' | 'CACHED_STALE';
  stale: boolean;
  cached: boolean;
  lastUpdatedAt: string | null;
  error?: string;
}

interface StoredDiscoveryCache {
  movies: Movie[];
  source: 'TMDB_LIVE' | 'LIVE_INDIAN_CATALOG';
  fetchedAt: number;
  lastUpdatedAt: string;
}

function readLocalCache(key: string): StoredDiscoveryCache | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDiscoveryCache;
    if (!parsed || !Array.isArray(parsed.movies) || parsed.movies.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalCache(key: string, entry: StoredDiscoveryCache): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore storage quota errors
  }
}

export function isCacheStale(fetchedAt: number | null | undefined, now = Date.now()): boolean {
  if (!fetchedAt) return true;
  return now - fetchedAt >= DISCOVERY_CACHE_TTL_MS;
}

export function deduplicateMovies(list: Movie[]): Movie[] {
  const seen = new Set<string>();
  const out: Movie[] = [];
  for (const m of list) {
    const k = `${m.tmdbId}|${m.title.toLowerCase().trim()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

export async function fetchTmdbStatus(): Promise<TmdbStatus> {
  const res = await fetch('/api/tmdb/status');
  if (!res.ok) {
    throw new Error(`Status check failed (${res.status})`);
  }
  return (await res.json()) as TmdbStatus;
}

/**
 * Fetches dynamic Indian movie releases by category, language and page.
 * Uses a 3-hour freshness window; if the API fails, retains previously cached data
 * with an explicit `stale: true` indicator rather than presenting stale data as current.
 */
export async function fetchDiscoveryMovies(options: {
  category?: DiscoveryCategory;
  language?: string;
  page?: number;
  forceRefresh?: boolean;
} = {}): Promise<DiscoveryResult> {
  const category = options.category ?? 'now_showing';
  const language = options.language ?? 'all';
  const page = options.page ?? 1;
  const force = Boolean(options.forceRefresh);
  const cacheKey = `${category}|${language}|${page}`;

  const localEntry = typeof window !== 'undefined' ? readLocalCache(cacheKey) : null;
  if (!force && localEntry && !isCacheStale(localEntry.fetchedAt)) {
    const deduped = deduplicateMovies(localEntry.movies);
    registerMovies(deduped);
    return {
      movies: deduped,
      source: localEntry.source,
      stale: false,
      cached: true,
      lastUpdatedAt: localEntry.lastUpdatedAt,
    };
  }

  try {
    const params = new URLSearchParams({
      category,
      lang: language,
      page: String(page),
      force: force ? '1' : '0',
    });
    const res = await fetch(`/api/tmdb/discover?${params.toString()}`);
    if (!res.ok) {
      const errPayload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errPayload.error || `Discovery request failed (${res.status})`);
    }

    const payload = (await res.json()) as {
      movies?: Movie[];
      source?: 'TMDB_LIVE' | 'LIVE_INDIAN_CATALOG';
      stale?: boolean;
      cached?: boolean;
      lastUpdatedAt?: string;
      warning?: string;
    };

    const movies = deduplicateMovies(payload.movies ?? []);
    if (movies.length > 0) {
      registerMovies(movies);
      const lastUpdatedAt = payload.lastUpdatedAt ?? new Date().toISOString();
      const source = payload.source ?? 'TMDB_LIVE';
      if (!payload.stale && typeof window !== 'undefined') {
        writeLocalCache(cacheKey, {
          movies,
          source,
          fetchedAt: Date.now(),
          lastUpdatedAt,
        });
      }
      return {
        movies,
        source: payload.stale ? 'CACHED_STALE' : source,
        stale: Boolean(payload.stale),
        cached: Boolean(payload.cached),
        lastUpdatedAt,
        error: payload.warning,
      };
    }

    throw new Error('No movies returned for this filter.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reach movie discovery service.';
    if (localEntry && localEntry.movies.length > 0) {
      const deduped = deduplicateMovies(localEntry.movies);
      registerMovies(deduped);
      return {
        movies: deduped,
        source: 'CACHED_STALE',
        stale: true,
        cached: true,
        lastUpdatedAt: localEntry.lastUpdatedAt,
        error: `${message} Showing previously cached listings from ${new Date(localEntry.lastUpdatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST.`,
      };
    }

    const inMemory = getRegisteredMovies();
    return {
      movies: inMemory,
      source: 'CACHED_STALE',
      stale: true,
      cached: inMemory.length > 0,
      lastUpdatedAt: null,
      error: message,
    };
  }
}

export async function searchMoviesCatalog(query: string, page = 1): Promise<DiscoveryResult> {
  const q = query.trim();
  if (!q) return fetchDiscoveryMovies({ category: 'now_showing', page });

  try {
    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`);
    if (!res.ok) {
      throw new Error(`Search failed (${res.status})`);
    }
    const data = (await res.json()) as {
      movies?: Movie[];
      source?: 'TMDB_LIVE' | 'LIVE_INDIAN_CATALOG';
      lastUpdatedAt?: string;
    };
    const movies = deduplicateMovies(data.movies ?? []);
    registerMovies(movies);
    return {
      movies,
      source: data.source ?? 'TMDB_LIVE',
      stale: false,
      cached: false,
      lastUpdatedAt: data.lastUpdatedAt ?? new Date().toISOString(),
    };
  } catch (err) {
    const lower = q.toLowerCase();
    const matched = getRegisteredMovies().filter(
      (m) =>
        m.title.toLowerCase().includes(lower) ||
        m.originalTitle.toLowerCase().includes(lower) ||
        m.genre.toLowerCase().includes(lower) ||
        m.language.toLowerCase().includes(lower),
    );
    return {
      movies: matched,
      source: 'CACHED_STALE',
      stale: true,
      cached: true,
      lastUpdatedAt: null,
      error: err instanceof Error ? err.message : 'Search request failed; showing cached matches.',
    };
  }
}

export async function fetchMovieFullDetails(movie: Movie): Promise<Movie> {
  try {
    const res = await fetch(`/api/tmdb/movie/${encodeURIComponent(String(movie.tmdbId || movie.id))}`);
    if (res.ok) {
      const data = (await res.json()) as { movie?: Movie };
      if (data.movie) {
        registerMovies([data.movie]);
        return data.movie;
      }
    }
  } catch {
    // Retain existing movie record
  }
  return movie;
}

export async function fetchMovieVideos(movieIdOrTmdbId: string | number): Promise<Movie['trailers']> {
  try {
    const res = await fetch(`/api/tmdb/movie/${encodeURIComponent(String(movieIdOrTmdbId))}/videos`);
    if (res.ok) {
      const data = (await res.json()) as { results?: Movie['trailers'] };
      return data.results ?? [];
    }
  } catch {
    // Ignore
  }
  return [];
}
