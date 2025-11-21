// ==========================================
// TMDB多语言辅助工具 - 按优先级获取和合并多语言数据
// ==========================================

// 语言优先级列表
const LANGUAGE_PRIORITY = ['zh-CN', 'zh-SG', 'zh-TW', 'zh-HK', 'en-US'] as const;

type LanguageCode = typeof LANGUAGE_PRIORITY[number];

/**
 * 检查字段是否为空（null, undefined, 空字符串）
 */
function isEmpty(value: any): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * 检查字符串字段是否为空或只有空格
 */
function isStringEmpty(value: any): boolean {
  if (typeof value !== 'string') return isEmpty(value);
  return value.trim() === '';
}

/**
 * 检查数组是否为空
 */
function isArrayEmpty(value: any): boolean {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * 获取字段值，如果为空则从下一个语言数据中获取
 */
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

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 合并多语言数据，优先使用高优先级语言的字段
 */
export function mergeMultiLanguageData(dataList: Array<{ data: any; lang: LanguageCode }>): any {
  if (dataList.length === 0) return null;
  
  // 使用第一个（最高优先级）的数据作为基础
  const baseData = dataList[0].data;
  const merged = { ...baseData };
  
  // 需要检查的关键字段
  const keyFields = [
    'title',           // 电影标题
    'name',            // 电视剧名称
    'original_title',  // 电影原始标题
    'original_name',   // 电视剧原始名称
    'overview',        // 简介
    'tagline',         // 标语
  ];
  
  // 对于每个字段，如果基础数据中的字段为空，则从后续语言中获取
  for (const field of keyFields) {
    if (isStringEmpty(merged[field])) {
      const value = getFieldValue(field, dataList);
      if (value !== undefined) {
        merged[field] = value;
      }
    }
  }
  
  // 处理 genres（类型）
  if (isArrayEmpty(merged.genres)) {
    const genres = getFieldValue('genres', dataList, isArrayEmpty);
    if (genres) {
      merged.genres = genres;
    }
  }
  
  // 处理 seasons（电视剧季度）
  if (merged.seasons && Array.isArray(merged.seasons)) {
    // 对于每个季度，检查名称和概述是否为空
    merged.seasons = merged.seasons.map((season: any, index: number) => {
      const seasonMerged = { ...season };
      
      // 检查季度名称
      if (isStringEmpty(seasonMerged.name)) {
        for (const { data } of dataList) {
          if (data.seasons?.[index]?.name && !isStringEmpty(data.seasons[index].name)) {
            seasonMerged.name = data.seasons[index].name;
            break;
          }
        }
      }
      
      // 检查季度概述
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

/**
 * 按优先级顺序获取TMDB数据
 * 如果某个语言的关键字段为空，会自动使用下一个语言的对应字段填充
 */
export async function fetchTMDBWithLanguageFallback(
  url: string,
  baseParams: Record<string, any> = {},
  appendToResponse?: string
): Promise<any> {
  // 并行请求所有语言版本以提高效率
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
      
      // 检查是否有错误
      if (data.status_code && data.status_code !== 1) {
        return { lang, data: null, error: data.status_message || 'Unknown error' };
      }
      
      return { lang, data, error: null };
    } catch (error) {
      return { lang, data: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  
  const results = await Promise.all(requests);
  
  // 按优先级顺序整理数据
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
  
  // 合并数据
  return mergeMultiLanguageData(dataList);
}

/**
 * 获取语言优先级列表（用于API调用）
 */
export function getLanguagePriority(): readonly LanguageCode[] {
  return LANGUAGE_PRIORITY;
}

/**
 * 获取主要语言（最高优先级）
 */
export function getPrimaryLanguage(): LanguageCode {
  return LANGUAGE_PRIORITY[0];
}
