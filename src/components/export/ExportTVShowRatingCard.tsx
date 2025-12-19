// ==========================================
// 剧集导出卡片组件 - 用于生成PNG图片的剧集评分卡片（支持分季，使用内联样式，Safari兼容）
// ==========================================
import { formatRating } from '../../utils/formatRating';
import type { TVShow } from '../../types/media';
import type { TVShowRatingData } from '../../types/ratings';
import type {
  DoubanRating,
  IMDBRating,
  RottenTomatoesRating,
  MetacriticRating,
  TMDBRating,
  TraktRating
} from '../../types/ratings';
import { calculateSeasonRating } from '../ratings/calculateSeasonRating';
import { calculateOverallRating } from '../ratings/calculateOverallrating';
import { isValidRatingData } from '../../utils/ratingHelpers';
import { getCriticLogo, getAudienceLogo } from '../../utils/rottenTomatoesLogos';

interface ExportTVShowRatingCardProps {
  tvShow: TVShow;
  ratingData: TVShowRatingData;
  selectedSeason?: number;
}

interface CurrentRatings {
  douban: (DoubanRating['seasons'] extends Array<infer T> ? T : never | DoubanRating) | null;
  imdb: IMDBRating | null;
  rt: RottenTomatoesRating['series'] | null;
  metacritic: MetacriticRating['overall'] | null;
  tmdb: TMDBRating | null;
  trakt: TraktRating | null;
  letterboxd: {
    status: string;
    rating: string;
    rating_count: string;
  } | null;
}

