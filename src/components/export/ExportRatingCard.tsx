// ==========================================
// 电影导出卡片组件
// ==========================================
import { formatRating } from '../../utils/formatRating';
import type { RatingData } from '../../types/ratings';
import { calculateOverallRating } from '../../utils/ratings/calculateOverallRating';
import { isValidRatingData } from '../../utils/ratingHelpers';
import { getExportStyles } from './shared/exportStyles';
import { createExportRenderers } from './shared/exportRenderers';

interface ExportRatingCardProps {
  media: {
    title: string;
    year: string;
    poster: string;
  };
  ratingData: RatingData;
  selectedSeason?: number;
}

export function ExportRatingCard({ media, ratingData, selectedSeason }: ExportRatingCardProps) {
  if (!media || !ratingData) {
    return null;
  }

  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  
  const { rating: overallRating, validRatings: validPlatformsCount } = calculateOverallRating(ratingData);

  const styles = getExportStyles(isDark);
  const { renderRatingCard, renderRottenTomatoesCard, renderMetacriticCard } = createExportRenderers({
    ratingCardStyle: styles.ratingCardStyle
  });

  const ratingCards = [];

  if (ratingData.douban && isValidRatingData(ratingData.douban.rating)) {
    ratingCards.push(
      <div key="douban" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/douban.png`,
          Number(ratingData.douban.rating),
          `${formatRating.count(ratingData.douban.rating_people)} 人评分`,
          true
        )}
      </div>
    );
  }

  if (ratingData.imdb && isValidRatingData(ratingData.imdb.rating)) {
    ratingCards.push(
      <div key="imdb" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/imdb.png`,
          Number(ratingData.imdb.rating),
          `${formatRating.count(ratingData.imdb.rating_people)} 人评分`,
          true
        )}
      </div>
    );
  }

  if (ratingData.rottentomatoes?.series && isValidRatingData(ratingData.rottentomatoes.series.tomatometer)) {
    const rtData = ratingData.rottentomatoes.series;
    ratingCards.push(
      <div key="rottentomatoes" style={{ width: '100%' }}>
        {renderRottenTomatoesCard(
          formatRating.percentage(rtData.tomatometer),
          formatRating.percentage(rtData.audience_score),
          formatRating.count(rtData.critics_count),
          formatRating.count(rtData.audience_count)
        )}
      </div>
    );
  }

  if (ratingData.metacritic?.overall && isValidRatingData(ratingData.metacritic.overall.metascore)) {
    const mcData = ratingData.metacritic.overall;
    ratingCards.push(
      <div key="metacritic" style={{ width: '100%' }}>
        {renderMetacriticCard(
          formatRating.number(mcData.metascore),
          formatRating.number(mcData.userscore),
          formatRating.count(mcData.critics_count),
          formatRating.count(mcData.users_count)
        )}
      </div>
    );
  }

  if (!selectedSeason && ratingData.letterboxd && isValidRatingData(ratingData.letterboxd.rating)) {
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

  if (ratingData.tmdb && isValidRatingData(ratingData.tmdb.rating)) {
    ratingCards.push(
      <div key="tmdb" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/tmdb.png`,
          Number((ratingData.tmdb.rating).toFixed(1)),
          `${formatRating.count(ratingData.tmdb.voteCount)} 人评分`,
          true
        )}
      </div>
    );
  }

  if (!selectedSeason && ratingData.trakt && isValidRatingData(ratingData.trakt.rating)) {
    ratingCards.push(
      <div key="trakt" style={{ width: '100%' }}>
        {renderRatingCard(
          `/logos/trakt.png`,
          Number((ratingData.trakt.rating).toFixed(1)),
          `${formatRating.count(ratingData.trakt.votes)} 人评分`,
          true
        )}
      </div>
    );
  }

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
                  src={media.poster || '/fallback-poster.jpg'}
                  alt={media.title}
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
              {media.title} <span style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>({media.year})</span>
            </h1>
            {overallRating && (
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
