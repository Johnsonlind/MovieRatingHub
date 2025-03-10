// ==========================================
// TMDB API 客户端
// ==========================================
import axios from 'axios';

export const tmdbClient = axios.create({
  baseURL: '/api/tmdb-proxy',
});

tmdbClient.interceptors.request.use((config) => {
  if (config.params && config.params.api_key) {
    delete config.params.api_key;
  }
  return config;
});

// 解析搜索查询,提取年份和语言
export function parseSearchQuery(query: string): {
  searchTerm: string;
  year?: number;
  language?: string;
} {
  const yearMatch = query.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
  
  // 移除年份
  let searchTerm = query.replace(/\b(19|20)\d{2}\b/, '').trim();
  
  // 检测语言
  let language = undefined;
  if (/[\u4e00-\u9fa5]/.test(searchTerm)) {
    language = 'zh-CN';
  } else if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(searchTerm)) {
    language = 'ja-JP';
  } else if (/[\uac00-\ud7af]/.test(searchTerm)) {
    language = 'ko-KR';
  }
  
  return { searchTerm, year, language };
}