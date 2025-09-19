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
  
  // 自动更新相关状态
  const [autoUpdating, setAutoUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [forceRefresh, setForceRefresh] = useState(0);
  const [schedulerState, setSchedulerState] = useState<{
    running: boolean;
    next_update: string | null;
    last_update: string | null;
  } | null>(null);
  
  // 各平台操作状态
  const [platformOperations, setPlatformOperations] = useState<Record<string, boolean>>({});

  // 固定深色模式（移除主题切换）

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

  // 获取调度器状态 - 改进版本
  const { data: schedulerData, refetch: refetchScheduler } = useQuery({
    queryKey: ['scheduler-status', forceRefresh],
    queryFn: async () => {
      // 添加时间戳防止缓存
      const timestamp = new Date().getTime();
      const res = await fetch(`/api/scheduler/status?_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      return res.json();
    },
    refetchInterval: 3000, // 每3秒刷新一次
    staleTime: 0
  });

  // 监听数据变化，更新本地状态
  useEffect(() => {
    if (schedulerData?.data) {
      setSchedulerState(schedulerData.data);
    }
  }, [schedulerData]);


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
    loadCurrentList(platform, chart_name, media_type as SectionType);
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

  // 自动更新所有榜单
  async function handleAutoUpdateAll() {
    setAutoUpdating(true);
    setUpdateStatus('正在更新所有榜单...');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/charts/auto-update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setUpdateStatus('所有榜单更新成功！');
        // 刷新当前列表
        if (activeKey) {
          const [platform, chart_name, media_type] = activeKey.split(':');
          loadCurrentList(platform, chart_name, media_type as SectionType);
        }
      } else {
        setUpdateStatus(`更新失败: ${result.detail || '未知错误'}`);
      }
    } catch (error) {
      setUpdateStatus(`更新失败: ${error}`);
    } finally {
      setAutoUpdating(false);
      // 3秒后清除状态消息
      setTimeout(() => setUpdateStatus(''), 3000);
    }
  }

  // 自动更新指定平台榜单
  async function handleAutoUpdatePlatform(platform: string) {
    const operationKey = `${platform}_update`;
    setPlatformOperations(prev => ({ ...prev, [operationKey]: true }));
    setUpdateStatus(`正在更新 ${platform} 榜单...`);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/charts/auto-update/${platform}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setUpdateStatus(`${platform} 榜单更新成功！`);
        // 刷新当前列表
        if (activeKey) {
          const [currentPlatform, chart_name, media_type] = activeKey.split(':');
          if (currentPlatform === platform) {
            loadCurrentList(currentPlatform, chart_name, media_type as SectionType);
          }
        }
      } else {
        setUpdateStatus(`更新失败: ${result.detail || '未知错误'}`);
      }
    } catch (error) {
      setUpdateStatus(`更新失败: ${error}`);
    } finally {
      setPlatformOperations(prev => ({ ...prev, [operationKey]: false }));
      // 3秒后清除状态消息
      setTimeout(() => setUpdateStatus(''), 3000);
    }
  }

  // 清空指定平台榜单
  async function handleClearPlatform(platform: string) {
    if (!confirm(`确定要清空 ${platform} 平台的所有榜单吗？此操作不可撤销！`)) {
      return;
    }
    
    const operationKey = `${platform}_clear`;
    setPlatformOperations(prev => ({ ...prev, [operationKey]: true }));
    setUpdateStatus(`正在清空 ${platform} 榜单...`);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/charts/clear/${platform}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setUpdateStatus(`${platform} 榜单已清空！`);
        // 刷新当前列表
        if (activeKey) {
          const [currentPlatform, chart_name, media_type] = activeKey.split(':');
          if (currentPlatform === platform) {
            loadCurrentList(currentPlatform, chart_name, media_type as SectionType);
          }
        }
      } else {
        setUpdateStatus(`清空失败: ${result.detail || '未知错误'}`);
      }
    } catch (error) {
      setUpdateStatus(`清空失败: ${error}`);
    } finally {
      setPlatformOperations(prev => ({ ...prev, [operationKey]: false }));
      // 3秒后清除状态消息
      setTimeout(() => setUpdateStatus(''), 3000);
    }
  }

  // 清空所有平台榜单
  async function handleClearAllPlatforms() {
    if (!confirm('确定要清空所有平台的所有榜单吗？此操作不可撤销！')) {
      return;
    }
    
    const operationKey = 'clear_all';
    setPlatformOperations(prev => ({ ...prev, [operationKey]: true }));
    setUpdateStatus('正在清空所有榜单...');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/charts/clear-all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setUpdateStatus('所有榜单已清空！');
        // 刷新当前列表
        if (activeKey) {
          const [currentPlatform, chart_name, media_type] = activeKey.split(':');
          loadCurrentList(currentPlatform, chart_name, media_type as SectionType);
        }
      } else {
        setUpdateStatus(`清空失败: ${result.detail || '未知错误'}`);
      }
    } catch (error) {
      setUpdateStatus(`清空失败: ${error}`);
    } finally {
      setPlatformOperations(prev => ({ ...prev, [operationKey]: false }));
      // 3秒后清除状态消息
      setTimeout(() => setUpdateStatus(''), 3000);
    }
  }

  // 加载当前榜单列表
  async function loadCurrentList(platform: string, chart_name: string, media_type: SectionType) {
    try {
      const token = localStorage.getItem('token');
      const authHeaders = { 'Authorization': `Bearer ${token}` };
      
      if (media_type === 'both') {
        // 对于both类型，分别获取电影和剧集数据
        const [movieResponse, tvResponse] = await Promise.all([
          fetch(`/api/charts/entries?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(chart_name)}&media_type=movie`, { headers: authHeaders }),
          fetch(`/api/charts/entries?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(chart_name)}&media_type=tv`, { headers: authHeaders })
        ]);
        
        const movies = movieResponse.ok ? await movieResponse.json() : [];
        const tvs = tvResponse.ok ? await tvResponse.json() : [];
        
        // 合并数据，按排名排序
        const byRank: Record<number, any> = {};
        [...movies, ...tvs].forEach((i: any) => {
          if (!byRank[i.rank]) byRank[i.rank] = i;
        });
        const merged = Array.from({ length: 10 }, (_, idx) => byRank[idx+1]).filter(Boolean).map((i: any) => ({ 
          tmdb_id: i.tmdb_id, 
          rank: i.rank, 
          title: i.title, 
          poster: i.poster, 
          locked: i.locked 
        }));
        
        setCurrentList(merged);
        setCurrentListsByType({
          movie: movies.map((i: any) => ({ tmdb_id: i.tmdb_id, rank: i.rank, title: i.title, poster: i.poster, locked: i.locked })),
          tv: tvs.map((i: any) => ({ tmdb_id: i.tmdb_id, rank: i.rank, title: i.title, poster: i.poster, locked: i.locked })),
        });
      } else {
        // 对于单一类型，直接获取数据
        const response = await fetch(`/api/charts/entries?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(chart_name)}&media_type=${media_type}`, {
          headers: authHeaders,
        });
        
        if (response.ok) {
          const data = await response.json();
          setCurrentList(data.map((i: any) => ({ 
            tmdb_id: i.tmdb_id, 
            rank: i.rank, 
            title: i.title, 
            poster: i.poster, 
            locked: i.locked 
          })));
          
          setCurrentListsByType(prev => ({
            movie: media_type === 'movie' ? data.map((i: any) => ({ tmdb_id: i.tmdb_id, rank: i.rank, title: i.title, poster: i.poster, locked: i.locked })) : prev.movie,
            tv: media_type === 'tv' ? data.map((i: any) => ({ tmdb_id: i.tmdb_id, rank: i.rank, title: i.title, poster: i.poster, locked: i.locked })) : prev.tv,
          }));
        }
      }
    } catch (error) {
      console.error('加载榜单数据失败:', error);
    }
  }

  // 调度器控制函数 - 改进版本
  async function handleStartScheduler() {
    try {
      console.log('开始启动调度器...');
      const token = localStorage.getItem('token');
      
      if (!token) {
        setUpdateStatus('未找到认证令牌，请重新登录');
        setTimeout(() => setUpdateStatus(''), 3000);
        return;
      }
      
      // 立即更新UI状态（乐观更新）
      setSchedulerState(prev => prev ? { ...prev, running: true } : null);
      
      console.log('发送启动请求到 /api/scheduler/start');
      const response = await fetch('/api/scheduler/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      console.log('响应状态:', response.status);
      
      if (!response.ok) {
        // 如果失败，恢复原状态
        setSchedulerState(prev => prev ? { ...prev, running: false } : null);
        const errorText = await response.text();
        console.error('启动失败响应:', errorText);
        setUpdateStatus(`启动调度器失败 (${response.status}): ${errorText}`);
        setTimeout(() => setUpdateStatus(''), 5000);
        return;
      }
      
      const result = await response.json();
      console.log('启动成功响应:', result);
      
      // 强制刷新状态
      setForceRefresh(prev => prev + 1);
      await refetchScheduler();
      
      setUpdateStatus('定时任务调度器已启动');
      setTimeout(() => setUpdateStatus(''), 3000);
    } catch (error) {
      // 如果失败，恢复原状态
      setSchedulerState(prev => prev ? { ...prev, running: false } : null);
      console.error('启动调度器异常:', error);
      setUpdateStatus(`启动调度器失败: ${error}`);
      setTimeout(() => setUpdateStatus(''), 5000);
    }
  }

  async function handleStopScheduler() {
    try {
      console.log('开始停止调度器...');
      const token = localStorage.getItem('token');
      
      if (!token) {
        setUpdateStatus('未找到认证令牌，请重新登录');
        setTimeout(() => setUpdateStatus(''), 3000);
        return;
      }
      
      // 立即更新UI状态（乐观更新）
      setSchedulerState(prev => prev ? { ...prev, running: false } : null);
      
      const response = await fetch('/api/scheduler/stop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        // 如果失败，恢复原状态
        setSchedulerState(prev => prev ? { ...prev, running: true } : null);
        const errorText = await response.text();
        setUpdateStatus(`停止调度器失败 (${response.status}): ${errorText}`);
        setTimeout(() => setUpdateStatus(''), 5000);
        return;
      }
      
      const result = await response.json();
      console.log('停止成功响应:', result);
      
      // 强制刷新状态
      setForceRefresh(prev => prev + 1);
      await refetchScheduler();
      
      setUpdateStatus('定时任务调度器已停止');
      setTimeout(() => setUpdateStatus(''), 3000);
    } catch (error) {
      // 如果失败，恢复原状态
      setSchedulerState(prev => prev ? { ...prev, running: true } : null);
      console.error('停止调度器异常:', error);
      setUpdateStatus(`停止调度器失败: ${error}`);
      setTimeout(() => setUpdateStatus(''), 5000);
    }
  }


  return (
    <div className={`container mx-auto px-4 py-6 min-h-screen transition-colors bg-gray-900 text-white`}>
      <div className="flex justify-between items-center mb-4">
        <h1 className={`text-2xl font-bold text-white`}>
          榜单录入（管理员）
        </h1>
        
        {/* 自动更新控制面板 */}
        <div className="flex items-center gap-4">
          {/* 深色模式固定，无需切换按钮 */}
          
          {/* 状态显示 */}
          {updateStatus && (
            <div className={`px-3 py-1 rounded text-sm bg-blue-900 text-blue-200`}>
              {updateStatus}
            </div>
          )}
          
          {/* 调度器状态 - 使用本地状态 */}
          {(schedulerState || schedulerData?.data) && (
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${
                (schedulerState || schedulerData?.data)?.running ? 'bg-green-500' : 'bg-gray-400'
              }`}></div>
              <span className={'text-gray-300'}>
                {(schedulerState || schedulerData?.data)?.running ? '调度器运行中' : '调度器已停止'}
              </span>
              {(schedulerState || schedulerData?.data)?.last_update && (
                <span className={`text-xs text-gray-400`}>
                  上次更新: {new Date((schedulerState || schedulerData?.data)?.last_update).toLocaleString()}
                </span>
              )}
            </div>
          )}
          
          {/* 全部更新和清空按钮 */}
          <div className="flex gap-3">
            <button
              onClick={handleClearAllPlatforms}
              disabled={platformOperations['clear_all']}
              className={`px-4 py-2 rounded font-medium transition-colors ${platformOperations['clear_all'] ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
            >
              {platformOperations['clear_all'] ? '处理中...' : '清空所有榜单'}
            </button>
            <button
              onClick={handleAutoUpdateAll}
              disabled={autoUpdating}
              className={`px-4 py-2 rounded font-medium transition-colors ${autoUpdating ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {autoUpdating ? '更新中...' : '更新所有榜单'}
            </button>
          </div>
        </div>
      </div>

      {/* 调度器控制面板 - 使用本地状态 */}
      {(schedulerState || schedulerData?.data) && (
        <div className={`mb-6 p-4 rounded-lg bg-gray-800 border border-gray-700`}>
          <h3 className={`text-lg font-semibold mb-3 text-white`}>
            定时自动更新
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                (schedulerState || schedulerData?.data)?.running ? 'bg-green-500' : 'bg-gray-400'
              }`}></div>
              <span className={`font-medium text-white`}>
                {(schedulerState || schedulerData?.data)?.running ? '运行中' : '已停止'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className={`text-sm text-gray-300`}>
                更新时间: 每天 21:30 (北京时间)
              </span>
              {(schedulerState || schedulerData?.data)?.next_update && (
                <span className={`text-xs text-gray-400`}>
                  下次更新: {new Date((schedulerState || schedulerData?.data)?.next_update).toLocaleString()}
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              {(schedulerState || schedulerData?.data)?.running ? (
                <button
                  onClick={handleStopScheduler}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  停止定时更新
                </button>
              ) : (
                <button
                  onClick={handleStartScheduler}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  启动定时更新
                </button>
              )}
            </div>
            
            {schedulerData.data.last_update && (
              <div className={`text-sm text-gray-400`}>
                上次更新: {new Date(schedulerData.data.last_update).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 点击"排名X"后再弹出搜索选择 */}

      <div className="space-y-6">
        {CHART_STRUCTURE.map(({ platform, sections }) => (
          <div key={platform}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-xl font-bold text-white`}>
                {platform}：
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleClearPlatform(platform)}
                  disabled={platformOperations[`${platform}_clear`]}
                  className={`text-sm px-3 py-1 rounded transition-colors ${platformOperations[`${platform}_clear`] ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'}`}
                >
                  {platformOperations[`${platform}_clear`] ? '处理中...' : `清空${platform}榜单`}
                </button>
                <button
                  onClick={() => handleAutoUpdatePlatform(platform)}
                  disabled={platformOperations[`${platform}_update`]}
                  className={`text-sm px-3 py-1 rounded transition-colors ${platformOperations[`${platform}_update`] ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                >
                  {platformOperations[`${platform}_update`] ? '更新中...' : `更新${platform}榜单`}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {sections.map((sec) => {
                const key = `${platform}:${sec.name}:${sec.media_type}`;
                return (
                  <div key={key} className={`border rounded p-3 border-gray-700 bg-gray-800`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className={`font-medium text-white`}>
                        {sec.name}（{sec.media_type === 'movie' ? '电影' : (sec.media_type === 'tv' ? '剧集' : '电影/剧集')}）
                      </div>
                      <button 
                        className={`text-sm text-blue-400 hover:text-blue-300`} 
                        onClick={() => setActiveKey(key)}
                      >
                        选择
                      </button>
                    </div>
                    {activeKey === key && (
                      <div className="space-y-3">
                        <div className="flex gap-3 flex-wrap items-end">
                          {Array.from({ length: 10 }, (_, idx) => idx + 1).map(r => {
                            const current = currentList.find(i => i.rank === r);
                            const locked = (sec.media_type === 'movie' ? currentListsByType.movie : sec.media_type === 'tv' ? currentListsByType.tv : currentList).some(i=> i.rank===r && i.locked);
                            return (
                              <div key={r} className="flex flex-col items-center">
                                <div className={`w-12 h-18 overflow-hidden rounded mb-1 bg-gray-700`}>
                                  {current?.poster ? (
                                    <img src={/^(http|\/api|\/tmdb-images)/.test(current.poster) ? current.poster : `/api/image-proxy?url=${encodeURIComponent(current.poster)}`} alt="thumb" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className={`w-full h-full flex items-center justify-center text-[10px] text-gray-500`}>
                                      无
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    disabled={locked}
                                    onClick={() => openPicker(platform, sec.name, sec.media_type, r)}
                                    className={`px-2 py-1 rounded text-sm transition-colors ${locked ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                                  >
                                    排名{r}
                                  </button>
                                  {current && (
                                    <button
                                      onClick={async ()=>{
                                        const effectiveType = sec.media_type==='both' ? (current?.title ? (currentListsByType.movie.find(i=>i.rank===r)?'movie':'tv') : 'movie') : sec.media_type;
                                        await fetch(`/api/charts/entries/lock?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(sec.name)}&media_type=${encodeURIComponent(effectiveType)}&rank=${r}&locked=${!locked}`, { method:'PUT', headers:{ 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } });
                                        setSubmitting(s=>!s);
                                      }}
                                      className={`px-2 py-1 rounded text-sm transition-colors ${
                                        locked 
                                          ? 'bg-red-500 text-white hover:bg-red-600' 
                                          : 'bg-blue-500 text-white hover:bg-blue-600'
                                      }`}
                                    >
                                      {locked?'解锁':'锁定'}
                                    </button>
                                  )}
                                  {current && !locked && (
                                    <button
                                      onClick={async ()=>{
                                        const effectiveType = sec.media_type==='both' ? (currentListsByType.movie.find(i=>i.rank===r)?'movie':'tv') : sec.media_type;
                                        await fetch(`/api/charts/entries?platform=${encodeURIComponent(platform)}&chart_name=${encodeURIComponent(sec.name)}&media_type=${encodeURIComponent(effectiveType)}&rank=${r}`, { method:'DELETE', headers:{ 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } });
                                        setSubmitting(s=>!s);
                                      }}
                                      className={`px-2 py-1 rounded text-sm transition-colors bg-gray-600 text-gray-200 hover:bg-gray-500`}
                                    >
                                      清空
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* 底部缩略图网格已取消，保留上方缩略图 */}
                      </div>
                    )}
                    <div className={`text-xs mt-2 text-gray-400`}>
                      提示：点击排名按钮后进行搜索选择并完成。
                    </div>
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
          <div className={`w-full max-w-3xl rounded-lg p-4 bg-gray-900 border border-gray-700`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`text-lg font-semibold text-white`}>
                {pickerContext?.chart_name} - 选择排名{pickerRank}
              </div>
              <button 
                onClick={()=>setPickerOpen(false)} 
                className={`text-gray-400 hover:text-gray-300`}
              >
                关闭
              </button>
            </div>
            <div className="flex gap-2">
              <input 
                value={pickerQuery} 
                onChange={e=>setPickerQuery(e.target.value)} 
                placeholder="搜索 TMDB..." 
                className={`flex-1 border rounded px-3 py-2 bg-gray-800 border-gray-600 text-white placeholder-gray-400`} 
              />
              <button 
                onClick={()=>setPickerQuery(pickerQuery)} 
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                搜索
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4 max-h-[50vh] overflow-auto">
              {[...(pickerData?.movies.results||[]), ...(pickerData?.tvShows.results||[])].filter(i=>{
                if (!pickerContext) return true;
                if (pickerContext.media_type === 'both') return true;
                return i.type === pickerContext.media_type;
              }).map((item:any)=> (
                <button key={`${item.type}-${item.id}`} onClick={()=>setPickerSelected(item)}
                  className={`text-left rounded overflow-hidden border transition-colors ${
                    pickerSelected?.id===item.id
                      ? 'border-blue-600 ring-2 ring-blue-200'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}>
                  <div className={`w-full aspect-[2/3] bg-gray-700`}>
                    {item.poster ? (
                      <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center text-sm text-gray-400`}>
                        无海报
                      </div>
                    )}
                  </div>
                  <div className="p-2 text-sm">
                    <div className={`font-medium line-clamp-2 text-white`}>
                      {item.title}
                    </div>
                    <div className={`text-gray-400`}>
                      {item.type.toUpperCase()} {item.year||''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button 
                className={`px-3 py-2 rounded transition-colors bg-gray-700 text-gray-200 hover:bg-gray-600`} 
                onClick={()=>setPickerOpen(false)}
              >
                取消
              </button>
              <button 
                className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors" 
                disabled={!pickerSelected || !pickerContext || !pickerRank}
                onClick={async ()=> {
                  if (pickerContext && pickerRank && pickerSelected) {
                    await addEntry(
                      pickerContext.platform,
                      pickerContext.chart_name,
                      pickerContext.media_type === 'both' ? pickerSelected.type : pickerContext.media_type,
                      pickerRank,
                      pickerSelected
                    );
                    setPickerOpen(false);
                  }
                }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
