import { MediaCard } from './MediaCard';
import { Pagination } from './Pagination';
import type { Media } from '../types/media';

interface SearchResultsProps {
  items: Media[];
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  title?: string;
}

export function SearchResults({ 
  items, 
  totalPages,
  currentPage,
  onPageChange,
  title 
}: SearchResultsProps) {
  return (
    <div>
      {title && (
        <h2 className="text-xl sm:text-2xl font-bold mb-4 hidden lg:block">{title}</h2>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </div>
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}