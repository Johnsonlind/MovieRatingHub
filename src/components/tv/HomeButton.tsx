import { Link } from 'react-router-dom';
import { CDN_URL } from '../lib/config';

export function HomeButton() {
  return (
    <Link
      to="/"
      className="absolute top-0 right-8 z-50 p-2 rounded-full"
      aria-label="返回首页"
    >
      <img 
        src={`${CDN_URL}/logos/home.png`}
        alt="Home"
        className="w-6 h-6"
      />
    </Link>
  );
} 
