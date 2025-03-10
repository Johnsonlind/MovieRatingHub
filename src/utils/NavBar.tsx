// ==========================================
// 导航栏
// ==========================================
import { HomeButton } from './HomeButton';
import { SearchButton } from './SearchButton';
import { UserButton } from './UserButton';

export function NavBar() {
  return (
    <div className="absolute top-2 left-0 right-0 z-50 flex justify-center px-4">
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-full backdrop-blur-xl bg-white/70 dark:bg-gray-800/80 shadow-lg border border-gray-200/50 dark:border-gray-700/30 max-w-[180px] w-full transition-colors duration-200">
        <HomeButton />
        <SearchButton />
        <UserButton />
      </div>
    </div>
  );
}