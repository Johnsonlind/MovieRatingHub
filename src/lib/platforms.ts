import { Movie } from '../types/movie';

interface Platform {
  name: string;
  logo: string;
  rating: number | null;
  reviewCount?: number | null;
  url: string;
  maxRating: number;
}

export function generatePlatformUrl(platform: string, movie: Movie): string {
  const slug = movie.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  
  switch (platform) {
    case 'IMDb':
      return `https://www.imdb.com/title/${movie.imdbId}`;
    case 'Rotten Tomatoes':
      return `https://www.rottentomatoes.com/m/${slug}`;
    case 'Metacritic':
      return `https://www.metacritic.com/movie/${slug}/`;
    case 'Letterboxd':
      return `https://letterboxd.com/film/${slug}`;
    case 'Douban':
      return `https://movie.douban.com/subject/${slug}`;
    default:
      return '#';
  }
}

export function getPlatformData(movie: Movie): Platform[] {
  return [
    {
      name: 'IMDb',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg',
      rating: movie.ratings.imdb,
      url: generatePlatformUrl('IMDb', movie),
      maxRating: 10
    },
    {
      name: 'Rotten Tomatoes Critics',
      logo: 'https://www.rottentomatoes.com/assets/pizza-pie/images/rtlogo.9b892cff3fd.png',
      rating: movie.ratings.rottenTomatoesCritic,
      reviewCount: movie.reviews.rottenTomatoesCritic,
      url: generatePlatformUrl('Rotten Tomatoes', movie),
      maxRating: 100
    },
    {
      name: 'Rotten Tomatoes Audience',
      logo: 'https://www.rottentomatoes.com/assets/pizza-pie/images/rtlogo.9b892cff3fd.png',
      rating: movie.ratings.rottenTomatoesAudience,
      reviewCount: movie.reviews.rottenTomatoesAudience,
      url: generatePlatformUrl('Rotten Tomatoes', movie),
      maxRating: 5
    },
    {
      name: 'Metacritic Critics',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/2/20/Metacritic.svg',
      rating: movie.ratings.metacriticCritic,
      reviewCount: movie.reviews.metacriticCritic,
      url: generatePlatformUrl('Metacritic', movie),
      maxRating: 100
    },
    {
      name: 'Metacritic Users',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/2/20/Metacritic.svg',
      rating: movie.ratings.metacriticUser,
      reviewCount: movie.reviews.metacriticUser,
      url: generatePlatformUrl('Metacritic', movie),
      maxRating: 10
    },
    {
      name: 'Letterboxd',
      logo: 'https://a.ltrbxd.com/logos/letterboxd-mac-icon.png',
      rating: movie.ratings.letterboxd,
      url: generatePlatformUrl('Letterboxd', movie),
      maxRating: 5
    },
    {
      name: 'Douban',
      logo: 'https://img3.doubanio.com/f/movie/0a74f4379607fa731489d7f34daa545df9a2c9b8/pics/movie/logo_db.png',
      rating: movie.ratings.douban,
      url: generatePlatformUrl('Douban', movie),
      maxRating: 10
    }
  ];
}