export function ExportTVShowRatingCard({ 
  tvShow,
  ratingData,
  selectedSeason
}: ExportTVShowRatingCardProps) {
  // 检测主题
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  
  // 获取当前海报
  const currentPoster = selectedSeason 
    ? tvShow.seasons?.find(s => s.seasonNumber === selectedSeason)?.poster || tvShow.poster
    : tvShow.poster;

  // 获取当前季的评分数据
  const ratings: CurrentRatings = selectedSeason 
    ? {
        // 豆瓣：优先从seasons数组查找，如果没有seasons数组且是第1季，使用整体rating
        douban: (() => {
          const seasonRating = ratingData.douban?.seasons?.find(s => s.season_number === selectedSeason);
          if (seasonRating) return seasonRating;
          
          // 对于单季剧集（没有seasons数组），且是第1季，使用整体rating
          if (selectedSeason === 1 && ratingData.douban?.rating && !ratingData.douban?.seasons) {
            return {
              season_number: 1,
              rating: ratingData.douban.rating,
              rating_people: ratingData.douban.rating_people || ''
            };
          }
          
          return null;
        })(),
        imdb: null,
        rt: ratingData.rottentomatoes?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        metacritic: ratingData.metacritic?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        tmdb: ratingData.tmdb?.seasons?.find(s => s.season_number === selectedSeason) ?? null,
        trakt: (() => {
          const seasonRating = ratingData.trakt?.seasons?.find(s => s.season_number === selectedSeason);
          if (!seasonRating) return null;
          
          return {
            rating: seasonRating.rating,
            votes: seasonRating.votes,
            distribution: seasonRating.distribution as unknown as TraktRating['distribution']
          };
        })(),
        letterboxd: null
      }
    : {
        douban: ratingData.douban ?? null,
        imdb: ratingData.imdb ?? null,
        rt: ratingData.rottentomatoes?.series ?? null,
        metacritic: ratingData.metacritic?.overall ?? null,
        tmdb: ratingData.tmdb ?? null,
        trakt: ratingData.trakt ?? null,
        letterboxd: ratingData.letterboxd ?? null
      };

  // 主卡片样式 - 使用主题渐变色（包含原containerStyle的尺寸和padding）
  const cardStyle = {
    width: '1200px',
    minHeight: '902px',
    backgroundColor: isDark ? '#0a0e1a' : '#f0f9ff',
    background: isDark 
      ? `linear-gradient(135deg, #0a0e1a 0%, #0f172a 50%, #1e293b 100%)`
      : `linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)`,
    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.6)',
    borderRadius: '24px',
    padding: '50px',
    boxShadow: isDark
      ? `0 16px 48px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)`
      : `0 16px 48px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)`,
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    fontFamily: "'ShangGuDengKuan', 'Onest', system-ui, -apple-system, sans-serif" as const
  };

  // 左侧海报容器样式
  const posterContainerStyle = {
    width: '300px',
    marginLeft: '-20px',
    position: 'relative' as const,
    zIndex: 20
  };

  const posterGlassStyle = {
    width: '100%',
    height: '100%',
    minHeight: '800px',
    backgroundColor: isDark ? '#0a0e1a' : '#f0f9ff',
    background: isDark 
      ? `linear-gradient(135deg, #0a0e1a 0%, #0f172a 50%, #1e293b 100%)`
      : `linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)`,
    backdropFilter: 'blur(50px) saturate(200%)',
    WebkitBackdropFilter: 'blur(50px) saturate(200%)',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.6)',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: isDark
      ? `0 12px 40px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)`
      : `0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)`,
    position: 'relative' as const
  };

  // 评分卡片样式 - 浅色模式使用指定颜色，暗色模式使用指定颜色和边框
  const ratingCardStyle = {
    backgroundColor: isDark ? '#090f19' : '#98a1a5',
    background: isDark ? '#090f19' : '#98a1a5',
    border: isDark ? '1px solid #2e384b' : '1px solid #f6fcff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: isDark
      ? `0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
      : `0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
    color: '#ffffff',
    position: 'relative' as const
  };

  // 综合评分样式
  const overallRatingStyle = {
    width: '112px',
    position: 'relative' as const
  };

  const overallRatingGradientStyle = {
    background: isDark
      ? `linear-gradient(135deg, #db2777 0%, #be185d 50%, #9f1239 100%)`
      : `linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #c026d3 100%)`,
    borderRadius: '12px',
    padding: '16px',
    minHeight: '70px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    boxShadow: isDark
      ? `0 8px 24px rgba(219, 39, 119, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)`
      : `0 8px 24px rgba(236, 72, 153, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)`
  };

  // 渲染评分卡片
  const renderRatingCard = (logo: string, rating: number, label?: string, showStars: boolean = false) => (
    <div style={ratingCardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <img 
          src={logo} 
          alt="" 
          style={{ 
            width: '40px',
            height: '40px',
            objectFit: 'contain', 
            flexShrink: 0,
            imageRendering: 'auto'
          }}
          crossOrigin="anonymous"
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '36px', fontWeight: 'bold', lineHeight: 1, color: '#ffffff' }}>
              {rating.toFixed(1)}
            </span>
          </div>
          {label && (
            <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)', marginTop: '4px' }}>
              {label}
            </div>
          )}
          {showStars && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '2px' }}>
              {[...Array(5)].map((_, i) => {
                const starValue = (rating / 10) * 5;
                const isFull = i < Math.floor(starValue);
                const isHalf = i === Math.floor(starValue) && starValue % 1 >= 0.3;
                return (
                  <span key={i} style={{ fontSize: '16px', color: isFull || isHalf ? '#fbbf24' : '#6b7280' }}>
                    {isFull ? '★' : isHalf ? '☆' : '☆'}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // 渲染Rotten Tomatoes卡片
  const renderRottenTomatoesCard = (criticScore?: number, audienceScore?: number, criticReviews?: string, audienceReviews?: string) => {
    if (!criticScore && !audienceScore) return null;
    
    return (
      <div style={ratingCardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {criticScore && criticScore > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <img 
                src={getCriticLogo(criticScore)}
                alt=""
                style={{ 
                  width: '40px',
                  height: '40px',
                  objectFit: 'contain', 
                  flexShrink: 0,
                  imageRendering: 'auto'
                }}
                crossOrigin="anonymous"
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 'bold', lineHeight: 1, color: '#ffffff' }}>
                    {criticScore}%
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)' }}>专业新鲜度</span>
                    {criticReviews && (
                      <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)', marginTop: '4px' }}>
                        {criticReviews.replace(/ Reviews| Ratings/g, '')} 个专业评价
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {audienceScore && audienceScore > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <img 
                src={getAudienceLogo(audienceScore)}
                alt=""
                style={{ 
                  width: '40px',
                  height: '40px',
                  objectFit: 'contain', 
                  flexShrink: 0,
                  imageRendering: 'auto'
                }}
                crossOrigin="anonymous"
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 'bold', lineHeight: 1, color: '#ffffff' }}>
                    {audienceScore}%
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)' }}>观众评分</span>
                    {audienceReviews && (
                      <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)', marginTop: '4px' }}>
                        {audienceReviews.replace(/ Reviews| Ratings/g, '')}人评分
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 渲染Metacritic卡片
  const renderMetacriticCard = (metascore?: number, userScore?: number, criticReviews?: string, userReviews?: string) => {
    if (!metascore && !userScore) return null;
    
    return (
      <div style={ratingCardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {metascore && metascore > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <img 
                src="/logos/metacritic.png"
                alt=""
                style={{ 
                  width: '40px',
                  height: '40px',
                  objectFit: 'contain', 
                  flexShrink: 0,
                  imageRendering: 'auto'
                }}
                crossOrigin="anonymous"
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 'bold', lineHeight: 1, color: '#ffffff' }}>
                    {metascore}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)' }}>专业评分</span>
                    {criticReviews && (
                      <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)', marginTop: '4px' }}>
                        {criticReviews} 个专业评价
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {userScore && userScore > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <img 
                src="/logos/metacritic_audience.png"
                alt=""
                style={{ 
                  width: '40px',
                  height: '40px',
                  objectFit: 'contain', 
                  flexShrink: 0,
                  imageRendering: 'auto'
                }}
                crossOrigin="anonymous"
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 'bold', lineHeight: 1, color: '#ffffff' }}>
                    {userScore.toFixed(1)}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)' }}>用户评分</span>
                    {userReviews && (
                      <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)', marginTop: '4px' }}>
                        {userReviews} 人评分
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ratingCards = [];

  // 豆瓣评分
  if (ratings.douban && isValidRatingData(ratings.douban.rating)) {
    ratingCards.push(
      <div key="douban" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/douban.png`,
          Number(ratings.douban.rating),
          `${formatRating.count(ratings.douban.rating_people)} 人评分`,
          true
        )}
      </div>
    );
  }

  // IMDb 评分
  if (!selectedSeason && ratings.imdb && isValidRatingData(ratings.imdb.rating)) {
    ratingCards.push(
      <div key="imdb" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/imdb.png`,
          Number(ratings.imdb.rating),
          `${formatRating.count(ratings.imdb.rating_people)} 人评分`,
          true
        )}
      </div>
    );
  }

  // Rotten Tomatoes 评分
  if (ratings.rt && (isValidRatingData(ratings.rt.tomatometer) || isValidRatingData(ratings.rt.audience_score))) {
    ratingCards.push(
      <div key="rottentomatoes" style={{ width: '100%' }}>
        {renderRottenTomatoesCard(
          formatRating.percentage(ratings.rt.tomatometer),
          formatRating.percentage(ratings.rt.audience_score),
          formatRating.count(ratings.rt.critics_count),
          formatRating.count(ratings.rt.audience_count)
        )}
      </div>
    );
  }

  // Metacritic 评分
  if (ratings.metacritic && (isValidRatingData(ratings.metacritic.metascore) || isValidRatingData(ratings.metacritic.userscore))) {
    const metascore = formatRating.number(ratings.metacritic.metascore);
    const userScore = formatRating.number(ratings.metacritic.userscore);
    
    if (metascore > 0 || userScore > 0) {
      ratingCards.push(
        <div key="metacritic" style={{ width: '100%' }}>
          {renderMetacriticCard(
            metascore > 0 ? metascore : undefined,
            userScore > 0 ? userScore : undefined,
            formatRating.count(ratings.metacritic.critics_count),
            formatRating.count(ratings.metacritic.users_count)
          )}
        </div>
      );
    }
  }

  // Letterboxd 评分(只在整体评分时显示)
  if (!selectedSeason && 
      ratingData.letterboxd && 
      isValidRatingData(ratingData.letterboxd.rating) && 
      ratingData.letterboxd.status === 'Successful') {
    ratingCards.push(
      <div key="letterboxd" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/letterboxd.png`,
          Number(ratingData.letterboxd.rating) * 2,
          `${formatRating.count(ratingData.letterboxd.rating_count)} 人评分`,
          true
        )}
      </div>
    );
  }

  // TMDB 评分
  if (ratings.tmdb && isValidRatingData(ratings.tmdb.rating)) {
    ratingCards.push(
      <div key="tmdb" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/tmdb.png`,
          Number((ratings.tmdb.rating).toFixed(1)),
          selectedSeason ? undefined : `${formatRating.count(ratings.tmdb.voteCount)} 人评分`,
          true
        )}
      </div>
    );
  }
  
  // Trakt 评分
  if (ratings.trakt && isValidRatingData(ratings.trakt.rating)) {
    ratingCards.push(
      <div key="trakt" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/trakt.png`,
          Number((ratings.trakt.rating).toFixed(1)),
          `${formatRating.count(ratings.trakt?.votes)} 人评分`,
          true
        )}
      </div>
    );
  }

  // 计算综合评分
  const overallRating = selectedSeason 
    ? calculateSeasonRating(ratingData, selectedSeason).rating || 0
    : calculateOverallRating(ratingData, 'tvshow').rating || 0;
  const validPlatformsCount = selectedSeason 
    ? calculateSeasonRating(ratingData, selectedSeason).validRatings
    : calculateOverallRating(ratingData, 'tvshow').validRatings;

  return (
    <div style={cardStyle}>
        {/* 左侧海报区域 */}
        <div style={posterContainerStyle}>
          <div style={posterGlassStyle}>
            {/* 毛玻璃磨砂纹理效果 */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: isDark
                ? `
                  radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.1) 0%, transparent 45%),
                  radial-gradient(circle at 80% 70%, rgba(30, 58, 138, 0.08) 0%, transparent 45%),
                  radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.05) 0%, transparent 50%),
                  linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, transparent 50%)
                `
                : `
                  radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.2) 0%, transparent 45%),
                  radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.15) 0%, transparent 45%),
                  radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
                  linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 50%),
                  repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(255, 255, 255, 0.02) 2px,
                    rgba(255, 255, 255, 0.02) 4px
                  ),
                  repeating-linear-gradient(
                    90deg,
                    transparent,
                    transparent 2px,
                    rgba(255, 255, 255, 0.02) 2px,
                    rgba(255, 255, 255, 0.02) 4px
                  )
                `,
              pointerEvents: 'none',
              zIndex: 0,
              opacity: isDark ? 0.6 : 0.9
            }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <div style={{ width: '100%', maxWidth: '260px', height: '390px', flexShrink: 0, borderRadius: '16px', overflow: 'hidden' }}>
                <img
                  src={currentPoster || '/fallback-poster.jpg'}
                  alt={tvShow.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '16px' }}
                  crossOrigin="anonymous"
                  loading="eager"
                />
              </div>
            </div>
            
            {/* 首页Logo - 左下角 */}
            <div style={{ 
              position: 'absolute', 
              bottom: '24px', 
              left: '24px', 
              zIndex: 100
            }}>
              <img
                src="/logos/home.png"
                alt="Home"
                style={{ 
                  display: 'block', 
                  width: '32px', 
                  height: '32px', 
                  objectFit: 'contain',
                  imageRendering: 'auto'
                }}
                crossOrigin="anonymous"
              />
            </div>
          </div>
        </div>

        {/* 右侧内容 */}
        <div style={{ flex: 1, marginLeft: '80px' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ 
              fontSize: '32px', 
              fontWeight: 'bold', 
              color: isDark ? '#ffffff' : '#111827', 
              margin: 0,
              lineHeight: 1.2
            }}>
              {tvShow.title} <span style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>({tvShow.year})</span>
              {selectedSeason && (
                <span style={{ color: isDark ? '#9ca3af' : '#6b7280' }}> - 第 {selectedSeason} 季</span>
              )}
            </h1>
            {overallRating > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={overallRatingStyle}>
                  <div style={overallRatingGradientStyle}>
                    <div style={{ fontSize: '30px', fontWeight: 'bold', color: '#ffffff' }}>
                      {overallRating.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.9)', marginTop: '4px', whiteSpace: 'nowrap' }}>
                      基于{validPlatformsCount}个平台的加权计算
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            {ratingCards}
          </div>
        </div>
    </div>
  );
}
