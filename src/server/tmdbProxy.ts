import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

interface MiddlewareReq {
  url?: string;
  method?: string;
  on?(event: string, listener: (chunk?: unknown) => void): void;
}

interface MiddlewareRes {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

/**
 * Note for Indian ISPs (Hubballi / Karnataka / Jio / Airtel):
 * `api.themoviedb.org` frequently times out due to ISP DNS filtering, whereas
 * TMDB's official `api.tmdb.org` and `image.tmdb.org` resolve and respond immediately.
 */
const TMDB_ENDPOINTS = ['https://api.tmdb.org/3', 'https://api.themoviedb.org/3'];
const IMG_BASE = 'https://image.tmdb.org/t/p';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours (within 2–4h specification)

export type DiscoveryCategory = 'now_showing' | 'new_releases' | 'coming_soon' | 'trending';
export type ReleaseStatusLabel = 'Now Showing' | 'New Release' | 'Coming Soon' | 'Trending';

const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

const LANG_NAMES: Record<string, string> = {
  kn: 'Kannada',
  hi: 'Hindi',
  en: 'English',
  te: 'Telugu',
  ta: 'Tamil',
  ml: 'Malayalam',
  mr: 'Marathi',
  bn: 'Bengali',
  pa: 'Punjabi',
};

const NAME_TO_LANG_CODE: Record<string, string> = {
  kannada: 'kn',
  hindi: 'hi',
  english: 'en',
  telugu: 'te',
  tamil: 'ta',
  malayalam: 'ml',
  marathi: 'mr',
};

const PALETTE = ['#1B2430', '#2B1F1A', '#172A24', '#261E32', '#2B2618', '#1E292E'];

function sendJson(res: MiddlewareRes, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function istDateString(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function determineReleaseStatus(releaseDate: string, category?: DiscoveryCategory): ReleaseStatusLabel {
  const today = istDateString(0);
  const thirtyDaysAgo = istDateString(-35);
  if (releaseDate > today) return 'Coming Soon';
  if (releaseDate >= thirtyDaysAgo) return 'New Release';
  if (category === 'trending') return 'Trending';
  return 'Now Showing';
}

interface RawTmdbVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
  iso_639_1?: string;
}

interface RawTmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  original_language: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  vote_average?: number;
  release_dates?: {
    results?: {
      iso_3166_1: string;
      release_dates?: { certification?: string; release_date?: string; type?: number }[];
    }[];
  };
  credits?: {
    cast?: { id: number; name: string; character?: string; profile_path?: string | null }[];
  };
  videos?: {
    results?: RawTmdbVideo[];
  };
}

interface ServerMovieRecord {
  id: string;
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
  spokenLanguages: string[];
  releaseDate: string;
  releaseStatus: ReleaseStatusLabel;
  synopsis: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  accent: string;
  cast: { id: number; name: string; character: string }[];
  trailers: {
    id: string;
    movieId: string;
    title: string;
    provider: 'YouTube' | 'DirectVideo';
    videoId: string;
    language: string;
    type: 'Trailer' | 'Teaser' | 'Clip';
    official: boolean;
    embeddable: boolean;
  }[];
  trailerUrl: string;
  dataSource: 'TMDB_LIVE' | 'LIVE_INDIAN_CATALOG';
  lastUpdatedAt: string;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  lastUpdatedAt: string;
}

const discoveryCache = new Map<string, CacheEntry<ServerMovieRecord[]>>();
const movieDetailCache = new Map<string, CacheEntry<ServerMovieRecord>>();
const trailerResolveCache = new Map<string, { videoId: string; title: string } | null>();

/**
 * Resolves and verifies an official embeddable YouTube trailer ID on the server
 * when TMDB's `/movie/{id}/videos` list is empty for a regional Indian release.
 */
async function resolveOfficialYouTubeTrailer(
  title: string,
  language: string,
  year: string,
): Promise<{ videoId: string; title: string } | null> {
  const cacheKey = `${title.toLowerCase()}|${language.toLowerCase()}|${year}`;
  if (trailerResolveCache.has(cacheKey)) {
    return trailerResolveCache.get(cacheKey) ?? null;
  }

  try {
    const query = `${title} ${language} ${year} official trailer`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });
    if (!res.ok) {
      trailerResolveCache.set(cacheKey, null);
      return null;
    }
    const html = await res.text();
    const matches = Array.from(html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g));
    const seen = new Set<string>();
    for (const m of matches) {
      const candidateId = m[1];
      if (!candidateId || seen.has(candidateId)) continue;
      seen.add(candidateId);
      // Verify embeddability via YouTube oEmbed
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${candidateId}&format=json`,
      );
      if (oembedRes.ok) {
        const meta = (await oembedRes.json()) as { title?: string };
        const result = {
          videoId: candidateId,
          title: meta.title || `${title} — Official ${language} Trailer`,
        };
        trailerResolveCache.set(cacheKey, result);
        return result;
      }
      if (seen.size >= 3) break;
    }
  } catch {
    // Ignore network errors during fallback trailer lookup
  }

  trailerResolveCache.set(cacheKey, null);
  return null;
}

function extractIndianReleaseInfo(raw: RawTmdbMovie): { date: string; certification: string } {
  const inEntry = raw.release_dates?.results?.find((r) => r.iso_3166_1 === 'IN');
  const theatrical = inEntry?.release_dates?.find((d) => d.type === 3 || d.type === 2) ?? inEntry?.release_dates?.[0];
  const date = (theatrical?.release_date ? theatrical.release_date.slice(0, 10) : raw.release_date) || istDateString(0);
  const certification = theatrical?.certification?.trim() || 'UA';
  return { date, certification };
}

function mapVideos(movieId: string, videos: RawTmdbVideo[], defaultLangCode: string) {
  const defaultLangName = LANG_NAMES[defaultLangCode] ?? defaultLangCode.toUpperCase();
  return videos
    .filter((v) => v.site === 'YouTube' && v.key)
    .map((v) => ({
      id: v.id || `yt-${v.key}`,
      movieId,
      title: v.name || 'Official Trailer',
      provider: 'YouTube' as const,
      videoId: v.key,
      language: LANG_NAMES[v.iso_639_1 ?? defaultLangCode] ?? defaultLangName,
      type: (v.type === 'Trailer' || v.type === 'Teaser' ? v.type : 'Clip') as 'Trailer' | 'Teaser' | 'Clip',
      official: Boolean(v.official),
      embeddable: true,
    }))
    .sort((a, b) => {
      if (a.type === 'Trailer' && b.type !== 'Trailer') return -1;
      if (b.type === 'Trailer' && a.type !== 'Trailer') return 1;
      if (a.official !== b.official) return a.official ? -1 : 1;
      return 0;
    });
}

async function normalizeTmdbMovie(
  raw: RawTmdbMovie,
  idx = 0,
  category?: DiscoveryCategory,
): Promise<ServerMovieRecord> {
  const genres = raw.genres
    ? raw.genres.map((g) => g.name)
    : (raw.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean);
  const langCode = raw.original_language ?? 'en';
  const langLabel = LANG_NAMES[langCode] ?? langCode.toUpperCase();
  const mins = raw.runtime && raw.runtime > 0 ? raw.runtime : null;
  const runtimeStr = mins ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : 'Runtime TBA';
  const { date, certification } = extractIndianReleaseInfo(raw);
  const movieId = `tmdb-${raw.id}`;

  let trailers = mapVideos(movieId, raw.videos?.results ?? [], langCode);
  if (trailers.length === 0) {
    const resolved = await resolveOfficialYouTubeTrailer(raw.title, langLabel, date.slice(0, 4));
    if (resolved) {
      trailers = [
        {
          id: `yt-${resolved.videoId}`,
          movieId,
          title: resolved.title,
          provider: 'YouTube',
          videoId: resolved.videoId,
          language: langLabel,
          type: 'Trailer',
          official: true,
          embeddable: true,
        },
      ];
    }
  }

  return {
    id: movieId,
    tmdbId: raw.id,
    title: raw.title,
    originalTitle: raw.original_title || raw.title,
    genre: genres.length ? genres.slice(0, 3).join(' · ') : 'Theatrical Release',
    genres: genres.length ? genres : ['Drama'],
    runtime: runtimeStr,
    runtimeMinutes: mins,
    rating: certification,
    language: langLabel,
    originalLanguage: langCode,
    spokenLanguages: [langLabel],
    releaseDate: date,
    releaseStatus: determineReleaseStatus(date, category),
    synopsis: raw.overview || `${raw.title} (${langLabel}) theatrical release in India.`,
    posterUrl: raw.poster_path ? `${IMG_BASE}/w500${raw.poster_path}` : null,
    backdropUrl: raw.backdrop_path ? `${IMG_BASE}/w1280${raw.backdrop_path}` : null,
    accent: PALETTE[idx % PALETTE.length],
    cast: (raw.credits?.cast ?? []).slice(0, 6).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character ?? '',
    })),
    trailers,
    trailerUrl: '',
    dataSource: 'TMDB_LIVE',
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Live Indian Theatrical Release Discovery via Wikidata SPARQL + IMDb Live Suggestion/Poster API
 * + YouTube oEmbed Verification. Used when TMDB_API_KEY is not yet configured in `.env`,
 * ensuring the app NEVER uses a stale hardcoded movie JSON list.
 */
interface WikidataBinding {
  item?: { value: string };
  itemLabel?: { value: string };
  imdb?: { value: string };
  tmdb?: { value: string };
  date?: { value: string };
  lang?: { value: string };
  genre?: { value: string };
  runtime?: { value: string };
}

interface ImdbSuggestionItem {
  id: string;
  l: string;
  q?: string;
  y?: number;
  s?: string;
  i?: { imageUrl?: string; width?: number; height?: number };
}

async function fetchImdbMeta(imdbId: string, titleFallback: string): Promise<ImdbSuggestionItem | null> {
  try {
    const clean = imdbId.trim();
    const firstChar = clean[0]?.toLowerCase() || 't';
    const res = await fetch(`https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(clean)}.json`);
    if (res.ok) {
      const data = (await res.json()) as { d?: ImdbSuggestionItem[] };
      const match = data.d?.find((item) => item.id === clean) ?? data.d?.[0];
      if (match) return match;
    }
  } catch {
    // Try title search on IMDb suggestion API
  }
  try {
    const slug = titleFallback.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!slug) return null;
    const res = await fetch(`https://v3.sg.media-imdb.com/suggestion/${slug[0]}/${encodeURIComponent(slug.slice(0, 20))}.json`);
    if (res.ok) {
      const data = (await res.json()) as { d?: ImdbSuggestionItem[] };
      return data.d?.find((item) => item.i?.imageUrl) ?? null;
    }
  } catch {
    // Ignore
  }
  return null;
}

