// ==========================================
// 管理员手工评分录入页
// ==========================================
import { useEffect, useState } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import type { MovieRatingData, TVShowRatingData } from '../types/ratings';

type MediaType = 'movie' | 'tv';

interface MessageState {
  type: 'info' | 'success' | 'error';
  text: string;
}

function createEmptyRatingData(type: MediaType): any {
  if (type === 'movie') {
    const data: MovieRatingData = {
      type: 'movie',
      douban: {
        rating: '',
        rating_people: '',
        url: '',
      },
      imdb: {
        rating: '',
        rating_people: '',
        url: '',
      },
      letterboxd: {
        status: '',
        rating: '',
        rating_count: '',
        url: '',
      },
      rottentomatoes: {
        series: {
          tomatometer: '',
          audience_score: '',
          critics_avg: '',
          critics_count: '',
          audience_count: '',
          audience_avg: '',
        },
        seasons: [],
        url: '',
      },
      metacritic: {
        overall: {
          metascore: '',
          critics_count: '',
          userscore: '',
          users_count: '',
        },
        seasons: [],
        url: '',
      },
      tmdb: {
        rating: 0,
        voteCount: 0,
      },
      trakt: {
        rating: 0,
        votes: 0,
      },
    };
    return data;
  }

  const data: TVShowRatingData = {
    type: 'tv',
    douban: {
      rating: '',
      rating_people: '',
      seasons: [],
      url: '',
    },
    imdb: {
      rating: '',
      rating_people: '',
      url: '',
    },
    letterboxd: {
      status: '',
      rating: '',
      rating_count: '',
      url: '',
    },
    rottentomatoes: {
      series: {
        tomatometer: '',
        audience_score: '',
        critics_avg: '',
        critics_count: '',
        audience_count: '',
        audience_avg: '',
      },
      seasons: [],
      url: '',
    },
    metacritic: {
      overall: {
        metascore: '',
        critics_count: '',
        userscore: '',
        users_count: '',
      },
      seasons: [],
      url: '',
    },
    tmdb: {
      rating: 0,
      voteCount: 0,
      seasons: [],
    },
    trakt: {
      rating: 0,
      votes: 0,
      seasons: [],
    },
    seasons: [],
  };

  return data;
}

