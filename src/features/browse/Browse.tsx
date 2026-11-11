import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getMovie,
  getPrimaryTrailer,
  type DiscoveryCategory,
  type Movie,
} from '../../data/movies';
import {
  cinemas,
  getCinemaProviders,
  getCinemasByCity,
  getShowtimesForCinema,
  isPast,
  nextDates,
  SHOW_TIMES,
  SUPPORTED_CITIES,
} from '../../data/cinemas';
import { getSeats } from '../../domain/layout/generateSeats';
import { mockAvailability } from '../../data/mockAvailability';
import {
  deduplicateMovies,
  fetchDiscoveryMovies,
  fetchMovieFullDetails,
  searchMoviesCatalog,
} from '../../services/tmdbClient';
import { useBooking, type CityFilter } from '../../store/bookingStore';

const CATEGORIES: { id: DiscoveryCategory; label: string; subtitle: string }[] = [
  {
    id: 'now_showing',
    label: 'Now Showing',
    subtitle: 'Currently screening in Indian theatres',
  },
  {
    id: 'new_releases',
    label: 'New Releases',
    subtitle: 'Latest Indian theatrical releases sorted by release date',
  },
  {
    id: 'coming_soon',
    label: 'Coming Soon',
    subtitle: 'Upcoming theatrical releases scheduled for India',
  },
  {
    id: 'trending',
    label: 'Trending',
    subtitle: 'Most watched and anticipated cinema releases this week',
  },
];

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'all', label: 'All Languages' },
  { code: 'kn', label: 'Kannada' },
  { code: 'hi', label: 'Hindi' },
  { code: 'en', label: 'English' },
  { code: 'te', label: 'Telugu' },
  { code: 'ta', label: 'Tamil' },
  { code: 'ml', label: 'Malayalam' },
];

function formatIstTimestamp(iso: string | null): string {
  if (!iso) return 'Just now';
  try {
    const d = new Date(iso);
    return (
      d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' IST'
    );
  } catch {
    return 'Recently';
  }
}

