import React, { useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { getChineseJobTitle } from '../../lib/utils/jobTitles';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CreditMember {
  name: string;
  role?: string;
  imageUrl?: string;
  job?: string;
  profilePath?: string | null;
  character?: string;
}

interface CreditsProps {
  cast: CreditMember[];
  crew: CreditMember[];
  className?: string;
}

export function Credits({ cast, crew, className }: CreditsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    
    const scrollAmount = direction === 'left' ? -400 : 400;
    scrollContainerRef.current.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });
  };

  const getActorImageUrl = (profilePath: string | null | undefined): string => {
    if (!profilePath) {
      return '/default-avatar.png';
    }
    return `https://image.tmdb.org/t/p/w185${profilePath}`;
  };

  return (
    <div className={cn("container mx-auto px-4 py-8", className)}>
      {/* 主创团队 */}
      {crew.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">主创团队</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {crew.map((member, index) => (
              <div key={index} className="p-3 rounded-lg bg-gray-50">
                <h3 className="font-medium text-gray-900">{member.name}</h3>
                <p className="text-sm text-gray-500">{getChineseJobTitle(member.job || '')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 主演阵容 */}
      <section>
        <h2 className="text-2xl font-bold mb-4">主演阵容</h2>
        <div className="relative">
          {showLeftArrow && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white shadow-lg rounded-full p-2"
              aria-label="向左滚动"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {showRightArrow && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white shadow-lg rounded-full p-2"
              aria-label="向右滚动"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="overflow-x-auto scrollbar-hide px-4"
          >
            <div className="flex gap-4 pb-4" style={{ width: 'max-content' }}>
              {cast.map((member, index) => (
                <div key={index} className="w-48 flex-shrink-0">
                  <div className="aspect-[2/3] mb-2 overflow-hidden rounded-lg bg-gray-100">
                    <img
                      src={getActorImageUrl(member.profilePath)}
                      alt={member.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/default-avatar.png';
                        target.onerror = null;
                      }}
                    />
                  </div>
                  <h3 className="font-medium text-gray-900 truncate">{member.name}</h3>
                  <p className="text-sm text-gray-500 truncate">{member.character}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}