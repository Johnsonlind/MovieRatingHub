// ==========================================
// 平台锁定状态 API
// ==========================================
import { authFetchJson } from './authFetch';

export interface MediaPlatformStatusItem {
  id: number;
  media_type: 'movie' | 'tv' | string;
  tmdb_id: number;
  title: string | null;
  platform: string;
  status: string;
  lock_source: string | null;
  remark: string | null;
  failure_count: number;
  last_failure_status: string | null;
  updated_at: string | null;
}

export interface MediaPlatformStatusListResponse {
  items: MediaPlatformStatusItem[];
}

export async function fetchLockedPlatformStatus(params: {
  media_type?: string;
  platform?: string;
  tmdb_id?: number;
  title?: string;
  skip?: number;
  limit?: number;
}): Promise<MediaPlatformStatusItem[]> {
  const sp = new URLSearchParams();
  if (params.media_type) sp.set('media_type', params.media_type);
  if (params.platform) sp.set('platform', params.platform);
  if (params.tmdb_id != null) sp.set('tmdb_id', String(params.tmdb_id));
  if (params.title) sp.set('title', params.title);
  if (params.skip != null) sp.set('skip', String(params.skip));
  if (params.limit != null) sp.set('limit', String(params.limit));

  const data = await authFetchJson<MediaPlatformStatusItem[]>(
    `/api/admin/platform-status?${sp.toString()}`,
  );
  return data;
}

export async function lockPlatformStatus(payload: {
  media_type: string;
  tmdb_id: number;
  platform: string;
  remark?: string;
  title?: string;
}) {
  return await authFetchJson<{ ok: boolean; record: MediaPlatformStatusItem }>(
    '/api/admin/platform-status/lock',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
}

export async function unlockPlatformStatus(payload: {
  media_type: string;
  tmdb_id: number;
  platform: string;
  remark?: string;
}) {
  return await authFetchJson<{ ok: boolean; record: MediaPlatformStatusItem }>(
    '/api/admin/platform-status/unlock',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
}
