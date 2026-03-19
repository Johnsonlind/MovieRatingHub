// ==========================================
// 顶部导航栏组件
// ==========================================
import { HomeButton } from '../../modules/search/HomeButton';
import { SearchButton } from '../../modules/search/SearchButton';
import { ChartsButton } from '../../modules/search/ChartsButton';
import { UserButton } from '../../modules/user/UserButton';
import { NotificationButton } from '../../modules/notification/NotificationButton';

export function NavBar() {
  return (
    <nav
      aria-label="主导航"
      className="absolute top-2 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-full glass max-w-[260px] w-full pointer-events-auto relative overflow-hidden">
        <HomeButton />
        <SearchButton />
        <ChartsButton />
        <NotificationButton />
        <UserButton />
      </div>
    </nav>
  );
}