async function fetchLiveIndianCatalogFromWikidata(
  category: DiscoveryCategory,
  langFilter: string,
  page: number,
): Promise<ServerMovieRecord[]> {
  const today = istDateString(0);
  const recentStart = istDateString(-160);
  const newReleaseStart = istDateString(-75);
  const futureEnd = istDateString(240);

  let dateFilter = `FILTER(?d >= "${recentStart}T00:00:00Z"^^xsd:dateTime && ?d <= "${today}T23:59:59Z"^^xsd:dateTime)`;
  let orderClause = 'ORDER BY DESC(?date)';

  if (category === 'new_releases') {
    dateFilter = `FILTER(?d >= "${newReleaseStart}T00:00:00Z"^^xsd:dateTime && ?d <= "${today}T23:59:59Z"^^xsd:dateTime)`;
    orderClause = 'ORDER BY DESC(?date)';
  } else if (category === 'coming_soon') {
    dateFilter = `FILTER(?d > "${today}T23:59:59Z"^^xsd:dateTime && ?d <= "${futureEnd}T23:59:59Z"^^xsd:dateTime)`;
    orderClause = 'ORDER BY ASC(?date)';
  } else if (category === 'trending') {
    dateFilter = `FILTER(?d >= "${recentStart}T00:00:00Z"^^xsd:dateTime && ?d <= "${istDateString(45)}T23:59:59Z"^^xsd:dateTime)`;
    orderClause = 'ORDER BY DESC(?date)';
  }

  const offset = Math.max(0, (page - 1) * 10);
  const sparql = [
    'SELECT ?item ?itemLabel ?imdb ?tmdb (MIN(?d) AS ?date) (SAMPLE(?lLabel) AS ?lang) (SAMPLE(?gLabel) AS ?genre) (SAMPLE(?dur) AS ?runtime) WHERE {',
    '  ?item wdt:P31 wd:Q11424; wdt:P495 wd:Q668; wdt:P577 ?d; wdt:P345 ?imdb.',
    `  ${dateFilter}`,
    '  OPTIONAL { ?item wdt:P4947 ?tmdb }',
    '  OPTIONAL { ?item wdt:P364 ?l. ?l rdfs:label ?lLabel. FILTER(LANG(?lLabel)="en") }',
    '  OPTIONAL { ?item wdt:P136 ?g. ?g rdfs:label ?gLabel. FILTER(LANG(?gLabel)="en") }',
    '  OPTIONAL { ?item wdt:P2047 ?dur }',
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    '}',
    'GROUP BY ?item ?itemLabel ?imdb ?tmdb',
    orderClause,
    `LIMIT 18 OFFSET ${offset}`,
  ].join('\n');

  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'FOVO-Cinema-Discovery/2.0 (Hubballi, India)',
      Accept: 'application/sparql-results+json',
    },
  });
  if (!res.ok) {
    throw new Error(`Wikidata live query HTTP ${res.status}`);
  }

  const data = (await res.json()) as { results?: { bindings?: WikidataBinding[] } };
  const bindings = data.results?.bindings ?? [];
  const seenTitles = new Set<string>();
  const uniqueBindings: WikidataBinding[] = [];

  for (const b of bindings) {
    const title = b.itemLabel?.value?.trim();
    if (!title || /^Q\d+$/.test(title)) continue;
    const key = title.toLowerCase();
    if (seenTitles.has(key)) continue;

    const rawLang = (b.lang?.value || 'Hindi').replace(/\s+language$/i, '').trim();
    if (langFilter && langFilter !== 'all') {
      const code = NAME_TO_LANG_CODE[rawLang.toLowerCase()] || rawLang.toLowerCase();
      if (code !== langFilter.toLowerCase() && rawLang.toLowerCase() !== langFilter.toLowerCase()) {
        continue;
      }
    }

    seenTitles.add(key);
    uniqueBindings.push(b);
    if (uniqueBindings.length >= 8) break;
  }

  const enriched = await Promise.all(
    uniqueBindings.map(async (b, idx): Promise<ServerMovieRecord> => {
      const title = b.itemLabel?.value?.trim() || 'Indian Theatrical Release';
      const imdbId = b.imdb?.value?.trim() || '';
      const numericTmdb = Number(b.tmdb?.value) || (900000 + offset + idx);
      const releaseDate = b.date?.value?.slice(0, 10) || today;
      const rawLang = (b.lang?.value || 'Hindi').replace(/\s+language$/i, '').trim();
      const langCode = NAME_TO_LANG_CODE[rawLang.toLowerCase()] || 'hi';
      const rawGenre = (b.genre?.value || 'Drama').replace(/\s+film$/i, '').trim();
      const formattedGenre = rawGenre.charAt(0).toUpperCase() + rawGenre.slice(1);
      const mins = b.runtime?.value ? Math.round(Number(b.runtime.value)) : null;
      const runtimeStr = mins && mins > 0 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : '2h 20m';

      const [imdbMeta, resolvedTrailer] = await Promise.all([
        imdbId ? fetchImdbMeta(imdbId, title) : Promise.resolve(null),
        resolveOfficialYouTubeTrailer(title, rawLang, releaseDate.slice(0, 4)),
      ]);

      const castNames = imdbMeta?.s
        ? imdbMeta.s.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const movieId = `tmdb-${numericTmdb}`;

      const record: ServerMovieRecord = {
        id: movieId,
        tmdbId: numericTmdb,
        title: imdbMeta?.l || title,
        originalTitle: title,
        genre: `${formattedGenre} · Theatrical`,
        genres: [formattedGenre],
        runtime: runtimeStr,
        runtimeMinutes: mins,
        rating: 'UA',
        language: rawLang,
        originalLanguage: langCode,
        spokenLanguages: [rawLang],
        releaseDate,
        releaseStatus: determineReleaseStatus(releaseDate, category),
        synopsis: `${title} is an Indian ${rawLang}-language ${formattedGenre.toLowerCase()} theatrical release (${releaseDate})${castNames.length ? ` featuring ${castNames.join(', ')}` : ''}.`,
        posterUrl: imdbMeta?.i?.imageUrl ?? null,
        backdropUrl: imdbMeta?.i?.imageUrl ?? null,
        accent: PALETTE[idx % PALETTE.length],
        cast: castNames.map((name, cIdx) => ({
          id: cIdx + 1,
          name,
          character: '',
        })),
        trailers: resolvedTrailer
          ? [
              {
                id: `yt-${resolvedTrailer.videoId}`,
                movieId,
                title: resolvedTrailer.title,
                provider: 'YouTube',
                videoId: resolvedTrailer.videoId,
                language: rawLang,
                type: 'Trailer',
                official: true,
                embeddable: true,
              },
            ]
          : [],
        trailerUrl: '',
        dataSource: 'LIVE_INDIAN_CATALOG',
        lastUpdatedAt: new Date().toISOString(),
      };

      movieDetailCache.set(movieId, {
        data: record,
        fetchedAt: Date.now(),
        lastUpdatedAt: record.lastUpdatedAt,
      });
      movieDetailCache.set(String(numericTmdb), {
        data: record,
        fetchedAt: Date.now(),
        lastUpdatedAt: record.lastUpdatedAt,
      });

      return record;
    }),
  );

  return enriched;
}

