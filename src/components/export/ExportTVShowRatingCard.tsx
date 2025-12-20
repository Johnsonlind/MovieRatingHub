// ==========================================
// 剧集导出卡片组件
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
import { calculateSeasonRating } from '../../utils/ratings/calculateSeasonRating';
import { calculateOverallRating } from '../../utils/ratings/calculateOverallRating';
import { isValidRatingData } from '../../utils/ratingHelpers';
import { getExportStyles } from './shared/exportStyles';
import { createExportRenderers } from './shared/exportRenderers';

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
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  
  const currentPoster = selectedSeason 
    ? tvShow.seasons?.find(s => s.seasonNumber === selectedSeason)?.poster || tvShow.poster
    : tvShow.poster;

  const ratings: CurrentRatings = selectedSeason 
    ? {
        douban: (() => {
          const seasonRating = ratingData.douban?.seasons?.find(s => s.season_number === selectedSeason);
          if (seasonRating) return seasonRating;
          
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

  const styles = getExportStyles(isDark);
  const { renderRatingCard, renderRottenTomatoesCard, renderMetacriticCard } = createExportRenderers({
    ratingCardStyle: styles.ratingCardStyle
  });

  const ratingCards = [];

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

  const overallRating = selectedSeason 
    ? calculateSeasonRating(ratingData, selectedSeason).rating || 0
    : calculateOverallRating(ratingData, 'tvshow').rating || 0;
  const validPlatformsCount = selectedSeason 
    ? calculateSeasonRating(ratingData, selectedSeason).validRatings
    : calculateOverallRating(ratingData, 'tvshow').validRatings;

  return (
    <div style={styles.cardStyle}>
        {/* 左侧海报区域 */}
        <div style={styles.posterContainerStyle}>
          <div style={styles.posterGlassStyle}>
            {/* 毛玻璃磨砂纹理效果 */}
            <div style={styles.posterTextureStyle} />
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
            
            {/* 首页Logo */}
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
                <div style={styles.overallRatingStyle}>
                  <div style={styles.overallRatingGradientStyle}>
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
