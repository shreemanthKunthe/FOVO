export interface Movie {
  id: string;
  title: string;
  genre: string;
  runtime: string;
  rating: string;
  language: string;
  synopsis: string;
  /** Poster block colour (flat, no imagery). */
  accent: string;
  /**
   * Trailer video file. Drop a licensed or self-produced .mp4/.webm at this path
   * (served from /public) or any CORS-enabled direct video URL.
   * Third-party page links (YouTube, Vimeo) cannot be used as WebGL textures.
   * If the file is missing the 3D screen shows a clearly labelled placeholder.
   */
  trailerUrl: string;
}

/** Fictional placeholder titles; replace with real catalogue data later. */
export const movies: Movie[] = [
  {
    id: 'starfall',
    title: 'Starfall',
    genre: 'Sci-fi · Adventure',
    runtime: '2h 21m',
    rating: 'UA',
    language: 'English',
    synopsis: 'A salvage crew finds a signal inside a collapsing star and has one orbit to decide what to bring home.',
    accent: '#3b5b86',
    trailerUrl: '/trailers/starfall.mp4',
  },
  {
    id: 'last-reel',
    title: 'The Last Reel',
    genre: 'Drama',
    runtime: '1h 58m',
    rating: 'U',
    language: 'Hindi',
    synopsis: 'The projectionist of a closing single-screen theatre screens one final, unscheduled film.',
    accent: '#7a4a3a',
    trailerUrl: '/trailers/last-reel.mp4',
  },
  {
    id: 'monsoon-express',
    title: 'Monsoon Express',
    genre: 'Thriller',
    runtime: '2h 09m',
    rating: 'UA',
    language: 'Hindi · Tamil',
    synopsis: 'A night train, a stalled signal and eleven passengers who each lied about where they are going.',
    accent: '#3f6b5c',
    trailerUrl: '/trailers/monsoon-express.mp4',
  },
  {
    id: 'paper-kingdom',
    title: 'Paper Kingdom',
    genre: 'Animation · Family',
    runtime: '1h 44m',
    rating: 'U',
    language: 'English',
    synopsis: 'Two siblings fold their way into a map that keeps redrawing itself.',
    accent: '#8a6f2f',
    trailerUrl: '/trailers/paper-kingdom.mp4',
  },
];

export const getMovie = (id: string | null) => movies.find((m) => m.id === id) ?? null;

