// ==========================================
// 导航栏组件 - 顶部悬浮导航栏（主页、搜索、用户）
// ==========================================
import { HomeButton } from './HomeButton';
import { SearchButton } from './SearchButton';
import { ChartsButton } from './ChartsButton';
import { UserButton } from './UserButton';

export function NavBar() {
  return (
    <div className="fixed top-[calc(0.5rem+env(safe-area-inset-top))] left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-full glass max-w-[220px] w-full pointer-events-auto relative overflow-hidden">
        <HomeButton />
        <SearchButton />
        <ChartsButton />
        <UserButton />
      </div>
    </div>
  );
}