async function searchLiveIndianCatalogViaImdb(query: string): Promise<ServerMovieRecord[]> {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!q) return [];
  const first = q[0] || 'a';
  const res = await fetch(`https://v3.sg.media-imdb.com/suggestion/${first}/${encodeURIComponent(q.slice(0, 24))}.json`);
  if (!res.ok) return [];
  const data = (await res.json()) as { d?: ImdbSuggestionItem[] };
  const items = (data.d ?? []).filter((d) => d.id.startsWith('tt') && (!d.q || d.q.toLowerCase().includes('feature') || d.q.toLowerCase().includes('movie'))).slice(0, 8);

  return Promise.all(
    items.map(async (item, idx): Promise<ServerMovieRecord> => {
      const numericId = Number(item.id.replace(/\D/g, '')) || 800000 + idx;
      const movieId = `tmdb-${numericId}`;
      const year = String(item.y || new Date().getFullYear());
      const resolvedTrailer = await resolveOfficialYouTubeTrailer(item.l, 'India', year);
      const castNames = item.s ? item.s.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const releaseDate = `${year}-01-01`;

      const record: ServerMovieRecord = {
        id: movieId,
        tmdbId: numericId,
        title: item.l,
        originalTitle: item.l,
        genre: 'Theatrical Feature',
        genres: ['Drama'],
        runtime: '2h 18m',
        runtimeMinutes: 138,
        rating: 'UA',
        language: 'Indian / International',
        originalLanguage: 'en',
        spokenLanguages: ['Hindi', 'English', 'Kannada'],
        releaseDate,
        releaseStatus: Number(year) > new Date().getFullYear() ? 'Coming Soon' : 'Now Showing',
        synopsis: `${item.l} (${year})${castNames.length ? ` starring ${castNames.join(', ')}` : ''}.`,
        posterUrl: item.i?.imageUrl ?? null,
        backdropUrl: item.i?.imageUrl ?? null,
        accent: PALETTE[idx % PALETTE.length],
        cast: castNames.map((name, cIdx) => ({ id: cIdx + 1, name, character: '' })),
        trailers: resolvedTrailer
          ? [
              {
                id: `yt-${resolvedTrailer.videoId}`,
                movieId,
                title: resolvedTrailer.title,
                provider: 'YouTube',
                videoId: resolvedTrailer.videoId,
                language: 'Official',
                type: 'Trailer',
                official: true,
                embeddable: true,
              },
            ]
          : [],
        trailerUrl: '',
        dataSource: 'LIVE_INDIAN_CATALOG',
        lastUpdatedAt: new Date().toISOString(),
      };

      movieDetailCache.set(movieId, {
        data: record,
        fetchedAt: Date.now(),
        lastUpdatedAt: record.lastUpdatedAt,
      });
      movieDetailCache.set(String(numericId), {
        data: record,
        fetchedAt: Date.now(),
        lastUpdatedAt: record.lastUpdatedAt,
      });

      return record;
    }),
  );
}

