// ==========================================
// 管理员榜单录入页
// ==========================================
import { useEffect, useState } from 'react';
import { useAuth } from '../components/auth/AuthContext';
import { useQuery } from '@tanstack/react-query';

interface MediaItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  poster: string;
  year?: number;
}

interface SearchResult {
  movies: { results: MediaItem[] };
  tvShows: { results: MediaItem[] };
}

type SectionType = 'movie' | 'tv' | 'both';

const CHART_STRUCTURE: Array<{ platform: string; sections: Array<{ name: string; media_type: SectionType }> }> = [
  { platform: 'IMDb', sections: [{ name: 'Top 10 on IMDb this week', media_type: 'both' }] },
  { platform: 'TMDB', sections: [{ name: '趋势本周', media_type: 'both' }] },
  { platform: '豆瓣', sections: [
    { name: '一周口碑榜', media_type: 'movie' },
    { name: '一周华语剧集口碑榜', media_type: 'tv' },
    { name: '一周全球剧集口碑榜', media_type: 'tv' },
  ]},
  { platform: 'Letterboxd', sections: [{ name: 'Popular films this week', media_type: 'both' }] },
  { platform: 'Trakt', sections: [
    { name: 'Top TV Shows Last Week', media_type: 'tv' },
    { name: 'Top Movies Last Week', media_type: 'movie' },
  ]},
  { platform: 'MTC', sections: [
    { name: 'Trending Movies This Week', media_type: 'movie' },
    { name: 'Trending Shows This Week', media_type: 'tv' },
  ]},
  { platform: '烂番茄', sections: [
    { name: 'Popular Streaming Movies', media_type: 'movie' },
    { name: 'Popular TV', media_type: 'tv' },
  ]},
];

async function searchTMDB(q: string): Promise<SearchResult> {
  if (!q) return { movies: { results: [] }, tvShows: { results: [] } };
  const res = await fetch(`/api/tmdb-proxy/search/multi?query=${encodeURIComponent(q)}&language=zh-CN`);
  const data = await res.json();
  const movies = (data.results || []).filter((d: any) => d.media_type === 'movie').map((d: any) => ({
    id: d.id,
    type: 'movie' as const,
    title: d.title,
    poster: d.poster_path ? `/api/image-proxy?url=${encodeURIComponent(`/tmdb-images/w500${d.poster_path}`)}` : '',
    year: Number((d.release_date || '').slice(0, 4)) || undefined,
  }));
  const tvs = (data.results || []).filter((d: any) => d.media_type === 'tv').map((d: any) => ({
    id: d.id,
    type: 'tv' as const,
    title: d.name,
    poster: d.poster_path ? `/api/image-proxy?url=${encodeURIComponent(`/tmdb-images/w500${d.poster_path}`)}` : '',
    year: Number((d.first_air_date || '').slice(0, 4)) || undefined,
  }));
  return { movies: { results: movies }, tvShows: { results: tvs } };
}

