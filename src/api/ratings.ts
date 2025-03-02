// ==========================================
// 评分 API
// ==========================================
import { TMDB, TRAKT } from './api';

// 获取 IMDb ID
async function getImdbId(mediaType: 'movies' | 'shows', tmdbId: string) {
  try {
    const response = await fetch(
      `${TMDB.baseUrl}/${mediaType === 'movies' ? 'movie' : 'tv'}/${tmdbId}/external_ids`
    );

    if (!response.ok) {
      throw new Error(`Failed to get IMDb ID: ${response.status}`);
    }

    const data = await response.json();

    return data.imdb_id;
  } catch (error) {
    console.error('Error getting IMDb ID:', error);
    return null;
  }
} 

// 获取 TMDB 评分
export async function fetchTMDBRating(mediaType: 'movie' | 'tv', id: string) {
  try {
    // 获取整体评分
    const response = await fetch(
      `${TMDB.baseUrl}/${mediaType}/${id}?language=zh-CN`
    );
    const data = await response.json();
    
    if (mediaType === 'movie') {
      return {
        rating: data.vote_average,
        voteCount: data.vote_count
      };
    }

    // 如果是电视剧，获取所有季度（包括特别篇）的评分
    const seasons = [];
    if (data.seasons?.length > 0) {
      for (const season of data.seasons) {
        const seasonResponse = await fetch(
          `${TMDB.baseUrl}/${mediaType}/${id}/season/${season.season_number}?language=zh-CN`
        );
        const seasonData = await seasonResponse.json();
        
        // 使用季度自己的评分数据
        seasons.push({
          season_number: season.season_number,
          rating: seasonData.vote_average || 0,
          voteCount: seasonData.vote_count || 0
        });
      }
    }

    return {
      rating: data.vote_average,
      voteCount: data.vote_count,
      seasons
    };
  } catch (error) {
    console.error('获取 TMDB 评分失败:', error);
    return null;
  }
}

// 获取 Trakt 评分
export async function fetchTraktRating(mediaType: 'movies' | 'shows', tmdbId: string) {
  try {
    // 获取IMDb ID
    const imdbId = await getImdbId(mediaType, tmdbId);
    if (!imdbId) return null;

    // 获取整体评分
    const endpoint = mediaType === 'shows' ? 'shows' : 'movies';
    const response = await fetch(
      `${TRAKT.baseUrl}/${endpoint}/${imdbId}/ratings`,
      {
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': TRAKT.clientId
        }
      }
    );

    if (!response.ok) {
      throw new Error(`${endpoint} ratings failed with status: ${response.status}`);
    }

    const ratingData = await response.json();

    // 如果是电影，直接返回评分数据
    if (mediaType === 'movies') {
      return {
        rating: ratingData.rating,
        votes: ratingData.votes,
        distribution: ratingData.distribution
      };
    }

    // 如果是电视剧，继续获取季度评分
    // 从TMDB获取季数信息
    const tmdbResponse = await fetch(
      `${TMDB.baseUrl}/tv/${tmdbId}?language=zh-CN`
    );

    if (!tmdbResponse.ok) {
      throw new Error('Failed to fetch TMDB season info');
    }

    const tmdbData = await tmdbResponse.json();
    const seasons = tmdbData.seasons || [];

    // 获取每季评分
    const seasonPromises = seasons.map(async (season: any) => {
      try {
        const seasonResponse = await fetch(
          `${TRAKT.baseUrl}/shows/${imdbId}/seasons/${season.season_number}/ratings`,
          {
            headers: {
              'Content-Type': 'application/json',
              'trakt-api-version': '2',
              'trakt-api-key': TRAKT.clientId
            }
          }
        );

        if (!seasonResponse.ok) {
          console.warn(`Failed to fetch season ${season.season_number} ratings`);
          return null;
        }

        const seasonData = await seasonResponse.json();

        return {
          season_number: season.season_number,
          rating: seasonData.rating || 0,
          votes: seasonData.votes || 0,
          distribution: seasonData.distribution || {}
        };
      } catch (error) {
        console.error(`Error fetching season ${season.season_number} ratings:`, error);
        return null;
      }
    });

    const validSeasons = (await Promise.all(seasonPromises)).filter(Boolean);

    return {
      rating: ratingData.rating,
      votes: ratingData.votes,
      distribution: ratingData.distribution,
      seasons: validSeasons
    };

  } catch (error) {
    console.error('获取Trakt评分失败:', error);
    return null;
  }
}