export default function AdminRatingsPage() {
  const { user, isLoading } = useAuth();
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [tmdbId, setTmdbId] = useState<string>('');
  const [ratingData, setRatingData] = useState<any>(createEmptyRatingData('movie'));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    document.title = '评分录入（管理员） - RateFuse';
  }, []);

  useEffect(() => {
    // 切换媒体类型时重置表单
    setRatingData(createEmptyRatingData(mediaType));
    setMessage(null);
  }, [mediaType]);

  const showMessage = (msg: MessageState) => {
    setMessage(msg);
    if (msg.type !== 'error') {
      setTimeout(() => {
        setMessage((prev) => (prev === msg ? null : prev));
      }, 3000);
    }
  };

  const handleLoad = async () => {
    if (!tmdbId) {
      showMessage({ type: 'error', text: '请先输入 TMDB ID' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/admin/manual-ratings/${mediaType}/${Number(tmdbId)}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });

      if (res.status === 404) {
        setRatingData(createEmptyRatingData(mediaType));
        showMessage({ type: 'info', text: '该影视无缓存数据，可手动填写' });
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = (err && (err.detail || err.message)) ? (err.detail || err.message) : '加载失败';
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }

      const data = await res.json();
      setRatingData(data);
      showMessage({ type: 'success', text: '已加载缓存数据' });
    } catch (e: any) {
      console.error(e);
      showMessage({ type: 'error', text: `加载失败：${e?.message || e}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tmdbId) {
      showMessage({ type: 'error', text: '请先输入 TMDB ID' });
      return;
    }
    if (!ratingData) {
      showMessage({ type: 'error', text: '暂无可保存的数据' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token') || '';
      const payload = {
        ...ratingData,
        type: mediaType,
        tmdb_id: Number(tmdbId),
      };

      const res = await fetch(`/api/admin/manual-ratings/${mediaType}/${Number(tmdbId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data && (data.detail || data.message)) ? (data.detail || data.message) : '保存失败';
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }

      showMessage({ type: 'success', text: '保存成功，并已更新缓存' });
    } catch (e: any) {
      console.error(e);
      showMessage({ type: 'error', text: `保存失败：${e?.message || e}` });
    } finally {
      setSaving(false);
    }
  };

  const updateNested = (updater: (prev: any) => any) => {
    setRatingData((prev: any) => {
      if (!prev) return prev;
      return updater(prev);
    });
  };

  const renderMovieForm = (data: MovieRatingData) => {
    return (
      <div className="space-y-6">
        {/* 豆瓣 */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">豆瓣</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">评分</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.douban?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    douban: {
                      ...(prev.douban || { rating: '', rating_people: '' }),
                      rating: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">评分人数</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.douban?.rating_people ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    douban: {
                      ...(prev.douban || { rating: '', rating_people: '' }),
                      rating_people: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">链接（可选）</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.douban?.url ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    douban: {
                      ...(prev.douban || { rating: '', rating_people: '' }),
                      url: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
        </section>

        {/* IMDb */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">IMDb</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">评分</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.imdb?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    imdb: {
                      ...(prev.imdb || { rating: '', rating_people: '' }),
                      rating: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">评分人数</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.imdb?.rating_people ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    imdb: {
                      ...(prev.imdb || { rating: '', rating_people: '' }),
                      rating_people: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">链接（可选）</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.imdb?.url ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    imdb: {
                      ...(prev.imdb || { rating: '', rating_people: '' }),
                      url: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
        </section>

        {/* 烂番茄 */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">烂番茄（整部电影）</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">专业评分（Tomatometer，百分比）</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.tomatometer ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        tomatometer: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">专业评分人数</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.critics_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        critics_count: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">专业平均评分</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.critics_avg ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        critics_avg: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">用户评分（Audience Score，百分比）</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.audience_score ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        audience_score: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">用户评分人数</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.audience_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        audience_count: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">用户平均评分</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.audience_avg ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        audience_avg: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
          </div>
        </section>

        {/* Metacritic */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">Metacritic（整部电影）</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">专业评分（Metascore /100）</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.metacritic?.overall?.metascore ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    metacritic: {
                      ...(prev.metacritic || { overall: {} as any, seasons: [] }),
                      overall: {
                        ...(prev.metacritic?.overall || {
                          metascore: '',
                          critics_count: '',
                          userscore: '',
                          users_count: '',
                        }),
                        metascore: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">专业评分人数</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.metacritic?.overall?.critics_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    metacritic: {
                      ...(prev.metacritic || { overall: {} as any, seasons: [] }),
                      overall: {
                        ...(prev.metacritic?.overall || {
                          metascore: '',
                          critics_count: '',
                          userscore: '',
                          users_count: '',
                        }),
                        critics_count: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">用户评分（/10）</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.metacritic?.overall?.userscore ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    metacritic: {
                      ...(prev.metacritic || { overall: {} as any, seasons: [] }),
                      overall: {
                        ...(prev.metacritic?.overall || {
                          metascore: '',
                          critics_count: '',
                          userscore: '',
                          users_count: '',
                        }),
                        userscore: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">用户评分人数</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.metacritic?.overall?.users_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    metacritic: {
                      ...(prev.metacritic || { overall: {} as any, seasons: [] }),
                      overall: {
                        ...(prev.metacritic?.overall || {
                          metascore: '',
                          critics_count: '',
                          userscore: '',
                          users_count: '',
                        }),
                        users_count: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
          </div>
        </section>

        {/* Trakt / Letterboxd / TMDB 简要 */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">其他平台（整部电影）</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Trakt */}
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">Trakt 评分（/10）</label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.trakt?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    trakt: {
                      ...(prev.trakt || { rating: 0, votes: 0 }),
                      rating: e.target.value === '' ? 0 : Number(e.target.value),
                    },
                  }))
                }
              />
              <label className="block text-sm mt-2 mb-1 text-gray-600 dark:text-gray-300">Trakt 评分人数</label>
              <input
                type="number"
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.trakt?.votes ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    trakt: {
                      ...(prev.trakt || { rating: 0, votes: 0 }),
                      votes: e.target.value === '' ? 0 : Number(e.target.value),
                    },
                  }))
                }
              />
            </div>

            {/* Letterboxd */}
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">Letterboxd 评分（/5，原始值）</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.letterboxd?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    letterboxd: {
                      ...(prev.letterboxd || { status: '', rating: '', rating_count: '' }),
                      rating: e.target.value,
                    },
                  }))
                }
              />
              <label className="block text-sm mt-2 mb-1 text-gray-600 dark:text-gray-300">评分人数</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.letterboxd?.rating_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    letterboxd: {
                      ...(prev.letterboxd || { status: '', rating: '', rating_count: '' }),
                      rating_count: e.target.value,
                    },
                  }))
                }
              />
            </div>

            {/* TMDB */}
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">TMDB 评分（/10）</label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.tmdb?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    tmdb: {
                      ...(prev.tmdb || { rating: 0, voteCount: 0 }),
                      rating: e.target.value === '' ? 0 : Number(e.target.value),
                    },
                  }))
                }
              />
              <label className="block text-sm mt-2 mb-1 text-gray-600 dark:text-gray-300">TMDB 评分人数</label>
              <input
                type="number"
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.tmdb?.voteCount ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    tmdb: {
                      ...(prev.tmdb || { rating: 0, voteCount: 0 }),
                      voteCount: e.target.value === '' ? 0 : Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderTVForm = (data: TVShowRatingData) => {
    const seasons = data.douban?.seasons ?? [];
    const rtSeasons = data.rottentomatoes?.seasons ?? [];
    const mcSeasons = data.metacritic?.seasons ?? [];
    const tmdbSeasons = data.tmdb?.seasons ?? [];
    const traktSeasons = data.trakt?.seasons ?? [];

    const handleAddSeason = () => {
      const nextSeasonNumber =
        seasons.length > 0 ? Math.max(...seasons.map((s) => s.season_number)) + 1 : 1;
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const existingSeasons = tv.douban?.seasons ?? [];
        const next = {
          ...(tv.douban || { rating: '', rating_people: '' }),
          seasons: [
            ...existingSeasons,
            {
              season_number: nextSeasonNumber,
              rating: '',
              rating_people: '',
            },
          ],
        };
        return {
          ...prev,
          douban: next,
        };
      });
    };

    const handleSeasonFieldChange = (
      index: number,
      field: 'rating' | 'rating_people',
      value: string,
    ) => {
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const exists = tv.douban?.seasons ?? [];
        const newSeasons = exists.map((s, i) =>
          i === index
            ? {
              ...s,
              [field]: value,
            }
            : s,
        );
        return {
          ...prev,
          douban: {
            ...(tv.douban || { rating: '', rating_people: '' }),
            seasons: newSeasons,
          },
        };
      });
    };

    const handleAddRtSeason = () => {
      const nextSeasonNumber =
        rtSeasons.length > 0 ? Math.max(...rtSeasons.map((s) => s.season_number)) + 1 : 1;
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const existing = tv.rottentomatoes?.seasons ?? [];
        const next = [
          ...existing,
          {
            season_number: nextSeasonNumber,
            tomatometer: '',
            audience_score: '',
            critics_avg: '',
            audience_avg: '',
            critics_count: '',
            audience_count: '',
          },
        ];
        return {
          ...prev,
          rottentomatoes: {
            ...(tv.rottentomatoes || {}),
            seasons: next,
          },
        };
      });
    };

    const handleRtSeasonFieldChange = (
      index: number,
      field:
        | 'tomatometer'
        | 'audience_score'
        | 'critics_avg'
        | 'audience_avg'
        | 'critics_count'
        | 'audience_count',
      value: string,
    ) => {
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const exists = tv.rottentomatoes?.seasons ?? [];
        const newSeasons = exists.map((s, i) =>
          i === index
            ? {
                ...s,
                [field]: value,
              }
            : s,
        );
        return {
          ...prev,
          rottentomatoes: {
            ...(tv.rottentomatoes || {}),
            seasons: newSeasons,
          },
        };
      });
    };

    const handleAddMcSeason = () => {
      const nextSeasonNumber =
        mcSeasons.length > 0 ? Math.max(...mcSeasons.map((s) => s.season_number)) + 1 : 1;
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const existing = tv.metacritic?.seasons ?? [];
        const next = [
          ...existing,
          {
            season_number: nextSeasonNumber,
            metascore: '',
            critics_count: '',
            userscore: '',
            users_count: '',
          },
        ];
        return {
          ...prev,
          metacritic: {
            ...(tv.metacritic || {}),
            seasons: next,
          },
        };
      });
    };

    const handleMcSeasonFieldChange = (
      index: number,
      field: 'metascore' | 'critics_count' | 'userscore' | 'users_count',
      value: string,
    ) => {
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const exists = tv.metacritic?.seasons ?? [];
        const newSeasons = exists.map((s, i) =>
          i === index
            ? {
                ...s,
                [field]: value,
              }
            : s,
        );
        return {
          ...prev,
          metacritic: {
            ...(tv.metacritic || {}),
            seasons: newSeasons,
          },
        };
      });
    };

    const handleAddTmdbSeason = () => {
      const nextSeasonNumber =
        tmdbSeasons.length > 0 ? Math.max(...tmdbSeasons.map((s) => s.season_number)) + 1 : 1;
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const existing = tv.tmdb?.seasons ?? [];
        const next = [
          ...existing,
          {
            season_number: nextSeasonNumber,
            rating: 0,
            voteCount: 0,
          },
        ];
        return {
          ...prev,
          tmdb: {
            ...(tv.tmdb || { rating: 0, voteCount: 0 }),
            seasons: next,
          },
        };
      });
    };

    const handleTmdbSeasonFieldChange = (
      index: number,
      field: 'rating' | 'voteCount',
      value: string,
    ) => {
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const exists = tv.tmdb?.seasons ?? [];
        const newSeasons = exists.map((s, i) =>
          i === index
            ? {
                ...s,
                [field]: value === '' ? 0 : Number(value),
              }
            : s,
        );
        return {
          ...prev,
          tmdb: {
            ...(tv.tmdb || { rating: 0, voteCount: 0 }),
            seasons: newSeasons,
          },
        };
      });
    };

    const handleAddTraktSeason = () => {
      const nextSeasonNumber =
        traktSeasons.length > 0 ? Math.max(...traktSeasons.map((s) => s.season_number)) + 1 : 1;
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const existing = tv.trakt?.seasons ?? [];
        const next = [
          ...existing,
          {
            season_number: nextSeasonNumber,
            rating: 0,
            votes: 0,
          },
        ];
        return {
          ...prev,
          trakt: {
            ...(tv.trakt || { rating: 0, votes: 0 }),
            seasons: next,
          },
        };
      });
    };

    const handleTraktSeasonFieldChange = (
      index: number,
      field: 'rating' | 'votes',
      value: string,
    ) => {
      updateNested((prev) => {
        const tv = prev as TVShowRatingData;
        const exists = tv.trakt?.seasons ?? [];
        const newSeasons = exists.map((s, i) =>
          i === index
            ? {
                ...s,
                [field]: value === '' ? 0 : Number(value),
              }
            : s,
        );
        return {
          ...prev,
          trakt: {
            ...(tv.trakt || { rating: 0, votes: 0 }),
            seasons: newSeasons,
          },
        };
      });
    };

    return (
      <div className="space-y-6">
        {/* 豆瓣（整部剧集 + 分季） */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">豆瓣</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                整部剧集评分
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.douban?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    douban: {
                      ...(prev.douban || { rating: '', rating_people: '' }),
                      rating: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                整部剧集评分人数
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.douban?.rating_people ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    douban: {
                      ...(prev.douban || { rating: '', rating_people: '' }),
                      rating_people: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">链接（可选）</label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.douban?.url ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    douban: {
                      ...(prev.douban || { rating: '', rating_people: '' }),
                      url: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">每季评分</h3>
            <button
              type="button"
              onClick={handleAddSeason}
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              添加一季
            </button>
          </div>
          {seasons.length === 0 ? (
            <p className="text-sm text-gray-500">暂未添加季度评分。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      季度
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      评分
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      评分人数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s, idx) => (
                    <tr
                      key={s.season_number}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-1 px-2 text-gray-800 dark:text-gray-100">
                        第 {s.season_number} 季
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.rating}
                          onChange={(e) =>
                            handleSeasonFieldChange(idx, 'rating', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.rating_people}
                          onChange={(e) =>
                            handleSeasonFieldChange(idx, 'rating_people', e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 其他平台整部剧集（IMDb / 烂番茄 / Metacritic / Trakt / Letterboxd / TMDB） */}
        <section className="glass-card p-4 rounded-lg space-y-4">
          <h2 className="text-lg font-semibold mb-1 text-gray-800 dark:text-white">
            其他平台（整部剧集）
          </h2>

          {/* IMDb 整体 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                IMDb 评分
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.imdb?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    imdb: {
                      ...(prev.imdb || { rating: '', rating_people: '' }),
                      rating: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                IMDb 评分人数
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.imdb?.rating_people ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    imdb: {
                      ...(prev.imdb || { rating: '', rating_people: '' }),
                      rating_people: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                IMDb 链接（可选）
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.imdb?.url ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    imdb: {
                      ...(prev.imdb || { rating: '', rating_people: '' }),
                      url: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* 烂番茄 整体 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                整部剧集专业评分（Tomatometer，百分比）
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.tomatometer ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        tomatometer: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                专业评分人数
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.critics_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        critics_count: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                专业平均评分
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.critics_avg ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        critics_avg: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                用户评分（Audience Score，百分比）
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.audience_score ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        audience_score: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                用户评分人数
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.audience_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        audience_count: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                用户平均评分
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.rottentomatoes?.series?.audience_avg ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    rottentomatoes: {
                      ...(prev.rottentomatoes || { series: {} as any, seasons: [] }),
                      series: {
                        ...(prev.rottentomatoes?.series || {
                          tomatometer: '',
                          audience_score: '',
                          critics_avg: '',
                          critics_count: '',
                          audience_count: '',
                          audience_avg: '',
                        }),
                        audience_avg: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* Metacritic 整体 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                专业评分（Metascore /100）
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.metacritic?.overall?.metascore ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    metacritic: {
                      ...(prev.metacritic || { overall: {} as any, seasons: [] }),
                      overall: {
                        ...(prev.metacritic?.overall || {
                          metascore: '',
                          critics_count: '',
                          userscore: '',
                          users_count: '',
                        }),
                        metascore: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                专业评分人数
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.metacritic?.overall?.critics_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    metacritic: {
                      ...(prev.metacritic || { overall: {} as any, seasons: [] }),
                      overall: {
                        ...(prev.metacritic?.overall || {
                          metascore: '',
                          critics_count: '',
                          userscore: '',
                          users_count: '',
                        }),
                        critics_count: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                用户评分（/10）
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.metacritic?.overall?.userscore ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    metacritic: {
                      ...(prev.metacritic || { overall: {} as any, seasons: [] }),
                      overall: {
                        ...(prev.metacritic?.overall || {
                          metascore: '',
                          critics_count: '',
                          userscore: '',
                          users_count: '',
                        }),
                        userscore: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                用户评分人数
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.metacritic?.overall?.users_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    metacritic: {
                      ...(prev.metacritic || { overall: {} as any, seasons: [] }),
                      overall: {
                        ...(prev.metacritic?.overall || {
                          metascore: '',
                          critics_count: '',
                          userscore: '',
                          users_count: '',
                        }),
                        users_count: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* Trakt 整体 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                Trakt 评分（/10）
              </label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.trakt?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    trakt: {
                      ...(prev.trakt || { rating: 0, votes: 0 }),
                      rating: e.target.value === '' ? 0 : Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                Trakt 评分人数
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.trakt?.votes ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    trakt: {
                      ...(prev.trakt || { rating: 0, votes: 0 }),
                      votes: e.target.value === '' ? 0 : Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* Letterboxd 整体 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                Letterboxd 评分（/5，原始值）
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.letterboxd?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    letterboxd: {
                      ...(prev.letterboxd || { status: '', rating: '', rating_count: '' }),
                      rating: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                评分人数
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.letterboxd?.rating_count ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    letterboxd: {
                      ...(prev.letterboxd || { status: '', rating: '', rating_count: '' }),
                      rating_count: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* TMDB 整体 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                TMDB 评分（/10）
              </label>
              <input
                type="number"
                step="0.1"
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.tmdb?.rating ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    tmdb: {
                      ...(prev.tmdb || { rating: 0, voteCount: 0 }),
                      rating: e.target.value === '' ? 0 : Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                TMDB 评分人数
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={data.tmdb?.voteCount ?? ''}
                onChange={(e) =>
                  updateNested((prev) => ({
                    ...prev,
                    tmdb: {
                      ...(prev.tmdb || { rating: 0, voteCount: 0 }),
                      voteCount: e.target.value === '' ? 0 : Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
          </div>
        </section>

        {/* 烂番茄 分季评分 */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
            烂番茄（每季）
          </h2>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              每季专业 / 用户评分
            </h3>
            <button
              type="button"
              onClick={handleAddRtSeason}
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              添加一季
            </button>
          </div>
          {rtSeasons.length === 0 ? (
            <p className="text-sm text-gray-500">暂未添加烂番茄季度评分。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      季度
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      专业评分
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      专业人数
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      专业平均
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      用户评分
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      用户人数
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      用户平均
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rtSeasons.map((s, idx) => (
                    <tr
                      key={s.season_number}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-1 px-2 text-gray-800 dark:text-gray-100">
                        第 {s.season_number} 季
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.tomatometer}
                          onChange={(e) =>
                            handleRtSeasonFieldChange(idx, 'tomatometer', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.critics_count}
                          onChange={(e) =>
                            handleRtSeasonFieldChange(idx, 'critics_count', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.critics_avg}
                          onChange={(e) =>
                            handleRtSeasonFieldChange(idx, 'critics_avg', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.audience_score}
                          onChange={(e) =>
                            handleRtSeasonFieldChange(idx, 'audience_score', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.audience_count}
                          onChange={(e) =>
                            handleRtSeasonFieldChange(idx, 'audience_count', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.audience_avg}
                          onChange={(e) =>
                            handleRtSeasonFieldChange(idx, 'audience_avg', e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Metacritic 分季评分 */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
            Metacritic（每季）
          </h2>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              每季专业 / 用户评分
            </h3>
            <button
              type="button"
              onClick={handleAddMcSeason}
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              添加一季
            </button>
          </div>
          {mcSeasons.length === 0 ? (
            <p className="text-sm text-gray-500">暂未添加 Metacritic 季度评分。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      季度
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      专业评分
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      专业人数
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      用户评分
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      用户人数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mcSeasons.map((s, idx) => (
                    <tr
                      key={s.season_number}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-1 px-2 text-gray-800 dark:text-gray-100">
                        第 {s.season_number} 季
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.metascore}
                          onChange={(e) =>
                            handleMcSeasonFieldChange(idx, 'metascore', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.critics_count}
                          onChange={(e) =>
                            handleMcSeasonFieldChange(idx, 'critics_count', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.userscore}
                          onChange={(e) =>
                            handleMcSeasonFieldChange(idx, 'userscore', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.users_count}
                          onChange={(e) =>
                            handleMcSeasonFieldChange(idx, 'users_count', e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* TMDB 分季评分 */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
            TMDB（每季）
          </h2>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              每季评分 / 评分人数
            </h3>
            <button
              type="button"
              onClick={handleAddTmdbSeason}
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              添加一季
            </button>
          </div>
          {tmdbSeasons.length === 0 ? (
            <p className="text-sm text-gray-500">暂未添加 TMDB 季度评分。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      季度
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      评分
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      评分人数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tmdbSeasons.map((s, idx) => (
                    <tr
                      key={s.season_number}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-1 px-2 text-gray-800 dark:text-gray-100">
                        第 {s.season_number} 季
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          step="0.1"
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.rating}
                          onChange={(e) =>
                            handleTmdbSeasonFieldChange(idx, 'rating', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.voteCount}
                          onChange={(e) =>
                            handleTmdbSeasonFieldChange(idx, 'voteCount', e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Trakt 分季评分 */}
        <section className="glass-card p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
            Trakt（每季）
          </h2>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              每季评分 / 评分人数
            </h3>
            <button
              type="button"
              onClick={handleAddTraktSeason}
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              添加一季
            </button>
          </div>
          {traktSeasons.length === 0 ? (
            <p className="text-sm text-gray-500">暂未添加 Trakt 季度评分。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      季度
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      评分
                    </th>
                    <th className="py-2 px-2 text-left text-gray-700 dark:text-gray-200">
                      评分人数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {traktSeasons.map((s, idx) => (
                    <tr
                      key={s.season_number}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-1 px-2 text-gray-800 dark:text-gray-100">
                        第 {s.season_number} 季
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          step="0.1"
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.rating}
                          onChange={(e) =>
                            handleTraktSeasonFieldChange(idx, 'rating', e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          className="w-full px-2 py-1 rounded glass-dropdown text-gray-900 dark:text-white"
                          value={s.votes}
                          onChange={(e) =>
                            handleTraktSeasonFieldChange(idx, 'votes', e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  };

  if (isLoading) {
    return <div className="p-4">加载中...</div>;
  }

  if (!user?.is_admin) {
    return <div className="p-4 text-red-500">无权限（仅管理员可访问）</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <ThemeToggle />
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            评分录入（管理员）
          </h1>
        </div>

        {/* 顶部操作栏 */}
        <div className="glass-card p-4 rounded-lg mb-6 flex flex-col md:flex-row gap-4 md:items-end">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                媒体类型
              </label>
              <select
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as MediaType)}
              >
                <option value="movie">电影</option>
                <option value="tv">电视剧</option>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                TMDB ID
              </label>
              <input
                className="w-full px-3 py-2 rounded glass-dropdown text-gray-900 dark:text-white"
                placeholder="例如：603"
                value={tmdbId}
                onChange={(e) => setTmdbId(e.target.value.replace(/[^\d]/g, ''))}
              />
            </div>
            <div className="flex gap-3 items-end">
              <button
                type="button"
                onClick={handleLoad}
                disabled={loading}
                className={`flex-1 px-4 py-2 rounded font-medium transition-colors ${
                  loading
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {loading ? '加载中...' : '加载数据'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={`flex-1 px-4 py-2 rounded font-medium transition-colors ${
                  saving
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {saving ? '保存中...' : '保存并更新缓存'}
              </button>
            </div>
          </div>
          {message && (
            <div
              className={`mt-2 md:mt-0 px-3 py-2 rounded text-sm ${
                message.type === 'success'
                  ? 'bg-green-900 text-green-100'
                  : message.type === 'error'
                  ? 'bg-red-900 text-red-100'
                  : 'bg-blue-900 text-blue-100'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        {/* 表单主体 */}
        {ratingData && (
          <div className="space-y-6">
            {mediaType === 'movie'
              ? renderMovieForm(ratingData as MovieRatingData)
              : renderTVForm(ratingData as TVShowRatingData)}
          </div>
        )}
      </div>
    </div>
  );
}

