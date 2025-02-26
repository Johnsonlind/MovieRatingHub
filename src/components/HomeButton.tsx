import { Link } from 'react-router-dom';
import { CDN_URL } from '../lib/config';

export function HomeButton() {
  return (
    <Link
      to="/"
      className="absolute top-2 sm:top-3 right-12 sm:right-12 z-30 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
      aria-label="返回首页"
    >
      <img 
        src={`${CDN_URL}/logos/home.png`}
        alt="Home"
        className="w-5 h-5 sm:w-6 sm:h-6"
      />
    </Link>
  );
} 
