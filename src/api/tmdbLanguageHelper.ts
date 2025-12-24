// ==========================================
// TMDB API 多语言辅助工具
// ==========================================
const LANGUAGE_PRIORITY = ['zh-CN', 'zh-SG', 'zh-TW', 'zh-HK', 'en-US'] as const;

type LanguageCode = typeof LANGUAGE_PRIORITY[number];

function isEmpty(value: any): boolean {
  return value === null || value === undefined || value === '';
}

function isStringEmpty(value: any): boolean {
  if (typeof value !== 'string') return isEmpty(value);
  return value.trim() === '';
}

function isArrayEmpty(value: any): boolean {
  return !Array.isArray(value) || value.length === 0;
}

function getFieldValue<T>(
  field: string,
  dataList: Array<{ data: any; lang: LanguageCode }>,
  checkEmpty: (value: any) => boolean = isStringEmpty
): T | undefined {
  for (const { data } of dataList) {
    const value = getNestedValue(data, field);
    if (!checkEmpty(value)) {
      return value as T;
    }
  }
  return undefined;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export function mergeMultiLanguageData(dataList: Array<{ data: any; lang: LanguageCode }>): any {
  if (dataList.length === 0) return null;
  
  const baseData = dataList[0].data;
  const merged = { ...baseData };
  
  const keyFields = [
    'title',
    'name',
    'original_title',
    'original_name',
    'overview',
    'tagline',
  ];
  
  for (const field of keyFields) {
    if (isStringEmpty(merged[field])) {
      const value = getFieldValue(field, dataList);
      if (value !== undefined) {
        merged[field] = value;
      }
    }
  }
  
  if (isArrayEmpty(merged.genres)) {
    const genres = getFieldValue('genres', dataList, isArrayEmpty);
    if (genres) {
      merged.genres = genres;
    }
  }
  
  if (merged.seasons && Array.isArray(merged.seasons)) {
    merged.seasons = merged.seasons.map((season: any, index: number) => {
      const seasonMerged = { ...season };
      
      if (isStringEmpty(seasonMerged.name)) {
        for (const { data } of dataList) {
          if (data.seasons?.[index]?.name && !isStringEmpty(data.seasons[index].name)) {
            seasonMerged.name = data.seasons[index].name;
            break;
          }
        }
      }
      
      if (isStringEmpty(seasonMerged.overview)) {
        for (const { data } of dataList) {
          if (data.seasons?.[index]?.overview && !isStringEmpty(data.seasons[index].overview)) {
            seasonMerged.overview = data.seasons[index].overview;
            break;
          }
        }
      }
      
      return seasonMerged;
    });
  }
  
  return merged;
}

export async function fetchTMDBWithLanguageFallback(
  url: string,
  baseParams: Record<string, any> = {},
  appendToResponse?: string
): Promise<any> {
  const requests = LANGUAGE_PRIORITY.map(async (lang) => {
    try {
      const params = new URLSearchParams({
        ...baseParams,
        language: lang,
      });
      
      if (appendToResponse) {
        params.append('append_to_response', appendToResponse);
      }
      
      const response = await fetch(`${url}?${params.toString()}`);
      
      if (!response.ok) {
        return { lang, data: null, error: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      
      if (data.status_code && data.status_code !== 1) {
        return { lang, data: null, error: data.status_message || 'Unknown error' };
      }
      
      return { lang, data, error: null };
    } catch (error) {
      return { lang, data: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  
  const results = await Promise.all(requests);
  
  const dataList: Array<{ data: any; lang: LanguageCode }> = [];
  const errors: Array<{ lang: LanguageCode; error: any }> = [];
  
  for (const result of results) {
    if (result.data) {
      dataList.push({ data: result.data, lang: result.lang });
    } else {
      errors.push({ lang: result.lang, error: result.error });
    }
  }
  
  if (dataList.length === 0) {
    throw new Error(`所有语言版本获取失败: ${errors.map(e => `${e.lang}: ${e.error}`).join(', ')}`);
  }
  
  return mergeMultiLanguageData(dataList);
}

export function getLanguagePriority(): readonly LanguageCode[] {
  return LANGUAGE_PRIORITY;
}

export function getPrimaryLanguage(): LanguageCode {
  return LANGUAGE_PRIORITY[0];
}
