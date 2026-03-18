// ==========================================
// 管理员详情页访问记录
// ==========================================
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Film, RefreshCw } from 'lucide-react';
import { authFetchJson } from '../../api/authFetch';
import { formatChinaDateTime } from '../../utils/time';

type MediaType = 'movie' | 'tv';

type DetailViewItem = {
  visited_at: string | null;
  media_type: MediaType;
  title: string;
  url: string;
  user: { id: number; email: string; username: string } | null;
};

type DetailViewsResp = {
  items: DetailViewItem[];
  total: number;
  page: number;
  page_size: number;
  filters: {
    date: string | null;
    start_date: string | null;
    end_date: string | null;
    media_type: MediaType | null;
  };
};

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminDetailViewsPage() {
  const [date, setDate] = useState<string>(() => yyyyMmDd(new Date()));
  const [mediaType, setMediaType] = useState<MediaType | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState<DetailViewsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    document.title = '详情页访问记录 - RateFuse';
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (date) p.set('date', date);
    if (mediaType) p.set('media_type', mediaType);
    p.set('page', String(page));
    p.set('page_size', String(pageSize));
    return p.toString();
  }, [date, mediaType, page, pageSize]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await authFetchJson<DetailViewsResp>(`/api/admin/detail-views?${query}`);
      setData(res);
    } catch (e: any) {
      setError(e?.message || '加载失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [query]);

  const totalPages = data ? Math.max(1, Math.ceil((data.total || 0) / pageSize)) : 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
            详情页访问记录
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            可按日期筛选用户访问了哪些电影/剧集详情页
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/50 p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-1">
              <CalendarDays className="w-4 h-4" />
              日期（YYYY-MM-DD）
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div className="sm:w-56">
            <label className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-1">
              <Film className="w-4 h-4" />
              类型
            </label>
            <select
              value={mediaType}
              onChange={(e) => {
                setMediaType(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 text-gray-900 dark:text-white text-sm"
            >
              <option value="">全部</option>
              <option value="movie">电影</option>
              <option value="tv">剧集</option>
            </select>
          </div>
          <div className="sm:w-44">
            <label className="text-sm text-gray-700 dark:text-gray-300 mb-1 block">每页</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 text-gray-900 dark:text-white text-sm"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/50 overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/30 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="text-left font-medium px-4 py-3">访问时间</th>
                <th className="text-left font-medium px-4 py-3">影视类型</th>
                <th className="text-left font-medium px-4 py-3">影视名称</th>
                <th className="text-left font-medium px-4 py-3">影视链接</th>
                <th className="text-left font-medium px-4 py-3">用户</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-500 dark:text-gray-400" colSpan={5}>
                    加载中...
                  </td>
                </tr>
              ) : (data?.items?.length || 0) === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-500 dark:text-gray-400" colSpan={5}>
                    暂无记录
                  </td>
                </tr>
              ) : (
                data!.items.map((it, idx) => (
                  <tr key={`${it.visited_at || 'null'}-${idx}`} className="text-gray-800 dark:text-gray-100">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {it.visited_at ? formatChinaDateTime(it.visited_at) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{it.media_type === 'movie' ? '电影' : '剧集'}</td>
                    <td className="px-4 py-3 max-w-[360px] truncate" title={it.title}>
                      {it.title}
                    </td>
                    <td className="px-4 py-3 max-w-[420px] truncate">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                        title={it.url}
                      >
                        {it.url}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {it.user ? (
                        <div className="flex flex-col">
                          <span className="font-medium">{it.user.username}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{it.user.email}</span>
                        </div>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">未登录</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-sm">
          <div className="text-gray-600 dark:text-gray-300">
            共 <span className="font-medium">{data?.total ?? 0}</span> 条
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
              disabled={loading || page <= 1}
            >
              上一页
            </button>
            <span className="text-gray-600 dark:text-gray-300">
              第 <span className="font-medium">{page}</span> / {totalPages} 页
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
              disabled={loading || page >= totalPages}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