export default function AdminChartsPage() {
  const { user, isLoading } = useAuth();
  const [selected] = useState<{ tmdb_id: number; type: 'movie' | 'tv'; title: string; poster: string } | null>(null);
  const [currentList, setCurrentList] = useState<Array<{ tmdb_id:number; rank:number; title:string; poster:string; locked?: boolean }>>([]);
  const [currentListsByType, setCurrentListsByType] = useState<{ movie: Array<{ tmdb_id:number; rank:number; title:string; poster:string; locked?: boolean }>; tv: Array<{ tmdb_id:number; rank:number; title:string; poster:string; locked?: boolean }>}>({ movie: [], tv: [] });
  const [submitting, setSubmitting] = useState(false);
  const [activeKey, setActiveKey] = useState<string>('');

  // 选择器（点击排名后再搜索）
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRank, setPickerRank] = useState<number | null>(null);
  const [pickerContext, setPickerContext] = useState<{ platform:string; chart_name:string; media_type:SectionType } | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerSelected, setPickerSelected] = useState<MediaItem | null>(null);

  const { data: pickerData } = useQuery({
    queryKey: ['tmdb-picker', pickerQuery],
    queryFn: () => searchTMDB(pickerQuery),
    enabled: pickerOpen && !!pickerQuery,
  });

  useEffect(() => {
    if (!activeKey && CHART_STRUCTURE.length) {
      const first = CHART_STRUCTURE[0];
      const sec = first.sections[0];
      setActiveKey(`${first.platform}:${sec.name}:${sec.media_type}`);
    }
  }, []);

  // 当切换不同的板块时，拉取该板块已录入的项目
  useEffect(() => {
    if (!activeKey) return;
    const [platform, chart_name, media_type] = activeKey.split(':');
    const authHeaders = { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } as const;
    if (media_type === 'both') {
      Promise.all([
        fetch(`/api/charts/entries?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(chart_name)}&media_type=movie`, { headers: authHeaders }).then(r=>r.ok?r.json():[]).catch(()=>[]),
        fetch(`/api/charts/entries?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(chart_name)}&media_type=tv`, { headers: authHeaders }).then(r=>r.ok?r.json():[]).catch(()=>[]),
      ])
        .then(([movies, tvs]) => {
          const byRank: Record<number, any> = {};
          [...movies, ...tvs].forEach((i:any) => {
            if (!byRank[i.rank]) byRank[i.rank] = i;
          });
          const merged = Array.from({ length: 10 }, (_, idx) => byRank[idx+1]).filter(Boolean).map((i:any)=>({ tmdb_id:i.tmdb_id, rank:i.rank, title:i.title, poster:i.poster, locked:i.locked }));
          setCurrentList(merged);
          setCurrentListsByType({
            movie: (movies||[]).map((i:any)=>({ tmdb_id:i.tmdb_id, rank:i.rank, title:i.title, poster:i.poster, locked:i.locked })),
            tv: (tvs||[]).map((i:any)=>({ tmdb_id:i.tmdb_id, rank:i.rank, title:i.title, poster:i.poster, locked:i.locked })),
          });
        })
        .catch(() => setCurrentList([]));
    } else {
      fetch(`/api/charts/entries?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(chart_name)}&media_type=${encodeURIComponent(media_type)}`, { headers: authHeaders })
        .then(r => r.json())
        .then((items) => {
          setCurrentList(items.map((i:any) => ({ tmdb_id: i.tmdb_id, rank: i.rank, title: i.title, poster: i.poster, locked:i.locked })));
          setCurrentListsByType(prev=> ({
            movie: media_type==='movie' ? items.map((i:any)=>({ tmdb_id:i.tmdb_id, rank:i.rank, title:i.title, poster:i.poster, locked:i.locked })) : prev.movie,
            tv: media_type==='tv' ? items.map((i:any)=>({ tmdb_id:i.tmdb_id, rank:i.rank, title:i.title, poster:i.poster, locked:i.locked })) : prev.tv,
          }));
        })
        .catch(() => setCurrentList([]));
    }
  }, [activeKey, submitting]);

  if (isLoading) return <div className="p-4">加载中...</div>;
  if (!user?.is_admin) return <div className="p-4 text-red-500">无权限（仅管理员可访问）</div>;

  async function addEntry(platform: string, chart_name: string, media_type: 'movie' | 'tv', rank: number, item?: MediaItem) {
    const choice = item ? { id: item.id } : (selected ? { id: selected.tmdb_id } : null);
    if (!choice) return;
    // 本地重复校验：相同 media_type 下相同 rank 已存在则阻止
    const conflictExists = (media_type === 'movie' ? currentListsByType.movie : currentListsByType.tv).some(i => i.rank === rank);
    if (conflictExists) {
      alert(`该排名已存在${media_type==='movie'?'电影':'剧集'}条目，请先清空或选择其他排名。`);
      return;
    }
    setSubmitting(true);
    const payload = {
      platform: String(platform),
      chart_name: String(chart_name),
      media_type: media_type === 'movie' ? 'movie' as const : 'tv' as const,
      tmdb_id: Number(choice.id),
      rank: Number(rank),
      title: item?.title || undefined,
      poster: item?.poster || undefined,
    };
    await fetch('/api/charts/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
      },
      body: JSON.stringify(payload),
    }).then(async r => {
      if (!r.ok) {
        const err = await r.json().catch(()=>({}));
        const detail = (err && (err.detail || err.message)) ? (err.detail || err.message) : '添加失败';
        alert(typeof detail === 'string' ? detail : JSON.stringify(detail));
        throw new Error('添加失败');
      }
      return r.json();
    }).catch(()=>{});
    setSubmitting(false);
    // 关闭选择器
    setPickerOpen(false);
    setPickerRank(null);
    setPickerContext(null);
    setPickerQuery('');
    setPickerSelected(null);
  }

  function openPicker(platform:string, chart_name:string, media_type:SectionType, rank:number){
    setPickerOpen(true);
    setPickerRank(rank);
    setPickerContext({ platform, chart_name, media_type });
    setPickerQuery('');
    setPickerSelected(null);
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">榜单录入（管理员）</h1>

      {/* 顶部搜索已移除。点击“排名X”后再弹出搜索选择 */}

      <div className="space-y-6">
        {CHART_STRUCTURE.map(({ platform, sections }) => (
          <div key={platform}>
            <h2 className="text-xl font-bold mb-2">{platform}：</h2>
            <div className="grid grid-cols-1 gap-4">
              {sections.map((sec) => {
                const key = `${platform}:${sec.name}:${sec.media_type}`;
                return (
                  <div key={key} className="border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{sec.name}（{sec.media_type === 'movie' ? '电影' : (sec.media_type === 'tv' ? '剧集' : '电影/剧集')}）</div>
                      <button className="text-sm text-blue-600" onClick={() => setActiveKey(key)}>选择</button>
                    </div>
                    {activeKey === key && (
                      <div className="space-y-3">
                        <div className="flex gap-3 flex-wrap items-end">
                          {Array.from({ length: 10 }, (_, idx) => idx + 1).map(r => {
                            const current = currentList.find(i => i.rank === r);
                            const locked = (sec.media_type === 'movie' ? currentListsByType.movie : sec.media_type === 'tv' ? currentListsByType.tv : currentList).some(i=> i.rank===r && i.locked);
                            return (
                              <div key={r} className="flex flex-col items-center">
                                <div className="w-12 h-18 overflow-hidden rounded bg-gray-200 mb-1">
                                  {current?.poster ? (
                                    <img src={/^(http|\/api|\/tmdb-images)/.test(current.poster) ? current.poster : `/api/image-proxy?url=${encodeURIComponent(current.poster)}`} alt="thumb" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">无</div>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    disabled={locked}
                                    onClick={() => openPicker(platform, sec.name, sec.media_type, r)}
                                    className={`px-2 py-1 rounded text-sm ${locked ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-green-600 text-white'}`}
                                  >排名{r}</button>
                                  {current && (
                                    <button
                                      onClick={async ()=>{
                                        const effectiveType = sec.media_type==='both' ? (current?.title ? (currentListsByType.movie.find(i=>i.rank===r)?'movie':'tv') : 'movie') : sec.media_type;
                                        await fetch(`/api/charts/entries/lock?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(sec.name)}&media_type=${encodeURIComponent(effectiveType)}&rank=${r}&locked=${!locked}`, { method:'PUT', headers:{ 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } });
                                        setSubmitting(s=>!s);
                                      }}
                                      className={`px-2 py-1 rounded text-sm ${locked ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}
                                    >{locked?'解锁':'锁定'}</button>
                                  )}
                                  {current && !locked && (
                                    <button
                                      onClick={async ()=>{
                                        const effectiveType = sec.media_type==='both' ? (currentListsByType.movie.find(i=>i.rank===r)?'movie':'tv') : sec.media_type;
                                        await fetch(`/api/charts/entries?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(sec.name)}&media_type=${encodeURIComponent(effectiveType)}&rank=${r}`, { method:'DELETE', headers:{ 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } });
                                        setSubmitting(s=>!s);
                                      }}
                                      className="px-2 py-1 rounded text-sm bg-gray-200 text-gray-800"
                                    >清空</button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* 底部缩略图网格已取消，保留上方缩略图 */}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">提示：点击排名按钮后进行搜索选择并完成。</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 选择器弹层 */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">{pickerContext?.chart_name} - 选择排名{pickerRank}</div>
              <button onClick={()=>setPickerOpen(false)} className="text-gray-500">关闭</button>
            </div>
            <div className="flex gap-2">
              <input value={pickerQuery} onChange={e=>setPickerQuery(e.target.value)} placeholder="搜索 TMDB..." className="flex-1 border rounded px-3 py-2" />
              <button onClick={()=>setPickerQuery(pickerQuery)} className="px-4 py-2 bg-blue-600 text-white rounded">搜索</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4 max-h-[50vh] overflow-auto">
              {[...(pickerData?.movies.results||[]), ...(pickerData?.tvShows.results||[])].filter(i=>{
                if (!pickerContext) return true;
                if (pickerContext.media_type === 'both') return true;
                return i.type === pickerContext.media_type;
              }).map((item:any)=> (
                <button key={`${item.type}-${item.id}`} onClick={()=>setPickerSelected(item)}
                  className={`text-left rounded overflow-hidden border ${pickerSelected?.id===item.id?'border-blue-600':'border-gray-200'}`}>
                  <div className="w-full aspect-[2/3] bg-gray-200">
                    {item.poster ? (<img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">无海报</div>
                    )}
                  </div>
                  <div className="p-2 text-sm">
                    <div className="font-medium line-clamp-2">{item.title}</div>
                    <div className="text-gray-500">{item.type.toUpperCase()} {item.year||''}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="px-3 py-2 rounded bg-gray-200" onClick={()=>setPickerOpen(false)}>取消</button>
              <button className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-60" disabled={!pickerSelected || !pickerContext || !pickerRank}
                onClick={()=> pickerContext && pickerRank && pickerSelected && addEntry(
                  pickerContext.platform,
                  pickerContext.chart_name,
                  pickerContext.media_type === 'both' ? pickerSelected.type : pickerContext.media_type,
                  pickerRank,
                  pickerSelected
                )}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
