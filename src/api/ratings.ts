// ==========================================
// 评分 API
// ==========================================
import { TMDB } from './api';

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
// 改为调用后端API，后端会处理IMDB ID缺失的情况
export async function fetchTraktRating(mediaType: 'movies' | 'shows', tmdbId: string) {
  try {
    // 直接调用后端API，后端会：
    // 1. 尝试TMDB ID搜索
    // 2. 回退到标题搜索
    // 3. 不依赖IMDB ID
    const type = mediaType === 'movies' ? 'movie' : 'tv';
    const response = await fetch(`/api/ratings/trakt/${type}/${tmdbId}`);
    
    if (!response.ok) {
      console.warn(`后端Trakt API返回错误: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // 检查状态
    if (data.status !== 'Successful') {
      console.warn(`Trakt评分获取失败: ${data.status}`);
      return null;
    }
    
    // 转换为前端期望的格式
    // 注意：对于选集剧的单季条目，后端返回的是整体评分
    // 我们将其作为第1季的评分
    const result: any = {
      rating: parseFloat(data.rating) || 0,
      votes: parseInt(data.votes) || 0,
      distribution: data.distribution || {}
    };
    
    // 如果是剧集，需要seasons数组
    if (type === 'tv') {
      // 对于单季剧集（如选集剧的一季），将整体评分作为第1季评分
      result.seasons = [{
        season_number: 1,
        rating: parseFloat(data.rating) || 0,
        votes: parseInt(data.votes) || 0,
        distribution: data.distribution || {}
      }];
    }
    
    return result;

  } catch (error) {
    console.error('获取Trakt评分失败:', error);
    return null;
  }
}