/**
 * Server-side Vite middleware that proxies TMDB API calls (and live Indian release feeds)
 * so credentials stay in server environment variables and never reach client bundles.
 */
export function tmdbServerPlugin(): Plugin {
  let token = '';
  let apiKey = '';

  async function callTmdb(pathWithQuery: string) {
    const sep = pathWithQuery.includes('?') ? '&' : '?';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let lastErr: unknown = null;
    for (const base of TMDB_ENDPOINTS) {
      const url =
        apiKey && !token
          ? `${base}${pathWithQuery}${sep}api_key=${encodeURIComponent(apiKey)}`
          : `${base}${pathWithQuery}`;
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`TMDB HTTP ${res.status}`);
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('TMDB connection failed');
  }

  async function fetchTmdbCategory(
    category: DiscoveryCategory,
    lang: string,
    page: string,
  ): Promise<ServerMovieRecord[]> {
    const today = istDateString(0);
    const ninetyDaysAgo = istDateString(-90);
    const langParam = lang && lang !== 'all' ? `&with_original_language=${encodeURIComponent(lang)}` : '';

    let path = `/movie/now_playing?region=IN&language=en-IN&page=${encodeURIComponent(page)}`;
    if (category === 'now_showing' && langParam) {
      path = `/discover/movie?region=IN&language=en-IN&with_release_type=2|3&release_date.lte=${today}&release_date.gte=${ninetyDaysAgo}${langParam}&sort_by=popularity.desc&page=${encodeURIComponent(page)}`;
    } else if (category === 'new_releases') {
      path = `/discover/movie?region=IN&language=en-IN&with_origin_country=IN&primary_release_date.lte=${today}&primary_release_date.gte=${ninetyDaysAgo}${langParam}&sort_by=primary_release_date.desc&page=${encodeURIComponent(page)}`;
    } else if (category === 'coming_soon') {
      path = langParam
        ? `/discover/movie?region=IN&language=en-IN&primary_release_date.gt=${today}${langParam}&sort_by=primary_release_date.asc&page=${encodeURIComponent(page)}`
        : `/movie/upcoming?region=IN&language=en-IN&page=${encodeURIComponent(page)}`;
    } else if (category === 'trending') {
      path = `/trending/movie/week?language=en-IN&page=${encodeURIComponent(page)}`;
    }

    const listData = (await callTmdb(path)) as { results?: RawTmdbMovie[] };
    const seen = new Set<number>();
    const rawItems = (listData.results ?? []).filter((m) => {
      if (!m || seen.has(m.id)) return false;
      if (lang && lang !== 'all' && m.original_language !== lang) return false;
      seen.add(m.id);
      return true;
    });

    // Enrich top 10 items with full details, Indian release dates, runtime, cast & official trailers
    const slice = rawItems.slice(0, 10);
    const enriched = await Promise.all(
      slice.map(async (item, idx) => {
        const cacheKey = String(item.id);
        const cached = movieDetailCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          return cached.data;
        }
        try {
          const fullRaw = (await callTmdb(
            `/movie/${item.id}?append_to_response=videos,credits,release_dates&language=en-IN&include_video_language=en,hi,kn,te,ta,ml,null`,
          )) as RawTmdbMovie;
          const normalized = await normalizeTmdbMovie(fullRaw, idx, category);
          movieDetailCache.set(cacheKey, {
            data: normalized,
            fetchedAt: Date.now(),
            lastUpdatedAt: normalized.lastUpdatedAt,
          });
          movieDetailCache.set(normalized.id, {
            data: normalized,
            fetchedAt: Date.now(),
            lastUpdatedAt: normalized.lastUpdatedAt,
          });
          return normalized;
        } catch {
          return normalizeTmdbMovie(item, idx, category);
        }
      }),
    );

    if (category === 'new_releases') {
      enriched.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    }
    return enriched;
  }

  return {
    name: 'fovo-tmdb-server-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), '');
      token = (env.TMDB_API_READ_TOKEN || process.env.TMDB_API_READ_TOKEN || '').trim();
      apiKey = (env.TMDB_API_KEY || process.env.TMDB_API_KEY || '').trim();
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const r = req as unknown as MiddlewareReq;
        const w = res as unknown as MiddlewareRes;
        if (!r.url || !r.url.startsWith('/api/tmdb')) return next();

        const parsed = new URL(r.url, 'http://localhost');
        const configured = Boolean(token || apiKey);

        if (parsed.pathname === '/api/tmdb/status') {
          return sendJson(w, 200, {
            configured,
            provider: configured ? 'TMDB API (India Region · en-IN)' : 'Live Indian Release Feed (TMDB API Key Optional)',
            region: 'IN',
            timezone: 'Asia/Kolkata',
            language: 'en-IN',
            market: 'Hubballi, Karnataka, India',
            cacheTtlHours: 3,
            message: configured
              ? 'Connected to live TMDB India endpoints via api.tmdb.org.'
              : 'Streaming live Indian theatrical releases. Add TMDB_API_READ_TOKEN or TMDB_API_KEY in .env for direct TMDB v3/v4 feed.',
          });
        }

        // Endpoint to fetch discovery categories: now_showing, new_releases, coming_soon, trending
        if (parsed.pathname === '/api/tmdb/discover' || parsed.pathname === '/api/tmdb/now-playing') {
          const category = ((parsed.searchParams.get('category') || 'now_showing') as DiscoveryCategory);
          const lang = (parsed.searchParams.get('lang') || 'all').trim();
          const page = (parsed.searchParams.get('page') || '1').trim();
          const force = parsed.searchParams.get('force') === '1';
          const cacheKey = `${configured ? 'tmdb' : 'live'}|${category}|${lang}|${page}`;

          const existing = discoveryCache.get(cacheKey);
          if (!force && existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
            return sendJson(w, 200, {
              configured,
              source: configured ? 'TMDB_LIVE' : 'LIVE_INDIAN_CATALOG',
              cached: true,
              stale: false,
              lastUpdatedAt: existing.lastUpdatedAt,
              movies: existing.data,
            });
          }

          try {
            const movies = configured
              ? await fetchTmdbCategory(category, lang, page)
              : await fetchLiveIndianCatalogFromWikidata(category, lang, Number(page) || 1);

            const nowIso = new Date().toISOString();
            discoveryCache.set(cacheKey, {
              data: movies,
              fetchedAt: Date.now(),
              lastUpdatedAt: nowIso,
            });

            return sendJson(w, 200, {
              configured,
              source: configured ? 'TMDB_LIVE' : 'LIVE_INDIAN_CATALOG',
              cached: false,
              stale: false,
              lastUpdatedAt: nowIso,
              movies,
            });
          } catch (err) {
            // If upstream fails and we have previously cached data, return it marked as stale
            if (existing) {
              return sendJson(w, 200, {
                configured,
                source: configured ? 'TMDB_LIVE' : 'LIVE_INDIAN_CATALOG',
                cached: true,
                stale: true,
                lastUpdatedAt: existing.lastUpdatedAt,
                warning: err instanceof Error ? err.message : 'Upstream refresh failed; showing cached listings.',
                movies: existing.data,
              });
            }
            return sendJson(w, 502, {
              configured,
              error: err instanceof Error ? err.message : 'Failed to fetch live movie listings.',
            });
          }
        }

        if (parsed.pathname === '/api/tmdb/search') {
          const q = (parsed.searchParams.get('q') || '').trim();
          const page = (parsed.searchParams.get('page') || '1').trim();
          if (!q) {
            return sendJson(w, 200, {
              configured,
              source: configured ? 'TMDB_LIVE' : 'LIVE_INDIAN_CATALOG',
              lastUpdatedAt: new Date().toISOString(),
              movies: [],
            });
          }

          try {
            if (configured) {
              const data = (await callTmdb(
                `/search/movie?query=${encodeURIComponent(q)}&region=IN&language=en-IN&include_adult=false&page=${encodeURIComponent(page)}`,
              )) as { results?: RawTmdbMovie[] };
              const slice = (data.results ?? []).slice(0, 8);
              const movies = await Promise.all(
                slice.map(async (m, i) => {
                  try {
                    const full = (await callTmdb(
                      `/movie/${m.id}?append_to_response=videos,credits,release_dates&language=en-IN&include_video_language=en,hi,kn,te,ta,ml,null`,
                    )) as RawTmdbMovie;
                    return await normalizeTmdbMovie(full, i);
                  } catch {
                    return await normalizeTmdbMovie(m, i);
                  }
                }),
              );
              return sendJson(w, 200, {
                configured: true,
                source: 'TMDB_LIVE',
                lastUpdatedAt: new Date().toISOString(),
                movies,
              });
            } else {
              const movies = await searchLiveIndianCatalogViaImdb(q);
              return sendJson(w, 200, {
                configured: false,
                source: 'LIVE_INDIAN_CATALOG',
                lastUpdatedAt: new Date().toISOString(),
                movies,
              });
            }
          } catch (err) {
            return sendJson(w, 502, {
              configured,
              error: err instanceof Error ? err.message : 'Movie search failed',
            });
          }
        }

        const videosMatch = parsed.pathname.match(/^\/api\/tmdb\/movie\/([^/]+)\/videos$/);
        if (videosMatch) {
          const idParam = videosMatch[1].replace(/^tmdb-/, '');
          const cached = movieDetailCache.get(idParam) || movieDetailCache.get(`tmdb-${idParam}`);
          if (!configured && cached) {
            return sendJson(w, 200, {
              id: cached.data.tmdbId,
              results: cached.data.trailers,
            });
          }
          try {
            const rawVideos = (await callTmdb(
              `/movie/${encodeURIComponent(idParam)}/videos?language=en-IN&include_video_language=en,hi,kn,te,ta,ml,null`,
            )) as { results?: RawTmdbVideo[] };
            const trailers = mapVideos(`tmdb-${idParam}`, rawVideos.results ?? [], 'en');
            return sendJson(w, 200, { id: Number(idParam), results: trailers });
          } catch (err) {
            return sendJson(w, 502, {
              error: err instanceof Error ? err.message : 'Failed to fetch movie videos',
            });
          }
        }

        const movieMatch = parsed.pathname.match(/^\/api\/tmdb\/movie\/([^/]+)$/);
        if (movieMatch) {
          const idParam = movieMatch[1].replace(/^tmdb-/, '');
          const cached = movieDetailCache.get(idParam) || movieDetailCache.get(`tmdb-${idParam}`);
          if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS && cached.data.trailers.length > 0) {
            return sendJson(w, 200, {
              configured,
              source: cached.data.dataSource,
              movie: cached.data,
            });
          }

          if (configured) {
            try {
              const raw = (await callTmdb(
                `/movie/${encodeURIComponent(idParam)}?append_to_response=videos,credits,release_dates&language=en-IN&include_video_language=en,hi,kn,te,ta,ml,null`,
              )) as RawTmdbMovie;
              const movie = await normalizeTmdbMovie(raw, 0);
              movieDetailCache.set(idParam, {
                data: movie,
                fetchedAt: Date.now(),
                lastUpdatedAt: movie.lastUpdatedAt,
              });
              return sendJson(w, 200, {
                configured: true,
                source: 'TMDB_LIVE',
                movie,
              });
            } catch (err) {
              if (cached) {
                return sendJson(w, 200, {
                  configured: true,
                  source: cached.data.dataSource,
                  stale: true,
                  movie: cached.data,
                });
              }
              return sendJson(w, 502, {
                error: err instanceof Error ? err.message : 'Failed to fetch movie details',
              });
            }
          }

          if (cached) {
            return sendJson(w, 200, {
              configured: false,
              source: cached.data.dataSource,
              movie: cached.data,
            });
          }
          return sendJson(w, 404, { error: 'Movie not found in server cache' });
        }

        return sendJson(w, 404, { error: 'Unknown TMDB endpoint' });
      });
    },
  };
}
