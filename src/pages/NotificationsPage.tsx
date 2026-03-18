// ==========================================
// 通知中心页
// ==========================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../components/layout/PageShell';
import { useAuth } from '../components/auth/AuthContext';
import { deleteNotifications, getNotifications, markNotificationsRead, type NotificationItem } from '../api/notifications';
import { toast } from 'sonner';
import { formatChinaDateTime } from '../utils/time';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getNotifications({ limit: 100, offset: 0 });
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e?.message || '获取通知失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user]);

  const handleOpen = async (n: NotificationItem) => {
    try {
      if (!n.is_read) {
        await markNotificationsRead({ ids: [n.id] });
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      }
    } catch {
    }

    const link = (n.link || '').trim();
    if (link) navigate(link);
  };

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsRead({ all: true });
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    } catch (e: any) {
      toast.error(e?.message || '操作失败');
    }
  };

  const handleDeleteOne = async (id: number) => {
    try {
      setDeleting(true);
      await deleteNotifications({ ids: [id] });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      toast.error(e?.message || '清除失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    const ok = window.confirm('确定要清空所有通知吗？此操作不可恢复。');
    if (!ok) return;
    try {
      setDeleting(true);
      await deleteNotifications({ all: true });
      setItems([]);
    } catch (e: any) {
      toast.error(e?.message || '清空失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageShell maxWidth="4xl">
      <div className="py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">通知中心</h1>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {loading ? '加载中...' : unreadCount > 0 ? `未读 ${unreadCount} 条` : '暂无未读通知'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg text-sm glass-button no-hover-scale"
              onClick={refresh}
              disabled={!user || loading || deleting}
            >
              刷新
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-sm glass-button no-hover-scale"
              onClick={handleMarkAllRead}
              disabled={!user || loading || deleting || unreadCount === 0}
            >
              全部已读
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-sm glass-button no-hover-scale"
              onClick={handleDeleteAll}
              disabled={!user || loading || deleting || items.length === 0}
            >
              清空
            </button>
          </div>
        </div>

        {!user ? (
          <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">请先登录后查看通知。</div>
        ) : items.length === 0 ? (
          <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">暂无通知。</div>
        ) : (
          <div className="mt-6 space-y-2">
            {items.map((n) => {
              const timeText = n.created_at ? formatChinaDateTime(n.created_at) : '';
              return (
                <button
                  key={n.id}
                  onClick={() => handleOpen(n)}
                  className={`w-full text-left glass-card rounded-2xl p-4 sm:p-5 transition-shadow ring-1 ring-white/10 dark:ring-white/5 hover:shadow-md ${
                    n.is_read ? 'opacity-75' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!n.is_read && <span className="w-2 h-2 rounded-full bg-red-500" aria-label="未读" />}
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                          {n.content}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{timeText}</div>
                      <button
                        type="button"
                        className="no-hover-scale text-xs px-2 py-1 rounded-md border border-white/20 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-white/20 dark:hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOne(n.id);
                        }}
                        disabled={deleting}
                        aria-label="清除该通知"
                      >
                        清除
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
