import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { PlatformStatusBar } from '../components/ratings/PlatformStatusBar';
import { useMediaRatings } from '../hooks/useMediaRatings';
import type { BackendPlatformStatus, FetchStatus } from '../types/status';

type MediaType = 'movie' | 'tv';

type BackendPlatformKey =
  | 'douban'
  | 'imdb'
  | 'letterboxd'
  | 'rottentomatoes'
  | 'metacritic';

const BACKEND_PLATFORM_LOGOS: Record<BackendPlatformKey, string> = {
  douban: '/logos/douban.png',
  imdb: '/logos/imdb.png',
  letterboxd: '/logos/letterboxd.png',
  rottentomatoes: '/logos/rottentomatoes.png',
  metacritic: '/logos/metacritic.png',
};

const STATUS_OPTIONS: { value: FetchStatus; label: string }[] = [
  { value: 'pending', label: '等待获取' },
  { value: 'loading', label: '正在获取' },
  { value: 'successful', label: '已收录（有评分）' },
  { value: 'no_rating', label: '已收录（暂无评分）' },
  { value: 'not_found', label: '未收录' },
  { value: 'error', label: '获取失败' },
  { value: 'fail', label: '抓取失败' },
  { value: 'rate_limit', label: '访问限制' },
  { value: 'timeout', label: '请求超时' },
];

interface MoviePlatformBase {
  enabled: boolean;
  status: FetchStatus;
}

interface MovieSimpleRatingState extends MoviePlatformBase {
  rating: string;
  rating_people: string;
  url: string;
}

interface MovieLetterboxdState extends MoviePlatformBase {
  rating: string;
  rating_count: string;
  url: string;
}

interface MovieRottenTomatoesState extends MoviePlatformBase {
  tomatometer: string;
  critics_count: string;
  critics_avg: string;
  audience_score: string;
  audience_count: string;
  audience_avg: string;
  url: string;
}

interface MovieMetacriticState extends MoviePlatformBase {
  metascore: string;
  critics_count: string;
  userscore: string;
  users_count: string;
  url: string;
}

interface MovieTMDBState extends MoviePlatformBase {
  rating: string;
  voteCount: string;
}

interface MovieTraktState extends MoviePlatformBase {
  rating: string;
  votes: string;
}

interface MovieOverridesState {
  douban: MovieSimpleRatingState;
  imdb: MovieSimpleRatingState;
  letterboxd: MovieLetterboxdState;
  rottentomatoes: MovieRottenTomatoesState;
  metacritic: MovieMetacriticState;
  tmdb: MovieTMDBState;
  trakt: MovieTraktState;
}

interface TVPlatformBase {
  enabled: boolean;
  status: FetchStatus;
}

interface DoubanSeasonRow {
  season_number: string;
  rating: string;
  rating_people: string;
}

interface RTRatingSeasonRow {
  season_number: string;
  tomatometer: string;
  critics_count: string;
  critics_avg: string;
  audience_score: string;
  audience_count: string;
  audience_avg: string;
}

interface MetacriticSeasonRow {
  season_number: string;
  metascore: string;
  critics_count: string;
  userscore: string;
  users_count: string;
}

interface SimpleSeasonRow {
  season_number: string;
  rating: string;
  votes: string;
}

interface TVDoubanState extends TVPlatformBase {
  url: string;
  seasons: DoubanSeasonRow[];
}

interface TVIMDBState extends TVPlatformBase {
  rating: string;
  rating_people: string;
  url: string;
}

interface TVLetterboxdState extends TVPlatformBase {
  rating: string;
  rating_count: string;
  url: string;
}

interface TVRottenTomatoesState extends TVPlatformBase {
  series_tomatometer: string;
  series_critics_count: string;
  series_critics_avg: string;
  series_audience_score: string;
  series_audience_count: string;
  series_audience_avg: string;
  url: string;
  seasons: RTRatingSeasonRow[];
}

interface TVMetacriticState extends TVPlatformBase {
  series_metascore: string;
  series_critics_count: string;
  series_userscore: string;
  series_users_count: string;
  url: string;
  seasons: MetacriticSeasonRow[];
}

interface TVTMDBState extends TVPlatformBase {
  rating: string;
  voteCount: string;
  seasons: SimpleSeasonRow[];
}

interface TVTraktState extends TVPlatformBase {
  rating: string;
  votes: string;
  seasons: SimpleSeasonRow[];
}

interface TVOverridesState {
  douban: TVDoubanState;
  imdb: TVIMDBState;
  letterboxd: TVLetterboxdState;
  rottentomatoes: TVRottenTomatoesState;
  metacritic: TVMetacriticState;
  tmdb: TVTMDBState;
  trakt: TVTraktState;
}

function createInitialMovieOverrides(): MovieOverridesState {
  const base: MoviePlatformBase = { enabled: false, status: 'pending' };
  return {
    douban: { ...base, rating: '', rating_people: '', url: '' },
    imdb: { ...base, rating: '', rating_people: '', url: '' },
    letterboxd: { ...base, rating: '', rating_count: '', url: '' },
    rottentomatoes: {
      ...base,
      tomatometer: '',
      critics_count: '',
      critics_avg: '',
      audience_score: '',
      audience_count: '',
      audience_avg: '',
      url: '',
    },
    metacritic: {
      ...base,
      metascore: '',
      critics_count: '',
      userscore: '',
      users_count: '',
      url: '',
    },
    tmdb: { ...base, rating: '', voteCount: '' },
    trakt: { ...base, rating: '', votes: '' },
  };
}

function createInitialTVOverrides(): TVOverridesState {
  const base: TVPlatformBase = { enabled: false, status: 'pending' };
  return {
    douban: { ...base, url: '', seasons: [] },
    imdb: { ...base, rating: '', rating_people: '', url: '' },
    letterboxd: { ...base, rating: '', rating_count: '', url: '' },
    rottentomatoes: {
      ...base,
      series_tomatometer: '',
      series_critics_count: '',
      series_critics_avg: '',
      series_audience_score: '',
      series_audience_count: '',
      series_audience_avg: '',
      url: '',
      seasons: [],
    },
    metacritic: {
      ...base,
      series_metascore: '',
      series_critics_count: '',
      series_userscore: '',
      series_users_count: '',
      url: '',
      seasons: [],
    },
    tmdb: { ...base, rating: '', voteCount: '', seasons: [] },
    trakt: { ...base, rating: '', votes: '', seasons: [] },
  };
}

