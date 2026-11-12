import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getMovie,
  getPrimaryTrailer,
  type DiscoveryCategory,
  type Movie,
} from '../../data/movies';
import {
  getCinemaProviders,
  getShowtimesForCinema,
  isPast,
  nextDates,
  SHOW_TIMES,
  SUPPORTED_CITIES,
  type Cinema,
} from '../../data/cinemas';
import { getSeats } from '../../domain/layout/generateSeats';
import { mockAvailability } from '../../data/mockAvailability';
import type { AuditoriumConfig, CityRecord } from '../../domain/types';
import { discoverCinemasForCity } from '../../services/cinemaProviders';
import {
  requestUserGeolocation,
  searchCitiesByName,
} from '../../services/locationService';
import {
  deduplicateMovies,
  fetchDiscoveryMovies,
  fetchMovieFullDetails,
  searchMoviesCatalog,
} from '../../services/tmdbClient';
import { useBooking } from '../../store/bookingStore';
import { AuditoriumImportModal, ProviderStatusModal } from './AuditoriumImportModal';

const CATEGORIES: { id: DiscoveryCategory; label: string; subtitle: string }[] = [
  {
    id: 'now_showing',
    label: 'Now Showing',
    subtitle: 'Currently screening in theatres',
  },
  {
    id: 'new_releases',
    label: 'New Releases',
    subtitle: 'Latest theatrical releases sorted by release date',
  },
  {
    id: 'coming_soon',
    label: 'Coming Soon',
    subtitle: 'Upcoming theatrical releases scheduled for release',
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

export function CityBar({
  onOpenProviderReport,
}: {
  onOpenProviderReport?: () => void;
}) {
  const selectedCity = useBooking((s) => s.selectedCity);
  const locationStatus = useBooking((s) => s.locationStatus);
  const locationMessage = useBooking((s) => s.locationMessage);
  const userCoordinates = useBooking((s) => s.userCoordinates);
  const setCity = useBooking((s) => s.setCity);
  const setLocationState = useBooking((s) => s.setLocationState);

  const [citySearchOpen, setCitySearchOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CityRecord[]>(SUPPORTED_CITIES);
  const [searchingCities, setSearchingCities] = useState(false);

  useEffect(() => {
    if (!citySearchOpen) return;
    const q = cityQuery.trim();
    if (!q) {
      setCityResults(SUPPORTED_CITIES);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setSearchingCities(true);
      searchCitiesByName(q)
        .then((res) => {
          if (active) setCityResults(res);
        })
        .finally(() => {
          if (active) setSearchingCities(false);
        });
    }, 240);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cityQuery, citySearchOpen]);

  const handleDetectLocation = async () => {
    if (locationStatus === 'locating') return;
    setLocationState({ status: 'locating', message: 'Requesting browser GPS location…' });
    const res = await requestUserGeolocation();
    setLocationState({
      status: res.status,
      coordinates: res.coordinates,
      city: res.city,
      message: res.errorMessage,
    });
  };

  const quickCities = useMemo(() => {
    const base = SUPPORTED_CITIES.slice(0, 9);
    if (!base.some((c) => c.id === selectedCity.id)) {
      return [selectedCity, ...base.slice(0, 8)];
    }
    return base;
  }, [selectedCity]);

  return (
    <div className="city-bar-container" role="region" aria-label="Location and city selection">
      <div className="city-bar">
        <div className="city-bar-left">
          <div className="city-bar-badges">
            <span className="eyebrow-pill">
              {locationStatus === 'granted' && userCoordinates
                ? 'GPS LOCATION ACTIVE'
                : `${(selectedCity.country || 'INDIA').toUpperCase()} MARKET`}
            </span>
            <button
              type="button"
              className={'city-detect-btn' + (locationStatus === 'granted' ? ' active' : '')}
              onClick={handleDetectLocation}
              disabled={locationStatus === 'locating'}
            >
              {locationStatus === 'locating'
                ? '◎ Locating…'
                : locationStatus === 'granted'
                  ? '◎ Near Me (GPS Verified)'
                  : '◎ Detect My Location'}
            </button>
            <button
              type="button"
              className="city-detect-btn"
              onClick={() => setCitySearchOpen((v) => !v)}
            >
              {citySearchOpen ? '✕ Close City Search' : '⌕ Search Any City'}
            </button>
            {onOpenProviderReport && (
              <button
                type="button"
                className="city-detect-btn"
                onClick={onOpenProviderReport}
              >
                ⚡ Provider &amp; Seat-Map API Status
              </button>
            )}
          </div>
          <strong>
            {selectedCity.name}
            {selectedCity.state ? `, ${selectedCity.state}` : ''}
          </strong>
          {locationMessage && <span className="location-note">{locationMessage}</span>}
        </div>

        <div className="city-switcher" role="tablist" aria-label="Select city">
          {quickCities.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={selectedCity.id === c.id}
              className={'city-pill' + (selectedCity.id === c.id ? ' on' : '')}
              onClick={() => setCity(c)}
            >
              {c.name}
              {c.isPrimaryMarket && <span className="pilot-dot" title="Supported Market" />}
            </button>
          ))}
        </div>
      </div>

      {citySearchOpen && (
        <div className="city-search-drawer card">
          <div className="search-box">
            <input
              type="search"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Search any city in India or globally (e.g. Bengaluru, Mumbai, Hyderabad, Chandigarh, Mysuru)…"
              aria-label="Search city"
              autoFocus
            />
            {cityQuery && (
              <button type="button" className="search-clear" onClick={() => setCityQuery('')}>
                Clear
              </button>
            )}
          </div>
          <div className="city-search-results">
            {searchingCities ? (
              <span className="muted">Searching geocoding directory…</span>
            ) : cityResults.length === 0 ? (
              <span className="muted">No matching cities found. Try another spelling.</span>
            ) : (
              cityResults.map((c) => (
                <button
                  key={`${c.id}-${c.coordinates.lat.toFixed(2)}`}
                  type="button"
                  className={'city-pill' + (selectedCity.id === c.id ? ' on' : '')}
                  onClick={() => {
                    setCity(c);
                    setCitySearchOpen(false);
                    setCityQuery('');
                  }}
                >
                  <strong>{c.name}</strong>
                  {c.state ? <small> · {c.state}</small> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
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
  const selectedCity = useBooking((s) => s.selectedCity);
  const userCoordinates = useBooking((s) => s.userCoordinates);

  const [category, setCategory] = useState<DiscoveryCategory>('now_showing');
  const [lang, setLang] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [cinemaFilterQuery, setCinemaFilterQuery] = useState('');
  const [page, setPage] = useState(1);

  const [catalog, setCatalog] = useState<Movie[]>([]);
  const [source, setSource] = useState<'TMDB_LIVE' | 'LIVE_INDIAN_CATALOG' | 'CACHED_STALE'>('TMDB_LIVE');
  const [stale, setStale] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Automated Cinema Discovery state
  const [discoveredCinemas, setDiscoveredCinemas] = useState<Cinema[]>([]);
  const [cinemasLoading, setCinemasLoading] = useState(true);
  const [cinemaProviderUsed, setCinemaProviderUsed] = useState<string>('OSM_OVERPASS_LIVE');
  const [googlePlacesConfigured, setGooglePlacesConfigured] = useState(false);
  const [vistaConfigured, setVistaConfigured] = useState(false);
  const [importTargetCinema, setImportTargetCinema] = useState<Cinema | null>(null);
  const [providerModalOpen, setProviderModalOpen] = useState(false);

  const loadCityCinemas = useCallback(
    async (force = false) => {
      setCinemasLoading(true);
      const res = await discoverCinemasForCity({
        city: selectedCity,
        userCoordinates,
        radiusKm: 25,
        forceRefresh: force,
      });
      setDiscoveredCinemas(res.cinemas);
      setCinemaProviderUsed(res.providerUsed);
      setGooglePlacesConfigured(res.googlePlacesConfigured);
      setVistaConfigured(res.vistaConfigured);
      setCinemasLoading(false);
    },
    [selectedCity, userCoordinates],
  );

  useEffect(() => {
    void loadCityCinemas(false);
  }, [loadCityCinemas]);

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
    void loadCityCinemas(true);
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

  const filteredCinemas = useMemo(() => {
    const q = cinemaFilterQuery.trim().toLowerCase();
    if (!q) return discoveredCinemas;
    return discoveredCinemas.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.brand.toLowerCase().includes(q) ||
        c.area.toLowerCase().includes(q),
    );
  }, [discoveredCinemas, cinemaFilterQuery]);

  return (
    <section className="discover-section">
      <CityBar onOpenProviderReport={() => setProviderModalOpen(true)} />

      <div className="discover-head">
        <div>
          <h1 className="page-title">
            {activeCategoryMeta.label} — {selectedCity.name}
          </h1>
          <p className="muted">
            {activeCategoryMeta.subtitle}. Regional movie metadata via TMDB India is paired with automated cinema discovery in{' '}
            <strong>{selectedCity.name}</strong> ({discoveredCinemas.length} venues discovered).
          </p>
        </div>

        <div className="freshness-bar">
          <div className="data-status-pill" title="Live movie & cinema discovery status">
            <span className={'status-dot ' + (stale ? 'stale' : 'live')} />
            <span>
              {stale
                ? 'CACHED LISTINGS (STALE)'
                : source === 'TMDB_LIVE'
                  ? 'TMDB INDIA LIVE (EN-IN)'
                  : 'LIVE INDIAN RELEASE FEED'}
            </span>
          </div>
          <span className="freshness-time">Updated {formatIstTimestamp(lastUpdatedAt)}</span>
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

      {/* Category Tabs */}
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
            <button type="button" className="search-clear" onClick={() => setQuery('')}>
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
              {errorMsg || 'Live refresh was interrupted; displaying the most recent cached listings.'}
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
            Try switching to “All Languages” or refreshing the live theatrical feed.
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

      {/* Automated Cinema Discovery Directory */}
      <div className="directory-strip" id="cinemas-directory">
        <div className="directory-head">
          <div>
            <h2>
              Discovered Cinemas in {selectedCity.name} ({filteredCinemas.length})
            </h2>
            <p className="muted">
              Automatically discovered via{' '}
              <strong>
                {cinemaProviderUsed === 'GOOGLE_PLACES_NEW'
                  ? 'Google Places API (New)'
                  : 'OpenStreetMap Overpass Geolocation API + FOVO Registry'}
              </strong>
              . Sorted by distance from {userCoordinates ? 'your GPS location' : `${selectedCity.name} centre`}.
            </p>
          </div>
          <div className="directory-head-actions">
            <span className="verify-badge verified">
              SOURCE: {cinemaProviderUsed}
            </span>
            <button
              type="button"
              className="ghost"
              onClick={() => void loadCityCinemas(true)}
              disabled={cinemasLoading}
            >
              {cinemasLoading ? 'Discovering…' : '↻ Rescan Nearby Cinemas'}
            </button>
          </div>
        </div>

        <div className="discover-controls" style={{ marginBottom: '16px' }}>
          <div className="search-box">
            <input
              type="search"
              value={cinemaFilterQuery}
              onChange={(e) => setCinemaFilterQuery(e.target.value)}
              placeholder={`Search discovered cinemas in ${selectedCity.name} by name, chain (PVR, INOX, Cinépolis) or locality…`}
              aria-label="Filter discovered cinemas"
            />
            {cinemaFilterQuery && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setCinemaFilterQuery('')}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {cinemasLoading ? (
          <div className="directory-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="directory-card">
                <div className="skeleton-line lg" />
                <div className="skeleton-line sm" />
              </div>
            ))}
          </div>
        ) : filteredCinemas.length === 0 ? (
          <div className="card empty-state">
            <h3>No cinemas matched in {selectedCity.name}</h3>
            <p className="muted">
              Try clearing your cinema search filter or selecting another nearby city.
            </p>
          </div>
        ) : (
          <div className="directory-grid">
            {filteredCinemas.map((c) => (
              <div key={c.id} className="directory-card">
                <div className="directory-card-top">
                  <strong>{c.name}</strong>
                  {c.distanceKm != null && (
                    <span className="verify-badge">{c.distanceKm.toFixed(1)} km</span>
                  )}
                </div>
                <p className="muted">{c.address}</p>
                <div className="directory-meta">
                  <span>{c.brand}</span>
                  <span>
                    ·{' '}
                    {c.auditoriumCount
                      ? `${c.auditoriumCount} Screens`
                      : 'Screen Count Unverified'}
                  </span>
                  <span>
                    · GPS {c.coordinates.lat.toFixed(4)}°N, {c.coordinates.lng.toFixed(4)}°E
                  </span>
                </div>
                <div className="directory-badges-row">
                  <span
                    className={
                      'verify-badge ' + (c.hasSeatMapSupport ? 'verified' : 'demo')
                    }
                  >
                    {c.hasSeatMapSupport
                      ? `3D PREVIEW READY (${c.auditoriums.length} ${c.auditoriums.length === 1 ? 'SCREEN' : 'SCREENS'})`
                      : 'AUDITORIUM FLOORPLAN UNAVAILABLE'}
                  </span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${c.coordinates.lat},${c.coordinates.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="provider-chip"
                  >
                    Map ↗
                  </a>
                  <button
                    type="button"
                    className="provider-chip"
                    onClick={() => setImportTargetCinema(c)}
                  >
                    {c.hasSeatMapSupport ? '⚙ Manage / Import Vista JSON' : '＋ Attach Vista SeatPlan / Layout'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {importTargetCinema && (
        <AuditoriumImportModal
          cinema={importTargetCinema}
          onClose={() => setImportTargetCinema(null)}
          onAttached={() => {
            setImportTargetCinema(null);
            void loadCityCinemas(false);
          }}
        />
      )}

      {providerModalOpen && (
        <ProviderStatusModal
          googlePlacesConfigured={googlePlacesConfigured}
          vistaConfigured={vistaConfigured}
          onClose={() => setProviderModalOpen(false)}
        />
      )}
    </section>
  );
}

export function ShowtimePicker() {
  const movieId = useBooking((s) => s.movieId);
  const selectedCity = useBooking((s) => s.selectedCity);
  const userCoordinates = useBooking((s) => s.userCoordinates);
  const selectShow = useBooking((s) => s.selectShow);
  const launchSeatPreview = useBooking((s) => s.launchSeatPreview);
  const go = useBooking((s) => s.go);

  const baseMovie = getMovie(movieId);
  const [movie, setMovie] = useState<Movie | null>(baseMovie);
  const dates = nextDates(3);
  const [date, setDate] = useState(dates[0].key);

  const [cityCinemas, setCityCinemas] = useState<Cinema[]>([]);
  const [cinemasLoading, setCinemasLoading] = useState(true);
  const [cinemaQuery, setCinemaQuery] = useState('');
  const [selectedAudiByCinema, setSelectedAudiByCinema] = useState<Record<string, string>>({});
  const [importTargetCinema, setImportTargetCinema] = useState<Cinema | null>(null);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [googlePlacesConfigured, setGooglePlacesConfigured] = useState(false);
  const [vistaConfigured, setVistaConfigured] = useState(false);

  const loadCinemas = useCallback(async () => {
    setCinemasLoading(true);
    const res = await discoverCinemasForCity({
      city: selectedCity,
      userCoordinates,
      radiusKm: 25,
    });
    setCityCinemas(res.cinemas);
    setGooglePlacesConfigured(res.googlePlacesConfigured);
    setVistaConfigured(res.vistaConfigured);
    setCinemasLoading(false);
  }, [selectedCity, userCoordinates]);

  useEffect(() => {
    void loadCinemas();
  }, [loadCinemas]);

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
        <p className="muted">
          Choose a movie from the live discovery catalog to view cinemas in {selectedCity.name} and enter the 3D auditorium.
        </p>
        <button type="button" className="primary" onClick={() => go('movies')}>
          Browse Movies
        </button>
      </section>
    );
  }

  const primaryTrailer = getPrimaryTrailer(movie);
  const filteredCinemas = cityCinemas.filter((c) => {
    const q = cinemaQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.brand.toLowerCase().includes(q)
    );
  });

  const firstPreviewableCinema =
    filteredCinemas.find((c) => c.hasSeatMapSupport && c.auditorium) ??
    cityCinemas.find((c) => c.hasSeatMapSupport && c.auditorium) ??
    null;

  return (
    <section className="showtimes">
      <CityBar onOpenProviderReport={() => setProviderModalOpen(true)} />

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
              {primaryTrailer ? '▶ Official Trailer Available' : 'Trailer Pending'}
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
            {firstPreviewableCinema ? (
              <button
                type="button"
                className="primary"
                onClick={() =>
                  launchSeatPreview(
                    movie.id,
                    firstPreviewableCinema.id,
                    date,
                    SHOW_TIMES[2],
                    'G-8',
                    firstPreviewableCinema.auditorium?.id ?? null,
                  )
                }
              >
                ▶ Watch Official Trailer on 3D Screen ({firstPreviewableCinema.name} · Seat G-8)
              </button>
            ) : (
              <span className="verify-badge estimated">
                Attach a Vista SeatPlan or Calibrated Layout to any discovered cinema below to launch the 3D preview
              </span>
            )}
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

        <div className="search-box" style={{ maxWidth: '360px' }}>
          <input
            type="search"
            value={cinemaQuery}
            onChange={(e) => setCinemaQuery(e.target.value)}
            placeholder={`Search cinemas in ${selectedCity.name}…`}
            aria-label="Search cinemas in city"
          />
        </div>

        <div className="showtime-legend">
          <span className="verify-badge verified">VENUES: LIVE GEOLOCATION DISCOVERY</span>
          <span className="verify-badge demo">SHOWTIMES: DEMO / EXTERNAL HANDOFF</span>
        </div>
      </div>

      {cinemasLoading ? (
        <div className="cinema-list">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="card cinema">
              <div className="skeleton-line lg" />
              <div className="skeleton-line sm" style={{ marginTop: '8px' }} />
            </div>
          ))}
        </div>
      ) : filteredCinemas.length === 0 ? (
        <div className="card empty-state">
          <h3>No cinemas discovered in {selectedCity.name} matching your filter</h3>
          <p className="muted">
            Clear your search filter or switch cities in the location bar above.
          </p>
        </div>
      ) : (
        <div className="cinema-list">
          {filteredCinemas.map((c) => {
            const activeAudiId =
              selectedAudiByCinema[c.id] ?? c.auditorium?.id ?? c.auditoriums[0]?.id ?? null;
            const activeAudi: AuditoriumConfig | null =
              c.auditoriums.find((a) => a.id === activeAudiId) ?? c.auditorium ?? null;

            const hasValidAudi = Boolean(c.hasSeatMapSupport && activeAudi);
            const seats = activeAudi ? getSeats(activeAudi) : [];
            const prices = activeAudi
              ? Object.values(activeAudi.sections).map((s) => s.price)
              : [];
            const records = getShowtimesForCinema(
              c,
              movie.id,
              date,
              movie.language,
              activeAudi?.id,
            );
            const providers = getCinemaProviders(c);

            return (
              <div key={c.id} className="card cinema">
                <div className="cinema-head">
                  <div>
                    <div className="cinema-title-row">
                      <h3>{c.name}</h3>
                      {c.distanceKm != null && (
                        <span className="verify-badge verified">
                          {c.distanceKm.toFixed(1)} KM AWAY
                        </span>
                      )}
                      <span className="verify-badge">{c.dataSource}</span>
                    </div>
                    <p className="cinema-address">{c.address}</p>
                    <span className="muted">
                      {c.brand} ·{' '}
                      {c.auditoriumCount
                        ? `${c.auditoriumCount} Screens`
                        : 'Screen Count Unverified'}{' '}
                      · GPS {c.coordinates.lat.toFixed(4)}°N, {c.coordinates.lng.toFixed(4)}°E
                    </span>
                  </div>

                  <div className="cinema-right-meta">
                    {hasValidAudi && activeAudi ? (
                      <>
                        <span className="price-range">
                          ₹{Math.min(...prices)} – ₹{Math.max(...prices)} · {seats.length} seats
                        </span>
                        <span
                          className={
                            'verify-badge ' +
                            (activeAudi.verificationStatus === 'VERIFIED_LAYOUT'
                              ? 'verified'
                              : 'estimated')
                          }
                        >
                          {activeAudi.verificationStatus === 'VERIFIED_LAYOUT'
                            ? 'VERIFIED 3D LAYOUT'
                            : activeAudi.verificationStatus === 'VISTA_GRID_CALIBRATED'
                              ? 'VISTA SEATPLAN CALIBRATED'
                              : 'ESTIMATED PROTOTYPE LAYOUT'}
                        </span>
                      </>
                    ) : (
                      <span className="verify-badge demo">
                        AUDITORIUM PREVIEW UNAVAILABLE
                      </span>
                    )}
                  </div>
                </div>

                {/* Multi-Auditorium Selector if venue has multiple screens */}
                {c.auditoriums.length > 1 && (
                  <div className="auditorium-SubTabs" role="tablist" aria-label="Select auditorium screen">
                    <span className="muted">Select Auditorium:</span>
                    {c.auditoriums.map((audi) => (
                      <button
                        key={audi.id}
                        type="button"
                        role="tab"
                        aria-selected={activeAudi?.id === audi.id}
                        className={'city-pill' + (activeAudi?.id === audi.id ? ' on' : '')}
                        onClick={() =>
                          setSelectedAudiByCinema((prev) => ({
                            ...prev,
                            [c.id]: audi.id,
                          }))
                        }
                      >
                        {audi.name}
                      </button>
                    ))}
                  </div>
                )}

                {hasValidAudi && activeAudi ? (
                  <div className="times">
                    {records.map((rec) => {
                      const past = isPast(date, rec.startTime);
                      const left = Object.values(
                        mockAvailability(seats, `${c.id}|${activeAudi.id}|${date}|${rec.startTime}`),
                      ).filter((v) => v === 'available').length;
                      return (
                        <button
                          key={rec.id}
                          className="time"
                          disabled={past}
                          onClick={() =>
                            selectShow(c.id, date, rec.startTime, activeAudi.id)
                          }
                        >
                          <strong>{rec.startTime}</strong>
                          <small>
                            {past ? 'Started' : `${left} seats · ${activeAudi.name.split('·')[0].trim()}`}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="unlinked-auditorium-box">
                    <div>
                      <strong>No Seat-Map API or Verified Floorplan Connected for {c.name}</strong>
                      <p className="muted">
                        This cinema was automatically discovered in {c.city}, but no external
                        seat-map provider (Vista Connect) or physical floorplan is attached yet.
                        FOVO does not fabricate auditoriums silently. You can book externally or
                        attach a Vista <code>GetSessionSeatPlan</code> JSON / calibrated floorplan:
                      </p>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setImportTargetCinema(c)}
                    >
                      ＋ Import Vista SeatPlan / Attach Floorplan
                    </button>
                  </div>
                )}

                <div className="cinema-foot">
                  <span className="muted">{c.verificationNotes}</span>
                  <div className="provider-links">
                    <button
                      type="button"
                      className="provider-chip"
                      onClick={() => setImportTargetCinema(c)}
                    >
                      ⚙ {hasValidAudi ? 'Add / Import Screen JSON' : 'Import Vista SeatPlan'}
                    </button>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${c.coordinates.lat},${c.coordinates.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="provider-chip"
                    >
                      Google Maps ↗
                    </a>
                    {providers.map((bp) => (
                      <a
                        key={bp.id}
                        href={c.externalBookingUrl || bp.websiteUrl}
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
      )}

      {importTargetCinema && (
        <AuditoriumImportModal
          cinema={importTargetCinema}
          onClose={() => setImportTargetCinema(null)}
          onAttached={(newAudi) => {
            const cid = importTargetCinema.id;
            setImportTargetCinema(null);
            setSelectedAudiByCinema((prev) => ({ ...prev, [cid]: newAudi.id }));
            void loadCinemas();
          }}
        />
      )}

      {providerModalOpen && (
        <ProviderStatusModal
          googlePlacesConfigured={googlePlacesConfigured}
          vistaConfigured={vistaConfigured}
          onClose={() => setProviderModalOpen(false)}
        />
      )}
    </section>
  );
}
