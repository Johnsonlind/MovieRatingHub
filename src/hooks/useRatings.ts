import useSWR from 'swr';
import type { RatingData } from '../types/ratings';

const API_URL = import.meta.env.VITE_API_URL;
const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useRatings(type: 'movie' | 'tv', id: string) {
  const { data, error, isLoading } = useSWR<RatingData>(
    id ? `${API_URL}/ratings/${type}/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  );

  return {
    data,
    isLoading,
    error
  };
} 