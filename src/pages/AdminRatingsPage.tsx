import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { PlatformStatusBar } from '../components/ratings/PlatformStatusBar';
import { useMediaRatings } from '../hooks/useMediaRatings';
import type { BackendPlatformStatus, FetchStatus } from '../types/status';

type MediaType = 'movie' | 'tv';

type BackendPlatformKey = 'douban' | 'imdb' | 'letterboxd' | 'rottentomatoes' | 'metacritic';

interface ManualPlatformState {
  enabled: boolean;
  status: FetchStatus;
  rating: string;
  votes: string;
  url: string;
}

type ManualRatingsState = Record<BackendPlatformKey, ManualPlatformState>;

const PLATFORM_CONFIG: Record<
  BackendPlatformKey,
  {
    label: string;
    logo: string;
  }
> = {
  douban: { label: '豆瓣', logo: '/logos/douban.png' },
  imdb: { label: 'IMDb', logo: '/logos/imdb.png' },
  letterboxd: { label: 'Letterboxd', logo: '/logos/letterboxd.png' },
  rottentomatoes: { label: 'Rotten Tomatoes', logo: '/logos/rottentomatoes.png' },
  metacritic: { label: 'Metacritic', logo: '/logos/metacritic.png' },
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

function createInitialManualState(): ManualRatingsState {
  return {
    douban: { enabled: false, status: 'pending', rating: '', votes: '', url: '' },
    imdb: { enabled: false, status: 'pending', rating: '', votes: '', url: '' },
    letterboxd: { enabled: false, status: 'pending', rating: '', votes: '', url: '' },
    rottentomatoes: { enabled: false, status: 'pending', rating: '', votes: '', url: '' },
    metacritic: { enabled: false, status: 'pending', rating: '', votes: '', url: '' },
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

  const [manualRatings, setManualRatings] = useState<ManualRatingsState>(createInitialManualState);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const {
    platformStatuses,
    tmdbStatus,
    traktStatus,
    handleRetry,
  } = useMediaRatings({
    mediaId: activeMediaId,
    mediaType,
  });

  useEffect(() => {
    if (!activeMediaId) return;

    setManualRatings((prev) => {
      const next = { ...prev };

      (Object.keys(PLATFORM_CONFIG) as BackendPlatformKey[]).forEach((key) => {
        const platformData = platformStatuses[key]?.data as any;
        const currentStatus = platformStatuses[key]?.status ?? 'pending';

        next[key] = {
          ...next[key],
          status: currentStatus,
          rating:
            next[key].rating ||
            (typeof platformData?.rating === 'string' ? platformData.rating : '') ||
            (typeof platformData?.overall?.metascore === 'string' ? platformData.overall.metascore : ''),
          votes:
            next[key].votes ||
            (typeof platformData?.rating_people === 'string' ? platformData.rating_people : '') ||
            (typeof platformData?.rating_count === 'string' ? platformData.rating_count : '') ||
            (typeof platformData?.overall?.users_count === 'string' ? platformData.overall.users_count : ''),
          url:
            next[key].url ||
            (typeof platformData?.url === 'string' ? platformData.url : ''),
        };
      });

      return next;
    });
  }, [activeMediaId, platformStatuses]);

  const backendPlatforms: BackendPlatformStatus[] = useMemo(
    () =>
      (Object.keys(PLATFORM_CONFIG) as BackendPlatformKey[]).map((key) => ({
        platform: key,
        logo: PLATFORM_CONFIG[key].logo,
        status: platformStatuses[key]?.status ?? 'pending',
      })),
    [platformStatuses],
  );

  const handleLoadMedia = () => {
    const trimmed = mediaIdInput.trim();
    if (!trimmed) {
      alert('请先输入 TMDB ID');
      return;
    }
    setActiveMediaId(trimmed);
    setSaveMessage(null);
  };

  const handleChangePlatformField = (
    key: BackendPlatformKey,
    field: keyof ManualPlatformState,
    value: string | boolean,
  ) => {
    setManualRatings((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!activeMediaId) {
      alert('请先加载一个 TMDB ID');
      return;
    }

    const payload = {
      tmdb_id: activeMediaId,
      media_type: mediaType,
      overrides: Object.fromEntries(
        (Object.keys(manualRatings) as BackendPlatformKey[])
          .filter((key) => manualRatings[key].enabled)
          .map((key) => [
            key,
            {
              status: manualRatings[key].status,
              rating: manualRatings[key].rating || null,
              votes: manualRatings[key].votes || null,
              url: manualRatings[key].url || null,
            },
          ]),
      ),
    };

    if (!Object.keys(payload.overrides).length) {
      alert('请至少启用一个平台的手动录入');
      return;
    }

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

            <div className="glass-card rounded-lg p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  手动评分数据输入
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  勾选「启用」后填写评分、人数与目标状态，保存后由后端写入评分源。
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 pr-4 text-left text-gray-700 dark:text-gray-300">启用</th>
                      <th className="py-2 pr-4 text-left text-gray-700 dark:text-gray-300">
                        平台
                      </th>
                      <th className="py-2 pr-4 text-left text-gray-700 dark:text-gray-300">
                        手动评分
                      </th>
                      <th className="py-2 pr-4 text-left text-gray-700 dark:text-gray-300">
                        评分人数
                      </th>
                      <th className="py-2 pr-4 text-left text-gray-700 dark:text-gray-300">
                        状态（收录 / 无评分 / 未收录）
                      </th>
                      <th className="py-2 text-left text-gray-700 dark:text-gray-300">来源链接（可选）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(PLATFORM_CONFIG) as BackendPlatformKey[]).map((key) => {
                      const config = PLATFORM_CONFIG[key];
                      const state = manualRatings[key];

                      return (
                        <tr
                          key={key}
                          className="border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                        >
                          <td className="py-3 pr-4 align-top">
                            <input
                              type="checkbox"
                              className="accent-blue-500"
                              checked={state.enabled}
                              onChange={(e) =>
                                handleChangePlatformField(key, 'enabled', e.target.checked)
                              }
                            />
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <div className="flex items-center gap-2">
                              <img
                                src={config.logo}
                                alt={config.label}
                                className="w-5 h-5 rounded-sm"
                              />
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {config.label}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <input
                              type="text"
                              className="w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="如 8.7"
                              value={state.rating}
                              onChange={(e) =>
                                handleChangePlatformField(key, 'rating', e.target.value)
                              }
                              disabled={!state.enabled}
                            />
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <input
                              type="text"
                              className="w-28 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="如 12345"
                              value={state.votes}
                              onChange={(e) =>
                                handleChangePlatformField(key, 'votes', e.target.value)
                              }
                              disabled={!state.enabled}
                            />
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <select
                              className="w-44 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={state.status}
                              onChange={(e) =>
                                handleChangePlatformField(
                                  key,
                                  'status',
                                  e.target.value as FetchStatus,
                                )
                              }
                              disabled={!state.enabled}
                            >
                              {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 align-top">
                            <input
                              type="text"
                              className="w-full min-w-[160px] rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="可选：原始评分页面链接"
                              value={state.url}
                              onChange={(e) =>
                                handleChangePlatformField(key, 'url', e.target.value)
                              }
                              disabled={!state.enabled}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  建议：
                  <span className="ml-1">
                    - 「已收录（有评分）」通常对应成功抓取并有评分；
                    - 「已收录（暂无评分）」用于站点存在条目但暂无分数；
                    - 「未收录」用于站点不存在该条目。
                  </span>
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
          </section>
        )}
      </div>
    </div>
  );
}