function formatReleaseDate(dateStr: string): string {
  if (!dateStr) return 'Release TBA';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function CityBar() {
  const cityId = useBooking((s) => s.cityId);
  const setCity = useBooking((s) => s.setCity);
  return (
    <div className="city-bar" role="region" aria-label="Target market city selection">
      <div className="city-bar-left">
        <span className="eyebrow-pill">INDIA MARKET · IN (ASIA/KOLKATA)</span>
        <strong>
          {cityId === 'hubballi'
            ? 'Hubballi, Karnataka'
            : cityId === 'dharwad'
              ? 'Dharwad, Karnataka'
              : 'Hubballi–Dharwad Twin Cities, Karnataka'}
        </strong>
      </div>
      <div className="city-switcher" role="tablist" aria-label="Select city">
        {SUPPORTED_CITIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={cityId === c.id}
            className={'city-pill' + (cityId === c.id ? ' on' : '')}
            onClick={() => setCity(c.id as CityFilter)}
          >
            {c.name}
            {c.isPrimaryMarket && <span className="pilot-dot" title="Primary Pilot Market" />}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={cityId === 'all'}
          className={'city-pill' + (cityId === 'all' ? ' on' : '')}
          onClick={() => setCity('all')}
        >
          Hubballi + Dharwad
        </button>
      </div>
    </div>
  );
}

function MovieCard({ movie, onSelect }: { movie: Movie; onSelect: (id: string) => void }) {
  const [imgError, setImgError] = useState(false);
  const primaryTrailer = getPrimaryTrailer(movie);
  const showImage = Boolean(movie.posterUrl && !imgError);

  return (
    <button
      type="button"
      className="movie-card"
      onClick={() => onSelect(movie.id)}
      aria-label={`${movie.title}, ${movie.language}, ${movie.releaseStatus || 'Now Showing'}`}
    >
      <div
        className="poster"
        style={{
          background: `radial-gradient(circle at 20% 20%, ${movie.accent || '#1B2430'}, #0B0B0D 86%)`,
        }}
      >
        {showImage && (
          <img
            src={movie.posterUrl!}
            alt={`${movie.title} theatrical poster`}
            loading="lazy"
            className="poster-img"
            onError={() => setImgError(true)}
          />
        )}
        <div className="poster-gradient" aria-hidden="true" />

        <div className="poster-top">
          <span className="poster-status">{movie.releaseStatus || 'Now Showing'}</span>
          <span className="poster-lang">{movie.language}</span>
        </div>

        <div className="poster-bottom">
          {!showImage && (
            <>
              {movie.originalTitle && movie.originalTitle !== movie.title && (
                <small className="poster-native">{movie.originalTitle}</small>
              )}
              <span className="poster-fallback-title">{movie.title}</span>
            </>
          )}
          <em className={'poster-trailer-tag' + (primaryTrailer ? ' ready' : ' pending')}>
            {primaryTrailer ? '▶ Official Trailer Ready' : 'Trailer Pending'}
          </em>
        </div>
      </div>

      <div className="movie-meta">
        <strong className="movie-card-title">{movie.title}</strong>
        <span className="movie-card-sub">{movie.genre}</span>
        <div className="movie-card-facts">
          <span>{formatReleaseDate(movie.releaseDate)}</span>
          <span>·</span>
          <span>{movie.runtime || 'Runtime TBA'}</span>
          <span>·</span>
          <span>{movie.rating}</span>
        </div>
      </div>
    </button>
  );
}

export function MovieList() {
  const selectMovie = useBooking((s) => s.selectMovie);
  const cityId = useBooking((s) => s.cityId);

  const [category, setCategory] = useState<DiscoveryCategory>('now_showing');
  const [lang, setLang] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [catalog, setCatalog] = useState<Movie[]>([]);
  const [source, setSource] = useState<'TMDB_LIVE' | 'LIVE_INDIAN_CATALOG' | 'CACHED_STALE'>('TMDB_LIVE');
  const [stale, setStale] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadDiscovery = useCallback(
    async (opts: {
      cat: DiscoveryCategory;
      language: string;
      targetPage: number;
      append: boolean;
      force: boolean;
    }) => {
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setErrorMsg(null);

      const res = await fetchDiscoveryMovies({
        category: opts.cat,
        language: opts.language,
        page: opts.targetPage,
        forceRefresh: opts.force,
      });

      setCatalog((prev) =>
        opts.append ? deduplicateMovies([...prev, ...res.movies]) : res.movies,
      );
      setSource(res.source);
      setStale(res.stale);
      if (res.lastUpdatedAt) setLastUpdatedAt(res.lastUpdatedAt);
      if (res.error) setErrorMsg(res.error);

      setLoading(false);
      setLoadingMore(false);
    },
    [],
  );

  useEffect(() => {
    if (query.trim()) return;
    setPage(1);
    void loadDiscovery({
      cat: category,
      language: lang,
      targetPage: 1,
      append: false,
      force: false,
    });
  }, [category, lang, query, loadDiscovery]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setErrorMsg(null);
      searchMoviesCatalog(trimmed, 1)
        .then((res) => {
          if (!active) return;
          setCatalog(res.movies);
          setSource(res.source);
          setStale(res.stale);
          if (res.lastUpdatedAt) setLastUpdatedAt(res.lastUpdatedAt);
          if (res.error) setErrorMsg(res.error);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleManualRefresh = () => {
    if (query.trim()) {
      setLoading(true);
      void searchMoviesCatalog(query.trim(), 1).then((res) => {
        setCatalog(res.movies);
        setSource(res.source);
        setStale(res.stale);
        if (res.lastUpdatedAt) setLastUpdatedAt(res.lastUpdatedAt);
        setErrorMsg(res.error ?? null);
        setLoading(false);
      });
      return;
    }
    setPage(1);
    void loadDiscovery({
      cat: category,
      language: lang,
      targetPage: 1,
      append: false,
      force: true,
    });
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    void loadDiscovery({
      cat: category,
      language: lang,
      targetPage: nextPage,
      append: true,
      force: false,
    });
  };

  const activeCategoryMeta = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const activeCinemas = useMemo(() => getCinemasByCity(cityId), [cityId]);

  return (
    <section className="discover-section">
      <CityBar />

      <div className="discover-head">
        <div>
          <h1 className="page-title">
            {activeCategoryMeta.label} in {cityId === 'dharwad' ? 'Dharwad' : 'Hubballi'}
          </h1>
          <p className="muted">
            {activeCategoryMeta.subtitle}. Select any release to explore verified local cinemas and watch its official trailer on the 3D auditorium screen from your chosen seat.
          </p>
        </div>

        <div className="freshness-bar">
          <div className="data-status-pill" title="Live Indian movie discovery feed status">
            <span
              className={
                'status-dot ' +
                (stale ? 'stale' : source === 'TMDB_LIVE' ? 'live' : 'live')
              }
            />
            <span>
              {stale
                ? 'CACHED LISTINGS (STALE)'
                : source === 'TMDB_LIVE'
                  ? 'TMDB INDIA LIVE (EN-IN)'
                  : 'LIVE INDIAN RELEASE FEED'}
            </span>
          </div>
          <span className="freshness-time">
            Updated {formatIstTimestamp(lastUpdatedAt)}
          </span>
          <button
            type="button"
            className="ghost refresh-btn"
            onClick={handleManualRefresh}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Category Tabs: Now Showing | New Releases | Coming Soon | Trending */}
      <div className="category-tabs" role="tablist" aria-label="Movie discovery categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={!query && category === cat.id}
            className={'category-tab' + (!query && category === cat.id ? ' on' : '')}
            onClick={() => {
              setQuery('');
              setCategory(cat.id);
            }}
          >
            <strong>{cat.label}</strong>
            <small>{cat.subtitle}</small>
          </button>
        ))}
      </div>

      {/* Search & Regional Language Filter Controls */}
      <div className="discover-controls">
        <div className="search-box">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search current Indian or international releases by title…"
            aria-label="Search movies"
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQuery('')}
            >
              Clear
            </button>
          )}
        </div>

        <div className="lang-chips" role="tablist" aria-label="Filter by language">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="tab"
              aria-selected={lang === l.code}
              className={'lang-chip' + (lang === l.code ? ' on' : '')}
              onClick={() => setLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stale Data / API Warning Banner */}
      {(stale || errorMsg) && (
        <div className="stale-banner" role="status">
          <div>
            <strong>{stale ? 'Stale Data Notice:' : 'Discovery Notice:'}</strong>{' '}
            <span>
              {errorMsg ||
                'Live refresh was interrupted; displaying the most recent cached listings.'}
            </span>
          </div>
          <button type="button" className="ghost" onClick={handleManualRefresh}>
            Retry Live Sync
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading ? (
        <div className="movie-grid" aria-busy="true" aria-label="Loading current movie releases">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="movie-skeleton">
              <div className="skeleton-poster" />
              <div className="skeleton-line lg" />
              <div className="skeleton-line sm" />
            </div>
          ))}
        </div>
      ) : catalog.length === 0 ? (
        <div className="card empty-state">
          <h3>No releases matched your filter</h3>
          <p className="muted">
            Try switching to “All Languages” or refreshing the live Indian theatrical feed.
          </p>
          <div className="row-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setQuery('');
                setLang('all');
                setCategory('now_showing');
              }}
            >
              Reset Filters
            </button>
            <button type="button" className="ghost" onClick={handleManualRefresh}>
              ↻ Refresh Feed
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="movie-grid">
            {catalog.map((m) => (
              <MovieCard key={m.id} movie={m} onSelect={selectMovie} />
            ))}
          </div>

          {!query && (
            <div className="load-more-row">
              <button
                type="button"
                className="ghost"
                disabled={loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? 'Loading more releases…' : 'Load More Releases'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Verified Local Cinema Directory Overview */}
      <div className="directory-strip">
        <div className="directory-head">
          <h2>
            Verified Cinema Directory —{' '}
            {cityId === 'dharwad'
              ? 'Dharwad'
              : cityId === 'all'
                ? 'Hubballi–Dharwad'
                : 'Hubballi'}
          </h2>
          <span className="verify-badge verified">MANUALLY VERIFIED VENUES</span>
        </div>
        <div className="directory-grid">
          {activeCinemas.map((c) => (
            <div key={c.id} className="directory-card">
              <div className="directory-card-top">
                <strong>{c.name}</strong>
                {c.isPrimaryPilot && <span className="pilot-badge">PRIMARY PILOT</span>}
              </div>
              <p className="muted">{c.address}</p>
              <div className="directory-meta">
                <span>{c.brand}</span>
                <span>
                  · {c.auditoriumCount ? `${c.auditoriumCount} Screens` : 'Single Screen'}
                </span>
                <span>· {c.format}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ShowtimePicker() {
  const movieId = useBooking((s) => s.movieId);
  const cityId = useBooking((s) => s.cityId);
  const selectShow = useBooking((s) => s.selectShow);
  const launchSeatPreview = useBooking((s) => s.launchSeatPreview);
  const go = useBooking((s) => s.go);

  const baseMovie = getMovie(movieId);
  const [movie, setMovie] = useState<Movie | null>(baseMovie);
  const dates = nextDates(3);
  const [date, setDate] = useState(dates[0].key);

  useEffect(() => {
    setMovie(baseMovie);
    if (!baseMovie) return;
    let active = true;
    fetchMovieFullDetails(baseMovie).then((full) => {
      if (active) setMovie(full);
    });
    return () => {
      active = false;
    };
  }, [baseMovie]);

  if (!movie) {
    return (
      <section className="card narrow center">
        <h2>Select a movie release first</h2>
        <p className="muted">Choose a movie from the live discovery catalog to view showtimes and enter the 3D auditorium.</p>
        <button type="button" className="primary" onClick={() => go('movies')}>
          Browse Movies
        </button>
      </section>
    );
  }

  const primaryTrailer = getPrimaryTrailer(movie);
  const activeCinemas = getCinemasByCity(cityId);
  const displayCinemas = activeCinemas.length > 0 ? activeCinemas : cinemas;

  return (
    <section className="showtimes">
      <CityBar />

      <div className="movie-hero card">
        <div
          className="poster small"
          style={{
            background: `radial-gradient(circle at 25% 25%, ${movie.accent || '#1B2430'}, #0B0B0D 85%)`,
          }}
        >
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={`${movie.title} poster`}
              className="poster-img"
              loading="lazy"
            />
          ) : (
            <span className="poster-fallback-title">{movie.title}</span>
          )}
        </div>

        <div className="movie-hero-body">
          <div className="movie-hero-badges">
            <span className="eyebrow-pill">{movie.releaseStatus || 'NOW SHOWING'}</span>
            <span className="verify-badge verified">{movie.language}</span>
            <span className="verify-badge">Release: {formatReleaseDate(movie.releaseDate)}</span>
            <span className="verify-badge">
              { primaryTrailer ? '▶ Official Trailer Available' : 'Trailer Pending' }
            </span>
          </div>

          <h1 className="page-title">
            {movie.title}{' '}
            {movie.originalTitle && movie.originalTitle !== movie.title && (
              <span className="native-subtitle">({movie.originalTitle})</span>
            )}
          </h1>

          <p className="muted">
            {movie.genre} · {movie.runtime} · Certified {movie.rating}
          </p>
          <p className="synopsis">{movie.synopsis}</p>

          {movie.cast.length > 0 && (
            <div className="cast-row">
              <span className="muted">Cast:</span>
              {movie.cast.map((c) => (
                <span key={c.name} className="cast-chip">
                  <strong>{c.name}</strong>
                  {c.character ? ` as ${c.character}` : ''}
                </span>
              ))}
            </div>
          )}

          <div className="hero-trailer-actions">
            <button
              type="button"
              className="primary"
              onClick={() =>
                launchSeatPreview(
                  movie.id,
                  displayCinemas[0].id,
                  date,
                  SHOW_TIMES[2],
                  'G-8',
                )
              }
            >
              ▶ Watch Official Trailer on 3D Cinema Screen (Seat G-8)
            </button>
            <span className="muted">
              Or pick any cinema and showtime below to choose your exact seat on the auditorium floorplan.
            </span>
          </div>
        </div>
      </div>

      <div className="showtime-toolbar">
        <div className="chips" role="tablist" aria-label="Date">
          {dates.map((d) => (
            <button
              key={d.key}
              role="tab"
              aria-selected={date === d.key}
              className={'chip' + (date === d.key ? ' on' : '')}
              onClick={() => setDate(d.key)}
            >
              <strong>{d.label}</strong>
              <small>{d.day}</small>
            </button>
          ))}
        </div>

        <div className="showtime-legend">
          <span className="verify-badge verified">VENUE: MANUALLY VERIFIED</span>
          <span className="verify-badge estimated">AUDITORIUM: ESTIMATED PROTOTYPE LAYOUT</span>
          <span className="verify-badge demo">SHOWTIMES: DEMO SCHEDULE</span>
        </div>
      </div>

      <div className="cinema-list">
        {displayCinemas.map((c) => {
          const seats = getSeats(c.auditorium);
          const prices = Object.values(c.auditorium.sections).map((s) => s.price);
          const records = getShowtimesForCinema(c, movie.id, date, movie.language);
          const providers = getCinemaProviders(c);
          return (
            <div key={c.id} className="card cinema">
              <div className="cinema-head">
                <div>
                  <div className="cinema-title-row">
                    <h3>{c.name}</h3>
                    {c.isPrimaryPilot && (
                      <span className="pilot-badge">PRIMARY PILOT · HUBBALLI</span>
                    )}
                    <span className="verify-badge verified">{c.verificationTier}</span>
                  </div>
                  <p className="cinema-address">{c.address}</p>
                  <span className="muted">
                    {c.brand} ·{' '}
                    {c.auditoriumCount ? `${c.auditoriumCount} Screens` : 'Single Screen'} ·{' '}
                    {c.format} · GPS {c.coordinates.lat.toFixed(4)}°N,{' '}
                    {c.coordinates.lng.toFixed(4)}°E
                  </span>
                </div>
                <div className="cinema-right-meta">
                  <span className="price-range">
                    ₹{Math.min(...prices)} – ₹{Math.max(...prices)} · {seats.length} seats
                  </span>
                  <span className="verify-badge estimated">
                    {c.auditorium.verificationStatus === 'VERIFIED_LAYOUT'
                      ? 'VERIFIED LAYOUT'
                      : 'ESTIMATED PROTOTYPE LAYOUT'}
                  </span>
                </div>
              </div>

              <div className="times">
                {records.map((rec) => {
                  const past = isPast(date, rec.startTime);
                  const left = Object.values(
                    mockAvailability(seats, `${c.id}|${date}|${rec.startTime}`),
                  ).filter((v) => v === 'available').length;
                  return (
                    <button
                      key={rec.id}
                      className="time"
                      disabled={past}
                      onClick={() => selectShow(c.id, date, rec.startTime)}
                    >
                      <strong>{rec.startTime}</strong>
                      <small>{past ? 'Started' : `${left} seats · Preview 3D`}</small>
                    </button>
                  );
                })}
              </div>

              <div className="cinema-foot">
                <span className="muted">{c.verificationNotes}</span>
                <div className="provider-links">
                  <span className="muted">Authorized Ticketing:</span>
                  {providers.map((bp) => (
                    <a
                      key={bp.id}
                      href={bp.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="provider-chip"
                    >
                      {bp.name} ↗
                    </a>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
