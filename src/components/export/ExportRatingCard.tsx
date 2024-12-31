import React from 'react';
import { Movie } from '../../types/movie';
import { Star } from 'lucide-react';

interface ExportRatingCardProps {
  movie: Movie;
}

export function ExportRatingCard({ movie }: ExportRatingCardProps) {
  return (
    <div className="bg-white p-8 rounded-3xl shadow-lg w-[1200px] flex gap-8">
      {/* 左侧海报 */}
      <div className="w-[400px] flex-shrink-0">
        <img
          src={movie.poster}
          alt={movie.title}
          className="w-full rounded-2xl shadow-md"
        />
      </div>

      {/* 右侧评分区域 */}
      <div className="flex-1 pl-8 border-l border-gray-100">
        <div className="flex items-baseline gap-2 mb-8">
          <h1 className="text-4xl font-bold">{movie.title}</h1>
          <span className="text-xl text-gray-500">({movie.year})</span>
        </div>
        
        <div className="space-y-6">
          {/* 豆瓣 */}
          <div className="flex items-center gap-4">
            <img src="/logos/douban.png" alt="豆瓣" className="w-12 h-12" />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">9.1</span>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-6 h-6 text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
              </div>
              <p className="text-gray-500 text-sm">156,789 Ratings</p>
            </div>
          </div>

          {/* IMDb */}
          <div className="flex items-center gap-4">
            <img src="/logos/imdb.png" alt="IMDb" className="w-12 h-12" />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">9.1</span>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-6 h-6 text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
              </div>
              <p className="text-gray-500 text-sm">312,394 Ratings</p>
            </div>
          </div>

          {/* Rotten Tomatoes */}
          <div className="flex items-center gap-4">
            <div className="flex gap-4">
              <img src="/logos/rottentomatoes_critics.png" alt="Rotten Tomatoes Critics" className="w-12 h-12" />
              <div>
                <div className="text-4xl font-bold">91%</div>
                <p className="text-gray-500 text-sm">156 Reviews 8.8/10</p>
              </div>
            </div>
            <div className="flex gap-4 ml-8">
              <img src="/logos/rottentomatoes_audience.png" alt="Rotten Tomatoes Audience" className="w-12 h-12" />
              <div>
                <div className="text-4xl font-bold">98%</div>
                <p className="text-gray-500 text-sm">100+ Verified Ratings 4.5/5</p>
              </div>
            </div>
          </div>

          {/* Metacritic */}
          <div className="flex items-center gap-4">
            <img src="/logos/metacritic.png" alt="Metacritic" className="w-12 h-12" />
            <div className="flex gap-12">
              <div>
                <div className="text-4xl font-bold">92</div>
                <p className="text-gray-500 text-sm">Based on 28 Critic Reviews</p>
              </div>
              <div>
                <div className="text-4xl font-bold">9.1</div>
                <p className="text-gray-500 text-sm">Based on 90 User Ratings</p>
              </div>
            </div>
          </div>

          {/* Letterboxd */}
          <div className="flex items-center gap-4">
            <img src="/logos/letterboxd.png" alt="Letterboxd" className="w-12 h-12" />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">9.1</span>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-6 h-6 text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
              </div>
              <p className="text-gray-500 text-sm">23 Ratings</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}