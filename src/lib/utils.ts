import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRating(rating: number | null): string {
  if (rating === null) return 'N/A';
  return rating.toFixed(1);
}

export function calculateAverageRating(ratings?: Record<string, number | null | undefined>) {
  if (!ratings) return 0;
  
  const validRatings = Object.values(ratings)
    .filter((rating): rating is number => 
      typeof rating === 'number' && !isNaN(rating)
    );

  if (validRatings.length === 0) return 0;

  const sum = validRatings.reduce((acc, rating) => acc + rating, 0);
  return sum / validRatings.length;
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  } catch (error) {
    console.error('Date formatting error:', error);
    return dateString;
  }
}

export function getImageUrl(path: string): string {
  return `https://image.tmdb.org/t/p/original${path}`;
}

export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}小时${remainingMinutes}分钟`;
}