export default function AdminRatingsPage() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    document.title = '手动评分管理（管理员） - RateFuse';
  }, []);

  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [mediaIdInput, setMediaIdInput] = useState('');
  const [activeMediaId, setActiveMediaId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [movieOverrides, setMovieOverrides] = useState<MovieOverridesState>(
    createInitialMovieOverrides,
  );
  const [tvOverrides, setTvOverrides] = useState<TVOverridesState>(createInitialTVOverrides);

  const {
    platformStatuses,
    tmdbStatus,
    traktStatus,
    handleRetry,
  } = useMediaRatings({
    mediaId: activeMediaId,
    mediaType,
  });

  const backendPlatforms: BackendPlatformStatus[] = useMemo(
    () =>
      (Object.keys(BACKEND_PLATFORM_LOGOS) as BackendPlatformKey[]).map((key) => ({
        platform: key,
        logo: BACKEND_PLATFORM_LOGOS[key],
        status: platformStatuses[key]?.status ?? 'pending',
      })),
    [platformStatuses],
  );

  const handleLoadMedia = async () => {
    const trimmed = mediaIdInput.trim();
    if (!trimmed) {
      alert('请先输入 TMDB ID');
      return;
    }
    setActiveMediaId(trimmed);
    setSaveMessage(null);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        tmdb_id: trimmed,
        media_type: mediaType,
      });
      const res = await fetch(`/api/manual-ratings?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
      if (!res.ok) {
        // 没有覆盖也无所谓，静默失败即可
        return;
      }
      const data = await res.json().catch(() => null);
      if (!data || !data.overrides || typeof data.overrides !== 'object') {
        return;
      }
      const overrides = data.overrides as any;

      if (mediaType === 'movie') {
        const base = createInitialMovieOverrides();
        const next: MovieOverridesState = { ...base };

        if (overrides.douban) {
          next.douban.enabled = true;
          next.douban.status = overrides.douban.status ?? next.douban.status;
          next.douban.rating = overrides.douban.rating ?? '';
          next.douban.rating_people = overrides.douban.rating_people ?? '';
          next.douban.url = overrides.douban.url ?? '';
        }
        if (overrides.imdb) {
          next.imdb.enabled = true;
          next.imdb.status = overrides.imdb.status ?? next.imdb.status;
          next.imdb.rating = overrides.imdb.rating ?? '';
          next.imdb.rating_people = overrides.imdb.rating_people ?? '';
          next.imdb.url = overrides.imdb.url ?? '';
        }
        if (overrides.letterboxd) {
          next.letterboxd.enabled = true;
          next.letterboxd.status = overrides.letterboxd.status ?? next.letterboxd.status;
          next.letterboxd.rating = overrides.letterboxd.rating ?? '';
          next.letterboxd.rating_count = overrides.letterboxd.rating_count ?? '';
          next.letterboxd.url = overrides.letterboxd.url ?? '';
        }
        if (overrides.rottentomatoes) {
          next.rottentomatoes.enabled = true;
          next.rottentomatoes.status =
            overrides.rottentomatoes.status ?? next.rottentomatoes.status;
          const series = overrides.rottentomatoes.series || {};
          next.rottentomatoes.tomatometer = series.tomatometer ?? '';
          next.rottentomatoes.critics_count = series.critics_count ?? '';
          next.rottentomatoes.critics_avg = series.critics_avg ?? '';
          next.rottentomatoes.audience_score = series.audience_score ?? '';
          next.rottentomatoes.audience_count = series.audience_count ?? '';
          next.rottentomatoes.audience_avg = series.audience_avg ?? '';
          next.rottentomatoes.url = overrides.rottentomatoes.url ?? '';
        }
        if (overrides.metacritic) {
          next.metacritic.enabled = true;
          next.metacritic.status = overrides.metacritic.status ?? next.metacritic.status;
          const overall = overrides.metacritic.overall || {};
          next.metacritic.metascore = overall.metascore ?? '';
          next.metacritic.critics_count = overall.critics_count ?? '';
          next.metacritic.userscore = overall.userscore ?? '';
          next.metacritic.users_count = overall.users_count ?? '';
          next.metacritic.url = overrides.metacritic.url ?? '';
        }
        if (overrides.tmdb) {
          next.tmdb.enabled = true;
          next.tmdb.status = overrides.tmdb.status ?? next.tmdb.status;
          next.tmdb.rating =
            overrides.tmdb.rating != null ? String(overrides.tmdb.rating) : '';
          next.tmdb.voteCount =
            overrides.tmdb.voteCount != null ? String(overrides.tmdb.voteCount) : '';
        }
        if (overrides.trakt) {
          next.trakt.enabled = true;
          next.trakt.status = overrides.trakt.status ?? next.trakt.status;
          next.trakt.rating =
            overrides.trakt.rating != null ? String(overrides.trakt.rating) : '';
          next.trakt.votes =
            overrides.trakt.votes != null ? String(overrides.trakt.votes) : '';
        }

        setMovieOverrides(next);
      } else {
        const base = createInitialTVOverrides();
        const next: TVOverridesState = { ...base };

        if (overrides.douban) {
          next.douban.enabled = true;
          next.douban.status = overrides.douban.status ?? next.douban.status;
          next.douban.url = overrides.douban.url ?? '';
          const seasons = Array.isArray(overrides.douban.seasons)
            ? overrides.douban.seasons
            : [];
          next.douban.seasons = seasons.map((s: any) => ({
            season_number:
              s.season_number != null ? String(s.season_number) : '',
            rating: s.rating ?? '',
            rating_people: s.rating_people ?? '',
          }));
        }
        if (overrides.imdb) {
          next.imdb.enabled = true;
          next.imdb.status = overrides.imdb.status ?? next.imdb.status;
          next.imdb.rating = overrides.imdb.rating ?? '';
          next.imdb.rating_people = overrides.imdb.rating_people ?? '';
          next.imdb.url = overrides.imdb.url ?? '';
        }
        if (overrides.letterboxd) {
          next.letterboxd.enabled = true;
          next.letterboxd.status = overrides.letterboxd.status ?? next.letterboxd.status;
          next.letterboxd.rating = overrides.letterboxd.rating ?? '';
          next.letterboxd.rating_count = overrides.letterboxd.rating_count ?? '';
          next.letterboxd.url = overrides.letterboxd.url ?? '';
        }
        if (overrides.rottentomatoes) {
          next.rottentomatoes.enabled = true;
          next.rottentomatoes.status =
            overrides.rottentomatoes.status ?? next.rottentomatoes.status;
          const series = overrides.rottentomatoes.series || {};
          next.rottentomatoes.series_tomatometer = series.tomatometer ?? '';
          next.rottentomatoes.series_critics_count = series.critics_count ?? '';
          next.rottentomatoes.series_critics_avg = series.critics_avg ?? '';
          next.rottentomatoes.series_audience_score = series.audience_score ?? '';
          next.rottentomatoes.series_audience_count = series.audience_count ?? '';
          next.rottentomatoes.series_audience_avg = series.audience_avg ?? '';
          next.rottentomatoes.url = overrides.rottentomatoes.url ?? '';
          const seasons = Array.isArray(overrides.rottentomatoes.seasons)
            ? overrides.rottentomatoes.seasons
            : [];
          next.rottentomatoes.seasons = seasons.map((s: any) => ({
            season_number:
              s.season_number != null ? String(s.season_number) : '',
            tomatometer: s.tomatometer ?? '',
            critics_count: s.critics_count ?? '',
            critics_avg: s.critics_avg ?? '',
            audience_score: s.audience_score ?? '',
            audience_count: s.audience_count ?? '',
            audience_avg: s.audience_avg ?? '',
          }));
        }
        if (overrides.metacritic) {
          next.metacritic.enabled = true;
          next.metacritic.status =
            overrides.metacritic.status ?? next.metacritic.status;
          const overall = overrides.metacritic.overall || {};
          next.metacritic.series_metascore = overall.metascore ?? '';
          next.metacritic.series_critics_count = overall.critics_count ?? '';
          next.metacritic.series_userscore = overall.userscore ?? '';
          next.metacritic.series_users_count = overall.users_count ?? '';
          next.metacritic.url = overrides.metacritic.url ?? '';
          const seasons = Array.isArray(overrides.metacritic.seasons)
            ? overrides.metacritic.seasons
            : [];
          next.metacritic.seasons = seasons.map((s: any) => ({
            season_number:
              s.season_number != null ? String(s.season_number) : '',
            metascore: s.metascore ?? '',
            critics_count: s.critics_count ?? '',
            userscore: s.userscore ?? '',
            users_count: s.users_count ?? '',
          }));
        }
        if (overrides.tmdb) {
          next.tmdb.enabled = true;
          next.tmdb.status = overrides.tmdb.status ?? next.tmdb.status;
          next.tmdb.rating =
            overrides.tmdb.rating != null ? String(overrides.tmdb.rating) : '';
          next.tmdb.voteCount =
            overrides.tmdb.voteCount != null ? String(overrides.tmdb.voteCount) : '';
          const seasons = Array.isArray(overrides.tmdb.seasons)
            ? overrides.tmdb.seasons
            : [];
          next.tmdb.seasons = seasons.map((s: any) => ({
            season_number:
              s.season_number != null ? String(s.season_number) : '',
            rating: s.rating != null ? String(s.rating) : '',
            votes:
              s.voteCount != null
                ? String(s.voteCount)
                : s.votes != null
                  ? String(s.votes)
                  : '',
          }));
        }
        if (overrides.trakt) {
          next.trakt.enabled = true;
          next.trakt.status = overrides.trakt.status ?? next.trakt.status;
          next.trakt.rating =
            overrides.trakt.rating != null ? String(overrides.trakt.rating) : '';
          next.trakt.votes =
            overrides.trakt.votes != null ? String(overrides.trakt.votes) : '';
          const seasons = Array.isArray(overrides.trakt.seasons)
            ? overrides.trakt.seasons
            : [];
          next.trakt.seasons = seasons.map((s: any) => ({
            season_number:
              s.season_number != null ? String(s.season_number) : '',
            rating: s.rating != null ? String(s.rating) : '',
            votes:
              s.votes != null
                ? String(s.votes)
                : s.voteCount != null
                  ? String(s.voteCount)
                  : '',
          }));
        }

        setTvOverrides(next);
      }
    } catch {
      // 忽略加载错误，仍然可以从空表单开始录入
    }
  };

  const updateMovie = <K extends keyof MovieOverridesState, F extends keyof MovieOverridesState[K]>(
    platform: K,
    field: F,
    value: MovieOverridesState[K][F],
  ) => {
    setMovieOverrides((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  const updateTV = <K extends keyof TVOverridesState, F extends keyof TVOverridesState[K]>(
    platform: K,
    field: F,
    value: TVOverridesState[K][F],
  ) => {
    setTvOverrides((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  const addTVSeasonRow = (platform: keyof TVOverridesState) => {
    setTvOverrides((prev) => {
      const next = { ...prev };
      const current = next[platform] as any;
      const seasons: any[] = Array.isArray(current.seasons) ? [...current.seasons] : [];

      const defaultSeasonNumber = String(seasons.length + 1);

      if (platform === 'douban') {
        seasons.push({
          season_number: defaultSeasonNumber,
          rating: '',
          rating_people: '',
        } as DoubanSeasonRow);
      } else if (platform === 'rottentomatoes') {
        seasons.push({
          season_number: defaultSeasonNumber,
          tomatometer: '',
          critics_count: '',
          critics_avg: '',
          audience_score: '',
          audience_count: '',
          audience_avg: '',
        } as RTRatingSeasonRow);
      } else if (platform === 'metacritic') {
        seasons.push({
          season_number: defaultSeasonNumber,
          metascore: '',
          critics_count: '',
          userscore: '',
          users_count: '',
        } as MetacriticSeasonRow);
      } else if (platform === 'tmdb' || platform === 'trakt') {
        seasons.push({
          season_number: defaultSeasonNumber,
          rating: '',
          votes: '',
        } as SimpleSeasonRow);
      }

      current.seasons = seasons;
      return next;
    });
  };

  const updateTVSeasonRow = (
    platform: keyof TVOverridesState,
    index: number,
    field: string,
    value: string,
  ) => {
    setTvOverrides((prev) => {
      const next = { ...prev };
      const current = next[platform] as any;
      const seasons: any[] = Array.isArray(current.seasons) ? [...current.seasons] : [];
      if (!seasons[index]) return prev;
      seasons[index] = {
        ...seasons[index],
        [field]: value,
      };
      current.seasons = seasons;
      return next;
    });
  };

  const buildMovieOverrides = () => {
    const overrides: any = {};

    if (movieOverrides.douban.enabled) {
      overrides.douban = {
        status: movieOverrides.douban.status,
        rating: movieOverrides.douban.rating || null,
        rating_people: movieOverrides.douban.rating_people || null,
        url: movieOverrides.douban.url || null,
      };
    }

    if (movieOverrides.imdb.enabled) {
      overrides.imdb = {
        status: movieOverrides.imdb.status,
        rating: movieOverrides.imdb.rating || null,
        rating_people: movieOverrides.imdb.rating_people || null,
        url: movieOverrides.imdb.url || null,
      };
    }

    if (movieOverrides.letterboxd.enabled) {
      overrides.letterboxd = {
        status: movieOverrides.letterboxd.status,
        rating: movieOverrides.letterboxd.rating || null,
        rating_count: movieOverrides.letterboxd.rating_count || null,
        url: movieOverrides.letterboxd.url || null,
      };
    }

    if (movieOverrides.rottentomatoes.enabled) {
      overrides.rottentomatoes = {
        status: movieOverrides.rottentomatoes.status,
        series: {
          tomatometer: movieOverrides.rottentomatoes.tomatometer || null,
          critics_count: movieOverrides.rottentomatoes.critics_count || null,
          critics_avg: movieOverrides.rottentomatoes.critics_avg || null,
          audience_score: movieOverrides.rottentomatoes.audience_score || null,
          audience_count: movieOverrides.rottentomatoes.audience_count || null,
          audience_avg: movieOverrides.rottentomatoes.audience_avg || null,
        },
        url: movieOverrides.rottentomatoes.url || null,
      };
    }

    if (movieOverrides.metacritic.enabled) {
      overrides.metacritic = {
        status: movieOverrides.metacritic.status,
        overall: {
          metascore: movieOverrides.metacritic.metascore || null,
          critics_count: movieOverrides.metacritic.critics_count || null,
          userscore: movieOverrides.metacritic.userscore || null,
          users_count: movieOverrides.metacritic.users_count || null,
        },
        url: movieOverrides.metacritic.url || null,
      };
    }

    if (movieOverrides.tmdb.enabled) {
      overrides.tmdb = {
        status: movieOverrides.tmdb.status,
        rating: movieOverrides.tmdb.rating || null,
        voteCount: movieOverrides.tmdb.voteCount || null,
      };
    }

    if (movieOverrides.trakt.enabled) {
      overrides.trakt = {
        status: movieOverrides.trakt.status,
        rating: movieOverrides.trakt.rating || null,
        votes: movieOverrides.trakt.votes || null,
      };
    }

    return overrides;
  };

  const buildTVOverrides = () => {
    const overrides: any = {};

    if (tvOverrides.douban.enabled) {
      overrides.douban = {
        status: tvOverrides.douban.status,
        url: tvOverrides.douban.url || null,
        seasons: tvOverrides.douban.seasons.map((s) => ({
          season_number: Number(s.season_number) || 0,
          rating: s.rating || null,
          rating_people: s.rating_people || null,
        })),
      };
    }

    if (tvOverrides.imdb.enabled) {
      overrides.imdb = {
        status: tvOverrides.imdb.status,
        rating: tvOverrides.imdb.rating || null,
        rating_people: tvOverrides.imdb.rating_people || null,
        url: tvOverrides.imdb.url || null,
      };
    }

    if (tvOverrides.letterboxd.enabled) {
      overrides.letterboxd = {
        status: tvOverrides.letterboxd.status,
        rating: tvOverrides.letterboxd.rating || null,
        rating_count: tvOverrides.letterboxd.rating_count || null,
        url: tvOverrides.letterboxd.url || null,
      };
    }

    if (tvOverrides.rottentomatoes.enabled) {
      overrides.rottentomatoes = {
        status: tvOverrides.rottentomatoes.status,
        series: {
          tomatometer: tvOverrides.rottentomatoes.series_tomatometer || null,
          critics_count: tvOverrides.rottentomatoes.series_critics_count || null,
          critics_avg: tvOverrides.rottentomatoes.series_critics_avg || null,
          audience_score: tvOverrides.rottentomatoes.series_audience_score || null,
          audience_count: tvOverrides.rottentomatoes.series_audience_count || null,
          audience_avg: tvOverrides.rottentomatoes.series_audience_avg || null,
        },
        seasons: tvOverrides.rottentomatoes.seasons.map((s) => ({
          season_number: Number(s.season_number) || 0,
          tomatometer: s.tomatometer || null,
          critics_count: s.critics_count || null,
          critics_avg: s.critics_avg || null,
          audience_score: s.audience_score || null,
          audience_count: s.audience_count || null,
          audience_avg: s.audience_avg || null,
        })),
        url: tvOverrides.rottentomatoes.url || null,
      };
    }

    if (tvOverrides.metacritic.enabled) {
      overrides.metacritic = {
        status: tvOverrides.metacritic.status,
        overall: {
          metascore: tvOverrides.metacritic.series_metascore || null,
          critics_count: tvOverrides.metacritic.series_critics_count || null,
          userscore: tvOverrides.metacritic.series_userscore || null,
          users_count: tvOverrides.metacritic.series_users_count || null,
        },
        seasons: tvOverrides.metacritic.seasons.map((s) => ({
          season_number: Number(s.season_number) || 0,
          metascore: s.metascore || null,
          critics_count: s.critics_count || null,
          userscore: s.userscore || null,
          users_count: s.users_count || null,
        })),
        url: tvOverrides.metacritic.url || null,
      };
    }

    if (tvOverrides.tmdb.enabled) {
      overrides.tmdb = {
        status: tvOverrides.tmdb.status,
        rating: tvOverrides.tmdb.rating || null,
        voteCount: tvOverrides.tmdb.voteCount || null,
        seasons: tvOverrides.tmdb.seasons.map((s) => ({
          season_number: Number(s.season_number) || 0,
          rating: s.rating || null,
          voteCount: s.votes || null,
        })),
      };
    }

    if (tvOverrides.trakt.enabled) {
      overrides.trakt = {
        status: tvOverrides.trakt.status,
        rating: tvOverrides.trakt.rating || null,
        votes: tvOverrides.trakt.votes || null,
        seasons: tvOverrides.trakt.seasons.map((s) => ({
          season_number: Number(s.season_number) || 0,
          rating: s.rating || null,
          votes: s.votes || null,
        })),
      };
    }

    return overrides;
  };

  const handleSave = async () => {
    if (!activeMediaId) {
      alert('请先加载一个 TMDB ID');
      return;
    }

    const overrides = mediaType === 'movie' ? buildMovieOverrides() : buildTVOverrides();

    if (!Object.keys(overrides).length) {
      alert('请至少启用一个平台的手动录入');
      return;
    }

    const payload = {
      tmdb_id: activeMediaId,
      media_type: mediaType,
      overrides,
    };

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/manual-ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const result = await response
        .json()
        .catch(() => ({ detail: '保存成功，但响应非 JSON' }));

      if (!response.ok) {
        const detail = (result && (result.detail || result.message)) || '保存失败';
        setSaveMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
      } else {
        setSaveMessage('保存成功，前台评分数据将在下次获取时生效。');
      }
    } catch (error) {
      setSaveMessage(`保存失败: ${String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-4">加载中...</div>;
  }

  if (!user?.is_admin) {
    return <div className="p-4 text-red-500">无权限（仅管理员可访问）</div>;
  }

  return (
    <div className="min-h-screen pt-16 safe-area-bottom bg-[var(--page-bg)]">
      <ThemeToggle />

      <div className="container mx-auto px-4 py-8 space-y-8 content-container">
        <header className="flex flex-col gap-2 mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
            手动评分数据输入 & 平台收录状态
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            仅管理员可见，用于为指定 TMDB 影片/剧集手动录入或覆盖各平台评分数据与收录状态。
          </p>
        </header>

        <section className="glass-card rounded-lg p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">选择媒体</h2>

          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  className="accent-blue-500"
                  checked={mediaType === 'movie'}
                  onChange={() => setMediaType('movie')}
                />
                <span>电影</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="radio"
                  className="accent-blue-500"
                  checked={mediaType === 'tv'}
                  onChange={() => setMediaType('tv')}
                />
                <span>剧集</span>
              </label>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Input
                label="TMDB ID"
                placeholder={mediaType === 'movie' ? '例如：603692（电影）' : '例如：1402（剧集）'}
                value={mediaIdInput}
                onChange={(e) => setMediaIdInput(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleLoadMedia}>加载数据</Button>
              {activeMediaId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleRetry('douban')}
                >
                  重新抓取全部平台
                </Button>
              )}
            </div>
          </div>

          {activeMediaId && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              当前媒体：TMDB ID = {activeMediaId}（类型：{mediaType === 'movie' ? '电影' : '剧集'}）
            </p>
          )}
        </section>

        {activeMediaId && (
          <section className="space-y-4">
            <div className="glass-card rounded-lg p-4 md:p-6 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                当前平台收录状态
              </h2>
              <div className="flex flex-wrap gap-3">
                <PlatformStatusBar
                  backendStatuses={backendPlatforms}
                  tmdbStatus={tmdbStatus}
                  traktStatus={traktStatus}
                  onRetry={handleRetry}
                />
              </div>
            </div>

            {mediaType === 'movie' ? (
              <div className="glass-card rounded-lg p-4 md:p-6 space-y-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  电影：整部作品评分输入
                </h2>

                {/* 豆瓣 & IMDb */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* 豆瓣 */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src="/logos/douban.png" alt="豆瓣" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          豆瓣（整部电影）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={movieOverrides.douban.enabled}
                          onChange={(e) =>
                            updateMovie('douban', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">评分</label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 8.7"
                          value={movieOverrides.douban.rating}
                          onChange={(e) =>
                            updateMovie('douban', 'rating', e.target.value)
                          }
                          disabled={!movieOverrides.douban.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          评分人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 12345"
                          value={movieOverrides.douban.rating_people}
                          onChange={(e) =>
                            updateMovie('douban', 'rating_people', e.target.value)
                          }
                          disabled={!movieOverrides.douban.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs items-end">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={movieOverrides.douban.status}
                          onChange={(e) =>
                            updateMovie(
                              'douban',
                              'status',
                              e.target.value as MovieSimpleRatingState['status'],
                            )
                          }
                          disabled={!movieOverrides.douban.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          来源链接
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="可选"
                          value={movieOverrides.douban.url}
                          onChange={(e) =>
                            updateMovie('douban', 'url', e.target.value)
                          }
                          disabled={!movieOverrides.douban.enabled}
                        />
                      </div>
                    </div>
                  </div>

                  {/* IMDb */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src="/logos/imdb.png" alt="IMDb" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          IMDb（整部电影）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={movieOverrides.imdb.enabled}
                          onChange={(e) =>
                            updateMovie('imdb', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">评分</label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 7.8"
                          value={movieOverrides.imdb.rating}
                          onChange={(e) =>
                            updateMovie('imdb', 'rating', e.target.value)
                          }
                          disabled={!movieOverrides.imdb.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          评分人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 56789"
                          value={movieOverrides.imdb.rating_people}
                          onChange={(e) =>
                            updateMovie('imdb', 'rating_people', e.target.value)
                          }
                          disabled={!movieOverrides.imdb.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs items-end">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={movieOverrides.imdb.status}
                          onChange={(e) =>
                            updateMovie(
                              'imdb',
                              'status',
                              e.target.value as MovieSimpleRatingState['status'],
                            )
                          }
                          disabled={!movieOverrides.imdb.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          来源链接
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="可选"
                          value={movieOverrides.imdb.url}
                          onChange={(e) =>
                            updateMovie('imdb', 'url', e.target.value)
                          }
                          disabled={!movieOverrides.imdb.enabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Letterboxd */}
                <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src="/logos/letterboxd.png" alt="Letterboxd" className="w-5 h-5" />
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        Letterboxd（整部电影）
                      </span>
                    </div>
                    <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        className="accent-blue-500"
                        checked={movieOverrides.letterboxd.enabled}
                        onChange={(e) =>
                          updateMovie('letterboxd', 'enabled', e.target.checked)
                        }
                      />
                      启用
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block mb-1 text-gray-500 dark:text-gray-400">评分</label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="如 4.1"
                        value={movieOverrides.letterboxd.rating}
                        onChange={(e) =>
                          updateMovie('letterboxd', 'rating', e.target.value)
                        }
                        disabled={!movieOverrides.letterboxd.enabled}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-gray-500 dark:text-gray-400">
                        评分人数
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="如 12345"
                        value={movieOverrides.letterboxd.rating_count}
                        onChange={(e) =>
                          updateMovie('letterboxd', 'rating_count', e.target.value)
                        }
                        disabled={!movieOverrides.letterboxd.enabled}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs items-end">
                    <div>
                      <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                      <select
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={movieOverrides.letterboxd.status}
                        onChange={(e) =>
                          updateMovie(
                            'letterboxd',
                            'status',
                            e.target.value as MovieLetterboxdState['status'],
                          )
                        }
                        disabled={!movieOverrides.letterboxd.enabled}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 text-gray-500 dark:text-gray-400">
                        来源链接
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="可选"
                        value={movieOverrides.letterboxd.url}
                        onChange={(e) =>
                          updateMovie('letterboxd', 'url', e.target.value)
                        }
                        disabled={!movieOverrides.letterboxd.enabled}
                      />
                    </div>
                  </div>
                </div>

                {/* Rotten Tomatoes & Metacritic */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Rotten Tomatoes */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img
                          src="/logos/rottentomatoes.png"
                          alt="Rotten Tomatoes"
                          className="w-5 h-5"
                        />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          Rotten Tomatoes（整部电影）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={movieOverrides.rottentomatoes.enabled}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'enabled',
                              e.target.checked,
                            )
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          专业评分（%）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 96"
                          value={movieOverrides.rottentomatoes.tomatometer}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'tomatometer',
                              e.target.value,
                            )
                          }
                          disabled={!movieOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          专业人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 300"
                          value={movieOverrides.rottentomatoes.critics_count}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'critics_count',
                              e.target.value,
                            )
                          }
                          disabled={!movieOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          专业平均分
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 8.4"
                          value={movieOverrides.rottentomatoes.critics_avg}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'critics_avg',
                              e.target.value,
                            )
                          }
                          disabled={!movieOverrides.rottentomatoes.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          用户评分（%）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 92"
                          value={movieOverrides.rottentomatoes.audience_score}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'audience_score',
                              e.target.value,
                            )
                          }
                          disabled={!movieOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          用户人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 5000"
                          value={movieOverrides.rottentomatoes.audience_count}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'audience_count',
                              e.target.value,
                            )
                          }
                          disabled={!movieOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          用户平均分
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 4.3"
                          value={movieOverrides.rottentomatoes.audience_avg}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'audience_avg',
                              e.target.value,
                            )
                          }
                          disabled={!movieOverrides.rottentomatoes.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs items-end">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={movieOverrides.rottentomatoes.status}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'status',
                              e.target.value as MovieRottenTomatoesState['status'],
                            )
                          }
                          disabled={!movieOverrides.rottentomatoes.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          来源链接
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="可选"
                          value={movieOverrides.rottentomatoes.url}
                          onChange={(e) =>
                            updateMovie(
                              'rottentomatoes',
                              'url',
                              e.target.value,
                            )
                          }
                          disabled={!movieOverrides.rottentomatoes.enabled}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Metacritic */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src="/logos/metacritic.png" alt="Metacritic" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          Metacritic（整部电影）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={movieOverrides.metacritic.enabled}
                          onChange={(e) =>
                            updateMovie('metacritic', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          专业评分（metascore）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 84"
                          value={movieOverrides.metacritic.metascore}
                          onChange={(e) =>
                            updateMovie('metacritic', 'metascore', e.target.value)
                          }
                          disabled={!movieOverrides.metacritic.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          专业人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 40"
                          value={movieOverrides.metacritic.critics_count}
                          onChange={(e) =>
                            updateMovie('metacritic', 'critics_count', e.target.value)
                          }
                          disabled={!movieOverrides.metacritic.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          用户评分（userscore）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 8.2"
                          value={movieOverrides.metacritic.userscore}
                          onChange={(e) =>
                            updateMovie('metacritic', 'userscore', e.target.value)
                          }
                          disabled={!movieOverrides.metacritic.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          用户人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 500"
                          value={movieOverrides.metacritic.users_count}
                          onChange={(e) =>
                            updateMovie('metacritic', 'users_count', e.target.value)
                          }
                          disabled={!movieOverrides.metacritic.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs items-end">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={movieOverrides.metacritic.status}
                          onChange={(e) =>
                            updateMovie(
                              'metacritic',
                              'status',
                              e.target.value as MovieMetacriticState['status'],
                            )
                          }
                          disabled={!movieOverrides.metacritic.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          来源链接
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="可选"
                          value={movieOverrides.metacritic.url}
                          onChange={(e) =>
                            updateMovie('metacritic', 'url', e.target.value)
                          }
                          disabled={!movieOverrides.metacritic.enabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* TMDB & Trakt */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* TMDB */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src="/logos/tmdb.png" alt="TMDB" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          TMDB（整部电影）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={movieOverrides.tmdb.enabled}
                          onChange={(e) =>
                            updateMovie('tmdb', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">评分</label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 7.3"
                          value={movieOverrides.tmdb.rating}
                          onChange={(e) =>
                            updateMovie('tmdb', 'rating', e.target.value)
                          }
                          disabled={!movieOverrides.tmdb.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          评分人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 1000"
                          value={movieOverrides.tmdb.voteCount}
                          onChange={(e) =>
                            updateMovie('tmdb', 'voteCount', e.target.value)
                          }
                          disabled={!movieOverrides.tmdb.enabled}
                        />
                      </div>
                    </div>
                    <div className="text-xs">
                      <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                      <select
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={movieOverrides.tmdb.status}
                        onChange={(e) =>
                          updateMovie(
                            'tmdb',
                            'status',
                            e.target.value as MovieTMDBState['status'],
                          )
                        }
                        disabled={!movieOverrides.tmdb.enabled}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Trakt */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src="/logos/trakt.png" alt="Trakt" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          Trakt（整部电影）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={movieOverrides.trakt.enabled}
                          onChange={(e) =>
                            updateMovie('trakt', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">评分</label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 8.1"
                          value={movieOverrides.trakt.rating}
                          onChange={(e) =>
                            updateMovie('trakt', 'rating', e.target.value)
                          }
                          disabled={!movieOverrides.trakt.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          评分人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="如 2000"
                          value={movieOverrides.trakt.votes}
                          onChange={(e) =>
                            updateMovie('trakt', 'votes', e.target.value)
                          }
                          disabled={!movieOverrides.trakt.enabled}
                        />
                      </div>
                    </div>
                    <div className="text-xs">
                      <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                      <select
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={movieOverrides.trakt.status}
                        onChange={(e) =>
                          updateMovie(
                            'trakt',
                            'status',
                            e.target.value as MovieTraktState['status'],
                          )
                        }
                        disabled={!movieOverrides.trakt.enabled}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    说明：仅勾选「启用」的平台会写入手动覆盖；状态字段影响前台收录状态展示。
                  </div>
                  <div className="flex items-center gap-3">
                    {saveMessage && (
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        {saveMessage}
                      </span>
                    )}
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? '保存中…' : '保存手动录入'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-card rounded-lg p-4 md:p-6 space-y-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  剧集：全剧 + 分季评分输入
                </h2>

                {/* 豆瓣（分季） */}
                <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <img src="/logos/douban.png" alt="豆瓣" className="w-5 h-5" />
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        豆瓣（每季评分）
                      </span>
                    </div>
                    <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        className="accent-blue-500"
                        checked={tvOverrides.douban.enabled}
                        onChange={(e) =>
                          updateTV('douban', 'enabled', e.target.checked)
                        }
                      />
                      启用
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 items-end text-xs mb-2">
                    <div className="w-32">
                      <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                      <select
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={tvOverrides.douban.status}
                        onChange={(e) =>
                          updateTV(
                            'douban',
                            'status',
                            e.target.value as TVDoubanState['status'],
                          )
                        }
                        disabled={!tvOverrides.douban.enabled}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="block mb-1 text-gray-500 dark:text-gray-400">
                        来源链接（剧集主页，可选）
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={tvOverrides.douban.url}
                        onChange={(e) =>
                          updateTV('douban', 'url', e.target.value)
                        }
                        disabled={!tvOverrides.douban.enabled}
                      />
                    </div>
                    <Button
                      type="button"
                      className="text-xs px-3 py-1"
                      onClick={() => addTVSeasonRow('douban')}
                      disabled={!tvOverrides.douban.enabled}
                    >
                      新增一季
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-800">
                          <th className="py-1 pr-2 text-left">季号</th>
                          <th className="py-1 pr-2 text-left">评分</th>
                          <th className="py-1 pr-2 text-left">评分人数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tvOverrides.douban.seasons.map((season, index) => (
                          <tr
                            key={index}
                            className="border-b border-gray-100 dark:border-gray-900 last:border-b-0"
                          >
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                className="w-14 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={season.season_number}
                                onChange={(e) =>
                                  updateTVSeasonRow(
                                    'douban',
                                    index,
                                    'season_number',
                                    e.target.value,
                                  )
                                }
                                disabled={!tvOverrides.douban.enabled}
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                className="w-20 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={season.rating}
                                onChange={(e) =>
                                  updateTVSeasonRow(
                                    'douban',
                                    index,
                                    'rating',
                                    e.target.value,
                                  )
                                }
                                disabled={!tvOverrides.douban.enabled}
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                className="w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={season.rating_people}
                                onChange={(e) =>
                                  updateTVSeasonRow(
                                    'douban',
                                    index,
                                    'rating_people',
                                    e.target.value,
                                  )
                                }
                                disabled={!tvOverrides.douban.enabled}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* IMDb & Letterboxd 全剧评分 */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* IMDb */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src="/logos/imdb.png" alt="IMDb" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          IMDb（整部剧集）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={tvOverrides.imdb.enabled}
                          onChange={(e) =>
                            updateTV('imdb', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">评分</label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.imdb.rating}
                          onChange={(e) =>
                            updateTV('imdb', 'rating', e.target.value)
                          }
                          disabled={!tvOverrides.imdb.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          评分人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.imdb.rating_people}
                          onChange={(e) =>
                            updateTV('imdb', 'rating_people', e.target.value)
                          }
                          disabled={!tvOverrides.imdb.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs items-end">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.imdb.status}
                          onChange={(e) =>
                            updateTV(
                              'imdb',
                              'status',
                              e.target.value as TVIMDBState['status'],
                            )
                          }
                          disabled={!tvOverrides.imdb.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          来源链接
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.imdb.url}
                          onChange={(e) =>
                            updateTV('imdb', 'url', e.target.value)
                          }
                          disabled={!tvOverrides.imdb.enabled}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Letterboxd */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src="/logos/letterboxd.png" alt="Letterboxd" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          Letterboxd（整部剧集）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={tvOverrides.letterboxd.enabled}
                          onChange={(e) =>
                            updateTV('letterboxd', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">评分</label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.letterboxd.rating}
                          onChange={(e) =>
                            updateTV('letterboxd', 'rating', e.target.value)
                          }
                          disabled={!tvOverrides.letterboxd.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          评分人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.letterboxd.rating_count}
                          onChange={(e) =>
                            updateTV('letterboxd', 'rating_count', e.target.value)
                          }
                          disabled={!tvOverrides.letterboxd.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs items-end">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">状态</label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.letterboxd.status}
                          onChange={(e) =>
                            updateTV(
                              'letterboxd',
                              'status',
                              e.target.value as TVLetterboxdState['status'],
                            )
                          }
                          disabled={!tvOverrides.letterboxd.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          来源链接
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.letterboxd.url}
                          onChange={(e) =>
                            updateTV('letterboxd', 'url', e.target.value)
                          }
                          disabled={!tvOverrides.letterboxd.enabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rotten Tomatoes & Metacritic（全剧 + 分季） */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Rotten Tomatoes */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <img
                          src="/logos/rottentomatoes.png"
                          alt="Rotten Tomatoes"
                          className="w-5 h-5"
                        />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          Rotten Tomatoes（全剧 + 分季）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={tvOverrides.rottentomatoes.enabled}
                          onChange={(e) =>
                            updateTV(
                              'rottentomatoes',
                              'enabled',
                              e.target.checked,
                            )
                          }
                        />
                        启用
                      </label>
                    </div>

                    {/* 全剧 */}
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧专业评分（%）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.rottentomatoes.series_tomatometer}
                          onChange={(e) =>
                            updateTV(
                              'rottentomatoes',
                              'series_tomatometer',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧专业人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.rottentomatoes.series_critics_count}
                          onChange={(e) =>
                            updateTV(
                              'rottentomatoes',
                              'series_critics_count',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧专业均分
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.rottentomatoes.series_critics_avg}
                          onChange={(e) =>
                            updateTV(
                              'rottentomatoes',
                              'series_critics_avg',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.rottentomatoes.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧用户评分（%）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.rottentomatoes.series_audience_score}
                          onChange={(e) =>
                            updateTV(
                              'rottentomatoes',
                              'series_audience_score',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧用户人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.rottentomatoes.series_audience_count}
                          onChange={(e) =>
                            updateTV(
                              'rottentomatoes',
                              'series_audience_count',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧用户均分
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.rottentomatoes.series_audience_avg}
                          onChange={(e) =>
                            updateTV(
                              'rottentomatoes',
                              'series_audience_avg',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.rottentomatoes.enabled}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-end text-xs mb-2">
                      <div className="w-32">
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          状态
                        </label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.rottentomatoes.status}
                          onChange={(e) =>
                            updateTV(
                              'rottentomatoes',
                              'status',
                              e.target.value as TVRottenTomatoesState['status'],
                            )
                          }
                          disabled={!tvOverrides.rottentomatoes.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          来源链接（剧集主页，可选）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.rottentomatoes.url}
                          onChange={(e) =>
                            updateTV('rottentomatoes', 'url', e.target.value)
                          }
                          disabled={!tvOverrides.rottentomatoes.enabled}
                        />
                      </div>
                      <Button
                        type="button"
                        className="text-xs px-3 py-1"
                        onClick={() => addTVSeasonRow('rottentomatoes')}
                        disabled={!tvOverrides.rottentomatoes.enabled}
                      >
                        新增一季
                      </Button>
                    </div>

                    {/* 分季 */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-800">
                            <th className="py-1 pr-2 text-left">季号</th>
                            <th className="py-1 pr-2 text-left">专业评分</th>
                            <th className="py-1 pr-2 text-left">专业人数</th>
                            <th className="py-1 pr-2 text-left">专业均分</th>
                            <th className="py-1 pr-2 text-left">用户评分</th>
                            <th className="py-1 pr-2 text-left">用户人数</th>
                            <th className="py-1 pr-2 text-left">用户均分</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tvOverrides.rottentomatoes.seasons.map((season, index) => (
                            <tr
                              key={index}
                              className="border-b border-gray-100 dark:border-gray-900 last:border-b-0"
                            >
                              {[
                                'season_number',
                                'tomatometer',
                                'critics_count',
                                'critics_avg',
                                'audience_score',
                                'audience_count',
                                'audience_avg',
                              ].map((field) => (
                                <td key={field} className="py-1 pr-2">
                                  <input
                                    type="text"
                                    className="w-20 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    value={(season as any)[field] || ''}
                                    onChange={(e) =>
                                      updateTVSeasonRow(
                                        'rottentomatoes',
                                        index,
                                        field,
                                        e.target.value,
                                      )
                                    }
                                    disabled={!tvOverrides.rottentomatoes.enabled}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Metacritic */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <img src="/logos/metacritic.png" alt="Metacritic" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          Metacritic（全剧 + 分季）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={tvOverrides.metacritic.enabled}
                          onChange={(e) =>
                            updateTV('metacritic', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>

                    {/* 全剧 */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧专业评分（metascore）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.metacritic.series_metascore}
                          onChange={(e) =>
                            updateTV(
                              'metacritic',
                              'series_metascore',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.metacritic.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧专业人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.metacritic.series_critics_count}
                          onChange={(e) =>
                            updateTV(
                              'metacritic',
                              'series_critics_count',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.metacritic.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧用户评分（userscore）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.metacritic.series_userscore}
                          onChange={(e) =>
                            updateTV(
                              'metacritic',
                              'series_userscore',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.metacritic.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧用户人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.metacritic.series_users_count}
                          onChange={(e) =>
                            updateTV(
                              'metacritic',
                              'series_users_count',
                              e.target.value,
                            )
                          }
                          disabled={!tvOverrides.metacritic.enabled}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-end text-xs mb-2">
                      <div className="w-32">
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          状态
                        </label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.metacritic.status}
                          onChange={(e) =>
                            updateTV(
                              'metacritic',
                              'status',
                              e.target.value as TVMetacriticState['status'],
                            )
                          }
                          disabled={!tvOverrides.metacritic.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          来源链接（剧集主页，可选）
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.metacritic.url}
                          onChange={(e) =>
                            updateTV('metacritic', 'url', e.target.value)
                          }
                          disabled={!tvOverrides.metacritic.enabled}
                        />
                      </div>
                      <Button
                        type="button"
                        className="text-xs px-3 py-1"
                        onClick={() => addTVSeasonRow('metacritic')}
                        disabled={!tvOverrides.metacritic.enabled}
                      >
                        新增一季
                      </Button>
                    </div>

                    {/* 分季 */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-800">
                            <th className="py-1 pr-2 text-left">季号</th>
                            <th className="py-1 pr-2 text-left">专业评分</th>
                            <th className="py-1 pr-2 text-left">专业人数</th>
                            <th className="py-1 pr-2 text-left">用户评分</th>
                            <th className="py-1 pr-2 text-left">用户人数</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tvOverrides.metacritic.seasons.map((season, index) => (
                            <tr
                              key={index}
                              className="border-b border-gray-100 dark:border-gray-900 last:border-b-0"
                            >
                              {[
                                'season_number',
                                'metascore',
                                'critics_count',
                                'userscore',
                                'users_count',
                              ].map((field) => (
                                <td key={field} className="py-1 pr-2">
                                  <input
                                    type="text"
                                    className="w-20 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    value={(season as any)[field] || ''}
                                    onChange={(e) =>
                                      updateTVSeasonRow(
                                        'metacritic',
                                        index,
                                        field,
                                        e.target.value,
                                      )
                                    }
                                    disabled={!tvOverrides.metacritic.enabled}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* TMDB & Trakt（总分 + 分季） */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* TMDB */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <img src="/logos/tmdb.png" alt="TMDB" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          TMDB（整剧 + 分季）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={tvOverrides.tmdb.enabled}
                          onChange={(e) =>
                            updateTV('tmdb', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧评分
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.tmdb.rating}
                          onChange={(e) =>
                            updateTV('tmdb', 'rating', e.target.value)
                          }
                          disabled={!tvOverrides.tmdb.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧评分人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.tmdb.voteCount}
                          onChange={(e) =>
                            updateTV('tmdb', 'voteCount', e.target.value)
                          }
                          disabled={!tvOverrides.tmdb.enabled}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-end text-xs mb-2">
                      <div className="w-32">
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          状态
                        </label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.tmdb.status}
                          onChange={(e) =>
                            updateTV(
                              'tmdb',
                              'status',
                              e.target.value as TVTMDBState['status'],
                            )
                          }
                          disabled={!tvOverrides.tmdb.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        type="button"
                        className="text-xs px-3 py-1"
                        onClick={() => addTVSeasonRow('tmdb')}
                        disabled={!tvOverrides.tmdb.enabled}
                      >
                        新增一季
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-800">
                            <th className="py-1 pr-2 text-left">季号</th>
                            <th className="py-1 pr-2 text-left">评分</th>
                            <th className="py-1 pr-2 text-left">评分人数</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tvOverrides.tmdb.seasons.map((season, index) => (
                            <tr
                              key={index}
                              className="border-b border-gray-100 dark:border-gray-900 last:border-b-0"
                            >
                              <td className="py-1 pr-2">
                                <input
                                  type="text"
                                  className="w-14 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  value={season.season_number}
                                  onChange={(e) =>
                                    updateTVSeasonRow(
                                      'tmdb',
                                      index,
                                      'season_number',
                                      e.target.value,
                                    )
                                  }
                                  disabled={!tvOverrides.tmdb.enabled}
                                />
                              </td>
                              <td className="py-1 pr-2">
                                <input
                                  type="text"
                                  className="w-20 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  value={season.rating}
                                  onChange={(e) =>
                                    updateTVSeasonRow(
                                      'tmdb',
                                      index,
                                      'rating',
                                      e.target.value,
                                    )
                                  }
                                  disabled={!tvOverrides.tmdb.enabled}
                                />
                              </td>
                              <td className="py-1 pr-2">
                                <input
                                  type="text"
                                  className="w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  value={season.votes}
                                  onChange={(e) =>
                                    updateTVSeasonRow(
                                      'tmdb',
                                      index,
                                      'votes',
                                      e.target.value,
                                    )
                                  }
                                  disabled={!tvOverrides.tmdb.enabled}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Trakt */}
                  <div className="space-y-3 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <img src="/logos/trakt.png" alt="Trakt" className="w-5 h-5" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          Trakt（整剧 + 分季）
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="accent-blue-500"
                          checked={tvOverrides.trakt.enabled}
                          onChange={(e) =>
                            updateTV('trakt', 'enabled', e.target.checked)
                          }
                        />
                        启用
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧评分
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.trakt.rating}
                          onChange={(e) =>
                            updateTV('trakt', 'rating', e.target.value)
                          }
                          disabled={!tvOverrides.trakt.enabled}
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          全剧评分人数
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.trakt.votes}
                          onChange={(e) =>
                            updateTV('trakt', 'votes', e.target.value)
                          }
                          disabled={!tvOverrides.trakt.enabled}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-end text-xs mb-2">
                      <div className="w-32">
                        <label className="block mb-1 text-gray-500 dark:text-gray-400">
                          状态
                        </label>
                        <select
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={tvOverrides.trakt.status}
                          onChange={(e) =>
                            updateTV(
                              'trakt',
                              'status',
                              e.target.value as TVTraktState['status'],
                            )
                          }
                          disabled={!tvOverrides.trakt.enabled}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        type="button"
                        className="text-xs px-3 py-1"
                        onClick={() => addTVSeasonRow('trakt')}
                        disabled={!tvOverrides.trakt.enabled}
                      >
                        新增一季
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-800">
                            <th className="py-1 pr-2 text-left">季号</th>
                            <th className="py-1 pr-2 text-left">评分</th>
                            <th className="py-1 pr-2 text-left">评分人数</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tvOverrides.trakt.seasons.map((season, index) => (
                            <tr
                              key={index}
                              className="border-b border-gray-100 dark:border-gray-900 last:border-b-0"
                            >
                              <td className="py-1 pr-2">
                                <input
                                  type="text"
                                  className="w-14 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  value={season.season_number}
                                  onChange={(e) =>
                                    updateTVSeasonRow(
                                      'trakt',
                                      index,
                                      'season_number',
                                      e.target.value,
                                    )
                                  }
                                  disabled={!tvOverrides.trakt.enabled}
                                />
                              </td>
                              <td className="py-1 pr-2">
                                <input
                                  type="text"
                                  className="w-20 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  value={season.rating}
                                  onChange={(e) =>
                                    updateTVSeasonRow(
                                      'trakt',
                                      index,
                                      'rating',
                                      e.target.value,
                                    )
                                  }
                                  disabled={!tvOverrides.trakt.enabled}
                                />
                              </td>
                              <td className="py-1 pr-2">
                                <input
                                  type="text"
                                  className="w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  value={season.votes}
                                  onChange={(e) =>
                                    updateTVSeasonRow(
                                      'trakt',
                                      index,
                                      'votes',
                                      e.target.value,
                                    )
                                  }
                                  disabled={!tvOverrides.trakt.enabled}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    说明：剧集支持全剧 + 分季手动覆盖，字段结构与抓取结果一致，方便后端直接替换。
                  </div>
                  <div className="flex items-center gap-3">
                    {saveMessage && (
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        {saveMessage}
                      </span>
                    )}
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? '保存中…' : '保存手动录入'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
