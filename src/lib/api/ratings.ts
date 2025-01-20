import { TMDB, TRAKT } from '../constants/api';

// 获取 TMDB 评分
export async function fetchTMDBRating(mediaType: 'movie' | 'tv', id: string) {
  try {
    // 获取整体评分
    const response = await fetch(
      `${TMDB.baseUrl}/${mediaType}/${id}?api_key=${TMDB.apiKey}&language=zh-CN`
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
          `${TMDB.baseUrl}/${mediaType}/${id}/season/${season.season_number}?api_key=${TMDB.apiKey}&language=zh-CN`
        );
        const seasonData = await seasonResponse.json();
        
        // 使用季度自己的评分数据
        seasons.push({
          season_number: season.season_number,
          rating: seasonData.vote_average || 0,  // 使用季度的评分
          voteCount: seasonData.vote_count || 0  // 使用季度的投票数
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
    // 添加调试日志
    console.log('Fetching Trakt rating for:', { mediaType, tmdbId });

    // 先获取 IMDb ID
    const imdbId = await getImdbId(mediaType, tmdbId);
    if (!imdbId) {
      console.log('No IMDb ID found for:', { mediaType, tmdbId });
      return null;
    }

    if (mediaType === 'movies') {
      // 电影评分获取逻辑保持不变
      const traktResponse = await fetch(
        `${TRAKT.baseUrl}/movies/${imdbId}/ratings`,
        {
          headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT.clientId
          }
        }
      );

      if (!traktResponse.ok) {
        throw new Error(`Trakt ratings failed with status: ${traktResponse.status}`);
      }

      const data = await traktResponse.json();
      return {
        rating: data.rating || 0,
        voteCount: data.votes || 0,
        distribution: data.distribution
      };
    } else {
      // 剧集评分获取逻辑
      const showResponse = await fetch(
        `${TRAKT.baseUrl}/shows/${imdbId}/ratings`,
        {
          headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT.clientId
          }
        }
      );

      // 添加调试日志
      console.log('Trakt API response:', {
        status: showResponse.status,
        ok: showResponse.ok
      });

      if (!showResponse.ok) {
        throw new Error(`Show ratings failed with status: ${showResponse.status}`);
      }

      const data = await showResponse.json();
      
      // 添加调试日志
      console.log('Trakt API data:', data);

      // 确保返回有效的评分数据
      if (!data || typeof data.rating !== 'number') {
        console.log('Invalid Trakt rating data:', data);
        return null;
      }

      return {
        rating: data.rating,
        voteCount: data.votes || 0,
        distribution: data.distribution
      };
    }
  } catch (error) {
    console.error('Error fetching Trakt rating:', error);
    return null;
  }
}

// 获取 IMDb ID
async function getImdbId(mediaType: 'movies' | 'shows', tmdbId: string) {
  try {
    const response = await fetch(
      `${TMDB.baseUrl}/${mediaType === 'movies' ? 'movie' : 'tv'}/${tmdbId}/external_ids?api_key=${TMDB.apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get IMDb ID: ${response.status}`);
    }

    const data = await response.json();
    
    // 添加调试日志
    console.log('TMDB external IDs:', {
      tmdbId,
      imdbId: data.imdb_id,
      data
    });

    return data.imdb_id;
  } catch (error) {
    console.error('Error getting IMDb ID:', error);
    return null;
  }
} 