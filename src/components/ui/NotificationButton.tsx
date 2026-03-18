// ==========================================
// 通知按钮组件
// ==========================================
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getUnreadNotificationCount } from '../../api/notifications';

export function NotificationButton() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }

    let cancelled = false;
    const fetchCount = async () => {
      try {
        const c = await getUnreadNotificationCount();
        if (!cancelled) setCount(c);
      } catch {
        if (!cancelled) setCount(0);
      }
    };

    fetchCount();
    const timer = window.setInterval(fetchCount, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchCount();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  if (!user) return null;

  const display = count > 99 ? '99+' : String(count);

  return (
    <Link
      to="/notifications"
      className="w-7 h-7 flex items-center justify-center rounded-full glass-button transition-all duration-200 hover:scale-110 relative"
      aria-label={count > 0 ? `通知（未读 ${count}）` : '通知'}
    >
      <Bell className="w-5 h-5 text-gray-800 dark:text-white" />
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center"
          aria-label={`未读 ${count}`}
        >
          {display}
        </span>
      )}
    </Link>
  );
}
