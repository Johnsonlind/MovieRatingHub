import { CDN_URL } from '../config';

export function getCriticLogo(score: number | undefined) {
  if (!score) return `${CDN_URL}/logos/rottentomatoes.png`;
  
  if (score >= 70) {
    return `${CDN_URL}/logos/rottentomatoes_critics_fresh.png`;
  } else if (score >= 60) {
    return `${CDN_URL}/logos/rottentomatoes.png`;
  } else {
    return `${CDN_URL}/logos/rottentomatoes_critics_rotten.png`;
  }
}

export function getAudienceLogo(score: number | undefined) {
  if (!score) return `${CDN_URL}/logos/rottentomatoes_audience.png`;
  
  if (score >= 90) {
    return `${CDN_URL}/logos/rottentomatoes_audience_hot.png`;
  } else if (score >= 60) {
    return `${CDN_URL}/logos/rottentomatoes_audience.png`;
  } else {
    return `${CDN_URL}/logos/rottentomatoes_audience_rotten.png`;
  }
} 