# ==========================================
# 评分获取模块
# ==========================================
import os
import re
import json
import random
import asyncio
import traceback
from fuzzywuzzy import fuzz
import copy
import aiohttp
from urllib.parse import quote
from dataclasses import dataclass
from fastapi import Request
import unicodedata
from datetime import datetime
from browser_pool import browser_pool
from anthology_handler import anthology_handler

# 日志美化工具
class LogFormatter:
    """结构化日志输出"""
    COLORS = {
        'RESET': '\033[0m',
        'BOLD': '\033[1m',
        'GREEN': '\033[92m',
        'YELLOW': '\033[93m',
        'RED': '\033[91m',
        'BLUE': '\033[94m',
        'CYAN': '\033[96m',
    }
    
    @staticmethod
    def platform(platform_name: str) -> str:
        """平台名称"""
        return f"{LogFormatter.COLORS['CYAN']}[{platform_name}]{LogFormatter.COLORS['RESET']}"
    
    @staticmethod
    def success(msg: str) -> str:
        """成功信息"""
        return f"{LogFormatter.COLORS['GREEN']}✓ {msg}{LogFormatter.COLORS['RESET']}"
    
    @staticmethod
    def error(msg: str) -> str:
        """错误信息"""
        return f"{LogFormatter.COLORS['RED']}✗ {msg}{LogFormatter.COLORS['RESET']}"
    
    @staticmethod
    def warning(msg: str) -> str:
        """警告信息"""
        return f"{LogFormatter.COLORS['YELLOW']}⚠ {msg}{LogFormatter.COLORS['RESET']}"
    
    @staticmethod
    def info(msg: str) -> str:
        """一般信息"""
        return f"{LogFormatter.COLORS['BLUE']}→ {msg}{LogFormatter.COLORS['RESET']}"
    
    @staticmethod
    def section(title: str) -> str:
        """章节标题"""
        line = "=" * 60
        return f"\n{LogFormatter.COLORS['BOLD']}{line}\n  {title}\n{line}{LogFormatter.COLORS['RESET']}"
    
    @staticmethod
    def performance(platform: str, elapsed: float, status: str = "success") -> str:
        """性能指标"""
        status_icon = "✓" if status == "success" else "✗"
        color = LogFormatter.COLORS['GREEN'] if status == "success" else LogFormatter.COLORS['RED']
        return f"{color}{status_icon} {platform}: {elapsed:.2f}秒{LogFormatter.COLORS['RESET']}"

log = LogFormatter()

# TMDB API 配置
TMDB_API_BASE_URL = "https://api.themoviedb.org/3/"
TMDB_BEARER_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0ZjY4MWZhN2I1YWI3MzQ2YTRlMTg0YmJmMmQ0MTcxNSIsIm5iZiI6MTUyNjE3NDY5MC4wMjksInN1YiI6IjVhZjc5M2UyOTI1MTQxMmM4MDAwNGE5ZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.maKS7ZH7y6l_H0_dYcXn5QOZHuiYdK_SsiQ5AAk32cI"

# 创建全局 httpx 客户端用于 TMDB API（复用连接，提高性能）
import httpx
_tmdb_http_client = None

def get_tmdb_http_client():
    """获取或创建 TMDB API 客户端（连接池，HTTP/2）"""
    global _tmdb_http_client
    if _tmdb_http_client is None or _tmdb_http_client.is_closed:
        _tmdb_http_client = httpx.AsyncClient(
            http2=True,
            timeout=httpx.Timeout(10.0),
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
                keepalive_expiry=30.0
            ),
            headers={
                "accept": "application/json",
                "accept-encoding": "gzip, deflate",
                "Authorization": f"Bearer {TMDB_BEARER_TOKEN}"
            }
        )
    return _tmdb_http_client

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/89.0.2 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/89.0.2 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/91.0.864.67 Safari/537.36"
]

RATING_STATUS = {
    "NO_FOUND": "No Found",
    "FETCH_FAILED": "Fail",
    "NO_RATING": "No Rating",
    "RATE_LIMIT": "RateLimit",
    "TIMEOUT": "Timeout",
    "SUCCESSFUL": "Successful"
}

def create_rating_data(status, reason=None):
    """创建统一的评分数据结构"""
    base_data = {
        "status": status,
        "status_reason": reason,
        "rating": "暂无" if status != RATING_STATUS["SUCCESSFUL"] else None,
        "rating_people": "暂无" if status != RATING_STATUS["SUCCESSFUL"] else None
    }
    return base_data

class RequestCancelledException(Exception):
    pass

async def random_delay():
    delay = random.uniform(0.2, 0.5)
    await asyncio.sleep(delay)

def chinese_to_arabic(chinese_num):
    """将中文数字转换为阿拉伯数字"""
    chinese_to_arabic_map = {
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, 
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, 
        '十': 10, '百': 100
    }
    
    if not chinese_num:
        return None
        
    if chinese_num.startswith('十') and len(chinese_num) == 2:
        return 10 + chinese_to_arabic_map.get(chinese_num[1], 0)
    
    if chinese_num == '十':
        return 10
        
    result = 0
    unit = 1
    last_num = 0
    
    for char in reversed(chinese_num):
        if char in ['十', '百']:
            unit = chinese_to_arabic_map[char]
            if last_num == 0:
                last_num = 1
            result += last_num * unit
            last_num = 0
            unit = 1
        elif char in chinese_to_arabic_map:
            last_num = chinese_to_arabic_map[char]
            result += last_num * unit
        else:
            return None
            
    return result

def construct_search_url(title, media_type, platform, tmdb_info):
    """根据影视类型构造各平台搜索URL"""
    encoded_title = quote(title)
    if platform in ("metacritic", "rottentomatoes"):
        search_title = tmdb_info.get("en_title") or title
        simplified_title = ''.join(
            c for c in unicodedata.normalize('NFD', search_title)
            if unicodedata.category(c) != 'Mn'
        )
        encoded_title = quote(simplified_title)

    tmdb_id = tmdb_info.get("tmdb_id")
    year = tmdb_info.get("year")
    imdb_id = tmdb_info.get("imdb_id")

    search_urls = {
        "douban": {
            "movie": f"https://search.douban.com/movie/subject_search?search_text={encoded_title}",
            "tv": f"https://search.douban.com/movie/subject_search?search_text={encoded_title}"
        },
        "imdb": {
            "movie": f"https://www.imdb.com/find/?q={encoded_title}&s=tt&ttype=ft&ref_=fn_mv",
            "tv": f"https://www.imdb.com/find/?q={encoded_title}&s=tt&ttype=tv&ref_=fn_tv"
        },
        "letterboxd": {
            "movie": _get_letterboxd_search_urls(tmdb_id, year, imdb_id),
            "tv": _get_letterboxd_search_urls(tmdb_id, year, imdb_id)
        },
        "rottentomatoes": {
            "movie": f"https://www.rottentomatoes.com/search?search={encoded_title}",
            "tv": f"https://www.rottentomatoes.com/search?search={encoded_title}"
        },
        "metacritic": {
            "movie": f"https://www.metacritic.com/search/{encoded_title}/?page=1&category=2",
            "tv": f"https://www.metacritic.com/search/{encoded_title}/?page=1&category=1"
        }
    }
    result = search_urls[platform][media_type] if platform in search_urls and media_type in search_urls[platform] else ""
    return result

def _get_letterboxd_search_urls(tmdb_id, year, imdb_id):
    """为Letterboxd生成多种搜索URL：tmdb+year、imdbid、tmdb"""
    urls = []
    if tmdb_id and year:
        urls.append(f"https://letterboxd.com/search/tmdb:{tmdb_id} year:{year}/")
    if imdb_id:
        urls.append(f"https://letterboxd.com/search/imdb:{imdb_id}/")
    if tmdb_id:
        urls.append(f"https://letterboxd.com/search/tmdb:{tmdb_id}/")
    return urls if urls else [""]
        
def _is_empty(value):
    """检查值是否为空"""
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, list):
        return len(value) == 0
    return False

def _get_field_value(data_list, field_path, check_empty=_is_empty):
    """从多语言数据列表中按优先级获取字段值"""
    for data, lang in data_list:
        value = data
        for key in field_path.split('.'):
            if isinstance(value, dict):
                value = value.get(key)
            else:
                value = None
                break
        
        if not check_empty(value):
            return value
    return None

def _merge_multi_language_data(data_list):
    """合并多语言数据，优先使用高优先级语言的字段"""
    if not data_list:
        return None
    
    base_data, _ = data_list[0]
    merged = copy.deepcopy(base_data)
    
    key_fields = [
        'title',
        'name',
        'original_title',
        'original_name',
        'overview',
        'tagline',
    ]
    
    for field in key_fields:
        if _is_empty(merged.get(field)):
            value = _get_field_value(data_list, field)
            if value is not None:
                merged[field] = value
    
    if _is_empty(merged.get('genres')):
        genres = _get_field_value(data_list, 'genres', lambda x: not isinstance(x, list) or len(x) == 0)
        if genres:
            merged['genres'] = genres
    
    if 'seasons' in merged and isinstance(merged['seasons'], list):
        for i, season in enumerate(merged['seasons']):
            if _is_empty(season.get('name')):
                for data, _ in data_list:
                    if data.get('seasons') and i < len(data['seasons']):
                        season_name = data['seasons'][i].get('name')
                        if not _is_empty(season_name):
                            merged['seasons'][i]['name'] = season_name
                            break
            
            if _is_empty(season.get('overview')):
                for data, _ in data_list:
                    if data.get('seasons') and i < len(data['seasons']):
                        season_overview = data['seasons'][i].get('overview')
                        if not _is_empty(season_overview):
                            merged['seasons'][i]['overview'] = season_overview
                            break
    
    return merged

async def _fetch_tmdb_with_language_fallback(client, endpoint, append_to_response=None):
    """按优先级顺序获取TMDB数据，如果某个语言的关键字段为空，会自动使用下一个语言的对应字段填充"""
    language_priority = ['zh-CN', 'zh-SG', 'zh-TW', 'zh-HK', 'en-US']
    
    async def fetch_language(lang):
        try:
            params = {"language": lang}
            if append_to_response:
                params["append_to_response"] = append_to_response
            
            response = await client.get(endpoint, params=params)
            
            if response.status_code != 200:
                return (lang, None, f"HTTP {response.status_code}")
            
            data = response.json()
            
            if data.get("status_code") and data.get("status_code") != 1:
                return (lang, None, data.get("status_message", "Unknown error"))
            
            return (lang, data, None)
        except Exception as e:
            return (lang, None, str(e))
    
    results = await asyncio.gather(*[fetch_language(lang) for lang in language_priority], return_exceptions=True)
    
    data_list = []
    errors = []
    
    for result in results:
        if isinstance(result, Exception):
            continue
        
        lang, data, error = result
        if data:
            data_list.append((data, lang))
        else:
            errors.append((lang, error))
    
    if not data_list:
        raise Exception(f"所有语言版本获取失败: {', '.join([f'{lang}: {error}' for lang, error in errors])}")
    
    return _merge_multi_language_data(data_list)

async def get_tmdb_info(tmdb_id, media_type, request=None):
    """通过TMDB API获取影视基本信息，支持多语言优先级回退"""
    try:
        if request and await request.is_disconnected():
            return None
        
        client = get_tmdb_http_client()
        endpoint = f"{TMDB_API_BASE_URL}{media_type}/{tmdb_id}"
        
        try:
            merged_data = await _fetch_tmdb_with_language_fallback(
                client, 
                endpoint, 
                append_to_response="credits,external_ids"
            )
        except httpx.TimeoutException:
            print("TMDB API 请求超时")
            return None
        except Exception as e:
            print(f"TMDB API 请求失败: {e}")
            return None

        if not merged_data:
            if not request or not (await request.is_disconnected()):
                print("API返回的数据为空")
            return None
            
        if request and await request.is_disconnected():
            return None
        
        en_title = ""
        try:
            en_params = {"language": "en-US"}
            if "credits" in merged_data or "external_ids" in merged_data:
                en_params["append_to_response"] = "credits,external_ids"
            en_response = await client.get(endpoint, params=en_params)
            if en_response.status_code == 200:
                en_data = en_response.json()
                if media_type == "movie":
                    en_title = en_data.get("title", "")
                else:
                    en_title = en_data.get("name", "")
        except Exception as e:
            print(f"获取英文标题失败: {e}")
        
        if media_type == "movie":
            title = merged_data.get("title", "")
            original_title = merged_data.get("original_title", "")
            zh_title = merged_data.get("title", "")
            year = merged_data.get("release_date", "")[:4] if merged_data.get("release_date") else ""
        else:
            title = merged_data.get("name", "")
            original_title = merged_data.get("original_name", "")
            zh_title = merged_data.get("name", "")
            year = merged_data.get("first_air_date", "")[:4] if merged_data.get("first_air_date") else ""
        
        director = ""
        if "credits" in merged_data and merged_data["credits"]:
            crew = merged_data["credits"].get("crew", [])
            directors = [c["name"] for c in crew if c.get("job") == "Director"]
            director = ", ".join(directors)
        
        result = {
            "type": media_type,
            "title": title,
            "original_title": original_title,
            "en_title": en_title,
            "zh_title": zh_title,
            "year": year,
            "director": director,
            "tmdb_id": str(tmdb_id),
            "imdb_id": merged_data.get("imdb_id") or merged_data.get("external_ids", {}).get("imdb_id", "")
        }
        
        if media_type == "tv":
            result.update({
                "first_air_date": merged_data.get("first_air_date", ""),
                "number_of_seasons": merged_data.get("number_of_seasons", 0),
                "last_air_date": merged_data.get("last_air_date", ""),
                "seasons": [{
                    "season_number": s.get("season_number"),
                    "name": s.get("name", f"Season {s.get('season_number')}"),
                    "air_date": s.get("air_date", "")[:4] if s.get("air_date") else "",
                    "episode_count": s.get("episode_count", 0)
                } for s in merged_data.get("seasons", [])]
            })
            
            is_anthology = anthology_handler.is_anthology_series(result)
            result["is_anthology"] = is_anthology
            
            if is_anthology:
                print(f"\n=== 检测到可能的选集剧: {title} ===")
                
                series_info = anthology_handler.extract_main_series_info(result)
                
                tmdb_id = result.get("tmdb_id")
                if tmdb_id:
                    print("尝试从第一集获取主系列信息...")
                    main_series_info = await anthology_handler.get_main_series_info_from_first_episode(
                        tmdb_id, 
                        season_number=1, 
                        episode_number=1
                    )
                    
                    if main_series_info:
                        if not series_info:
                            series_info = {}
                        
                        main_series_imdb_id = main_series_info.get("main_series_imdb_id")
                        main_series_title = main_series_info.get("main_series_title")
                        main_series_year = main_series_info.get("main_series_year")
                        
                        if main_series_imdb_id:
                            result["imdb_id"] = main_series_imdb_id
                            series_info["main_series_imdb_id"] = main_series_imdb_id
                            print(f"✓ 获取到主系列IMDB ID: {main_series_imdb_id}")
                        
                        if main_series_title:
                            series_info["main_title"] = main_series_title
                            series_info["main_series_title"] = main_series_title
                            print(f"✓ 获取到主系列标题: {main_series_title}")
                        
                        if main_series_year:
                            series_info["main_series_year"] = main_series_year
                            print(f"✓ 获取到主系列年份: {main_series_year}")
                        
                        series_info["source"] = "first_episode_imdb"
                        series_info["detected"] = True
                    else:
                        print("⚠ 无法从第一集获取主系列信息，使用标题提取方式")
                
                if not series_info:
                    series_info = anthology_handler.extract_main_series_info(result)
                
                if series_info:
                    result["series_info"] = series_info
                    print(f"提取主系列: {series_info.get('main_title')}")
                
                if not result["imdb_id"]:
                    print("IMDB ID为空，尝试从多个来源获取...")
                    enhanced_imdb_id = await anthology_handler.get_imdb_id_from_multiple_sources(
                        result, 
                        series_info
                    )
                    if enhanced_imdb_id:
                        result["imdb_id"] = enhanced_imdb_id
                        print(f"增强获取到IMDB ID: {enhanced_imdb_id}")
                
                search_variants = anthology_handler.generate_search_variants(
                    result,
                    series_info
                )
                result["search_variants"] = search_variants
                
                print("==================\n")
            else:
                result["search_variants"] = anthology_handler.generate_search_variants(result, None)
        
        if not request or not (await request.is_disconnected()):
            print("\n=== TMDB 返回信息 ===")
            print(json.dumps(result, ensure_ascii=False, indent=2))
            print("==================\n")
        
        return result
        
    except Exception as e:
        if not request or not (await request.is_disconnected()):
            print(f"获取TMDB信息时出错: {e}")
            import traceback
            print(f"详细错误信息:\n{traceback.format_exc()}")
        return None

def extract_year(year_str):
    """从字符串中提取4位年份，如果无法提取则返回None"""
    if not year_str:
        return None
    
    year_str = str(year_str)
    
    range_match = re.search(r'(\d{4})\s*[–-]\s*(\d{4})?', year_str)
    if range_match:
        return int(range_match.group(1))
    
    match = re.search(r'\b(19\d{2}|20\d{2})\b', year_str)
    if match:
        return int(match.group(1))
    
    return None

async def calculate_match_degree(tmdb_info, result, platform=""):
    """计算搜索结果与TMDB信息的匹配度"""
    import traceback as tb
    try:
        if "match_score" in result:
            return result["match_score"]      
          
        score = 0
        
        if tmdb_info.get("is_anthology"):
            search_variant_used = result.get("search_variant_used")
            if not search_variant_used:
                search_variants = tmdb_info.get("search_variants", [])
                search_variant_used = search_variants[0] if search_variants else {}
            
            if search_variant_used.get("strategy") == "anthology_series":
                result_title = result.get("title", "").lower()
                search_title = search_variant_used.get("title", "").lower()
                
                cleaned_result_title = re.sub(r'\s*\([^)]*\)\s*', '', result_title).strip()
                cleaned_search_title = search_title.strip()
                
                is_exact_match = (cleaned_result_title == cleaned_search_title)
                is_contained = (cleaned_search_title in cleaned_result_title.split() or 
                               cleaned_result_title.startswith(cleaned_search_title + " ") or
                               cleaned_result_title == cleaned_search_title)
                
                print(f"  搜索标题: '{cleaned_search_title}'")
                
                if is_exact_match:
                    score = 70
                elif is_contained:
                    score = 65
                else:
                    fuzzy_score = fuzz.ratio(search_title, result_title)
                    if fuzzy_score >= 95:
                        score = 60
                    else:
                        score = 0
                        return 0
                
                result_year_text = result.get("year", "")
                tmdb_year = tmdb_info.get("year", "")
                search_year = search_variant_used.get("year", "")
                
                # 对于选集剧，使用主系列的年份进行匹配
                if platform in ("rottentomatoes", "metacritic"):
                    series_info = tmdb_info.get("series_info", {})
                    main_series_year = series_info.get("main_series_year")
                    if main_series_year:
                        tmdb_year = main_series_year
                
                result_year_int = extract_year(result_year_text)
                tmdb_year_int = extract_year(tmdb_year)
                
                if result_year_int and tmdb_year_int:
                    if "–" in result_year_text or "-" in result_year_text:
                        end_year_match = re.search(r'[–-]\s*(\d{4})', result_year_text)
                        if end_year_match:
                            end_year = int(end_year_match.group(1))
                            if result_year_int <= tmdb_year_int <= end_year:
                                score += 25
                        else:
                            if result_year_int <= tmdb_year_int:
                                score += 30
                    else:
                        year_diff = abs(result_year_int - tmdb_year_int)
                        
                        if year_diff == 0:
                            score += 20
                        elif year_diff <= 3:
                            score += 15
                        elif result_year_int < tmdb_year_int and year_diff <= 5:
                            score += 10
                        elif result_year_int < tmdb_year_int and year_diff <= 10:
                            score += 5

                elif not result_year_int:
                    pass
                
                subtitle_hint = search_variant_used.get("subtitle_hint", "")
                if subtitle_hint:
                    subtitle_lower = subtitle_hint.lower()
                    if subtitle_lower in result_title:
                        score += 40
                    else:
                        subtitle_match = fuzz.partial_ratio(subtitle_lower, result_title)
                        if subtitle_match > 70:
                            score += subtitle_match * 0.3
                
                if platform == "imdb":
                    if "–" in result_year_text or "-" in result_year_text:
                        if result_year_int and tmdb_year_int:
                            if result_year_int <= tmdb_year_int:
                                score += 15
                
                print(f"{platform}[选集剧匹配]最终得分: {score}")
                return score
        
        if platform == "douban":
            result_title = result.get("title", "").lower()
            parts = result_title.split('(')[0].strip()
            title_parts = parts.split(' ')
            
            tmdb_titles = [
                tmdb_info.get("title", "").lower(),
                tmdb_info.get("original_title", "").lower(),
                tmdb_info.get("zh_title", "").lower()
            ]
            
            title_scores = []
            
            for tmdb_title in tmdb_titles:
                if tmdb_title:
                    whole_score = fuzz.ratio(tmdb_title, result_title)
                    title_scores.append(whole_score)
                    
                    partial_score = fuzz.partial_ratio(tmdb_title, result_title)
                    title_scores.append(partial_score)
            
            for tmdb_title in tmdb_titles:
                if tmdb_title:
                    for part in title_parts:
                        if part and len(part) > 1:
                            part_score = fuzz.ratio(tmdb_title, part)
                            title_scores.append(part_score)
            
            if title_scores:
                max_title_score = max(title_scores)
                score = max_title_score * 0.6
            
            if tmdb_info.get("type") == "tv":
                total_seasons = len([s for s in tmdb_info.get("seasons", []) if s.get("season_number", 0) > 0])
                is_single_season = total_seasons == 1
                
                result_season_number = None
                
                if is_single_season:
                    has_season_marker = (
                        re.search(r'第[一二三四五六七八九十百]+季', result.get("title", "")) or
                        re.search(r'season\s*\d+', result.get("title", "").lower())
                    )
                    
                    if not has_season_marker:
                        result_season_number = 1
                
                if result_season_number is None:
                    season_match = re.search(r'第([一二三四五六七八九十百]+)季', result.get("title", ""))
                    if season_match:
                        chinese_season_number = season_match.group(1)
                        result_season_number = chinese_to_arabic(chinese_season_number)
                    else:
                        season_match = re.search(r'season\s*(\d+)', result.get("title", "").lower())
                        if season_match:
                            result_season_number = int(season_match.group(1))
                
                if result_season_number is not None:
                    for season in tmdb_info.get("seasons", []):
                        if season.get("season_number") == result_season_number:
                            if total_seasons > 1:
                                score += 50
                            else:
                                score += 30
                            break
            
            try:
                if tmdb_info.get("type") == "movie":
                    tmdb_year = str(tmdb_info.get("year", ""))
                    result_year = str(result.get("year", ""))
                    
                    if tmdb_year and result_year:
                        tmdb_year_int = extract_year(tmdb_year)
                        result_year_int = extract_year(result_year)
                        
                        if tmdb_year_int and result_year_int:
                            year_diff = abs(tmdb_year_int - result_year_int)
                            
                            if year_diff == 0:
                                score += 30
                            elif year_diff == 1:
                                score += 15
                            elif year_diff == 2:
                                score += 5
                            elif year_diff > 2:
                                return 0
                        else:
                            print(f"年份无法提取: TMDB={tmdb_year}, 结果={result_year}")
                else: 
                    total_seasons = len([s for s in tmdb_info.get("seasons", []) if s.get("season_number", 0) > 0])
                    is_single_season = total_seasons == 1
                    
                    result_year = str(result.get("year", ""))
                    
                    result_season_number = None
                    season_match = re.search(r'第([一二三四五六七八九十百]+)季', result.get("title", ""))
                    if season_match:
                        chinese_season_number = season_match.group(1)
                        result_season_number = chinese_to_arabic(chinese_season_number)
                    else:
                        season_match = re.search(r'season\s*(\d+)', result.get("title", "").lower())
                        if season_match:
                            result_season_number = int(season_match.group(1))
                    
                    if is_single_season and not result_season_number:
                        result_season_number = 1
                    
                    if result_season_number is not None:
                        season_air_date = None
                        for season in tmdb_info.get("seasons", []):
                            if season.get("season_number") == result_season_number:
                                season_air_date = season.get("air_date", "")[:4]
                                break
                        
                        if season_air_date and result_year:
                            season_year_int = extract_year(season_air_date)
                            result_year_int = extract_year(result_year)
                            
                            if season_year_int and result_year_int:
                                year_diff = abs(season_year_int - result_year_int)
                                
                                if year_diff == 0:
                                    score += 20
                                elif year_diff == 1:
                                    score += 10
                                elif year_diff == 2:
                                    score += 5
                                elif year_diff > 2:
                                    return 0
                    else:
                        if is_single_season:
                            for season in tmdb_info.get("seasons", []):
                                if season.get("season_number") == 1:
                                    season_air_date = season.get("air_date", "")[:4]
                                    if season_air_date and result_year:
                                        season_year_int = extract_year(season_air_date)
                                        result_year_int = extract_year(result_year)
                                        
                                        if season_year_int and result_year_int:
                                            year_diff = abs(season_year_int - result_year_int)
                                            
                                            if year_diff == 0:
                                                score += 20
                                            elif year_diff == 1:
                                                score += 10
                                            elif year_diff == 2:
                                                score += 5
                                            elif year_diff > 2:
                                                return 0
                                    break

            except (ValueError, TypeError) as e:
                print(f"年份比较出错: {e}")
                print(f"错误详情: {tb.format_exc()}")
            
            if tmdb_info.get("imdb_id") and result.get("imdb_id"):
                if tmdb_info["imdb_id"] == result["imdb_id"]:
                    score += 10   
        else:
            tmdb_titles = [
                tmdb_info.get("title", "").lower(),
                tmdb_info.get("original_title", "").lower(),
                tmdb_info.get("en_title", "").lower(),
                tmdb_info.get("zh_title", "").lower() if platform == "douban" else ""
            ]
            tmdb_titles = [t for t in tmdb_titles if t]
            result_title = result.get("title", "").lower()
            
            result_title = re.sub(r'\s*\(\d{4}\)\s*', '', result_title)
            
            title_scores = [fuzz.ratio(t, result_title) for t in tmdb_titles if t]
            if title_scores:
                title_score = max(title_scores)
                score += title_score * 0.6
            
            try:
                tmdb_year = str(tmdb_info.get("year", ""))
                result_year = str(result.get("year", ""))
                
                if tmdb_year and result_year:
                    tmdb_year_int = extract_year(tmdb_year)
                    result_year_int = extract_year(result_year)
                    
                    if tmdb_year_int and result_year_int:
                        year_diff = abs(tmdb_year_int - result_year_int)
                        if year_diff == 0:
                            score += 30
                        elif year_diff == 1:
                            score += 15

            except (ValueError, TypeError) as e:
                print(f"年份比较出错: {e}")
                print(f"错误详情: {tb.format_exc()}")
            
            if tmdb_info.get("imdb_id") and result.get("imdb_id"):
                if tmdb_info["imdb_id"] == result["imdb_id"]:
                    score += 10
        
        threshold = {
            "douban": 70,
            "imdb": 70,
            "letterboxd": 70,
            "rottentomatoes": 70,
            "metacritic": 70
        }.get(platform, 70)
        
        if score >= threshold:
            return score
        else:
            return 0
            
    except Exception as e:
        print(f"{platform} 计算匹配度时出错: {e}")
        import traceback
        print(traceback.format_exc())
        return 0

async def check_rate_limit(page, platform: str) -> dict | None:
    """检查页面是否出现访问限制"""
    rate_limit_rules = {
        "douban": {
            "selectors": [
                '.note-text',
                '.error-content',
                '#error-500-page',
                '.restriction-notice',
                'h1:has-text("有异常请求")',
                'div:has-text("有异常请求从你的IP发出")'
            ],
            "phrases": [
                "访问太频繁",
                "访问受限",
                "请求过于频繁",
                "操作太频繁",
                "请求次数过多",
                "登录跳转",
                "搜索访问太频繁",
                "有异常请求",
                "异常请求从你的IP发出"
            ]
        },
        "imdb": {
            "selectors": [
                '.error-message',
                '#error-page',
                '.rate-limit-page'
            ],
            "phrases": [
                "rate limit exceeded",
                "too many requests",
                "access denied",
                "temporary block"
            ]
        },
        "rottentomatoes": {
            "selectors": [
                '.error-text',
                '#rate-limit-message',
                '.captcha-page'
            ],
            "phrases": [
                "too many requests",
                "rate limited",
                "please try again later",
                "verify you are human"
            ]
        },
        "letterboxd": {
            "selectors": [
                '.error-page',
                '.rate-limit-message',
                '.blocked-content',
                '.captcha-container',
                'h1:has-text("Access Denied")',
               'div:has-text("You are being rate limited")'
            ],
            "phrases": [
                "rate limit exceeded",
                "too many requests",
                "Just a moment",
                "you are being rate limited",
                "access denied",
                "please wait and try again",
                "temporarily blocked"
            ]
        },
        "metacritic": {
            "selectors": [
                '.error-message',
                '#block-message',
                '.rate-limit-notice'
            ],
            "phrases": [
                "access denied",
                "too many requests",
                "please wait",
                "rate limited"
            ]
        }
    }

    if platform not in rate_limit_rules:
        return None

    rules = rate_limit_rules[platform]
    
    if platform == "douban":
        page_text = await page.content()
        if "error code: 008" in page_text:
            print("豆瓣访问频率限制: error code 008")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"}
    
    if platform == "letterboxd":
        try:
            title = await page.title()
            content = await page.content()
            if title and "Just a moment" in title:
                print("Letterboxd: 检测到 Cloudflare 安全验证页 (title)")
                return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
            if "Enable JavaScript and cookies to continue" in content or "cf_chl_opt" in content or "challenge-platform" in content:
                print("Letterboxd: 检测到 Cloudflare 安全验证页 (content)")
                return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
        except Exception as e:
            print(f"Letterboxd Cloudflare 检测异常: {e}")
    
    page_text = await page.locator('body').text_content()
    if any(phrase in page_text for phrase in rules["phrases"]):
        print(f"{platform} 访问频率限制: 检测到限制文本")
        return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"}
    
    for selector in rules["selectors"]:
        elem = await page.query_selector(selector)
        if elem:
            text = await elem.inner_text()
            if any(phrase.lower() in text.lower() for phrase in rules["phrases"]):
                print(f"{platform} 访问频率限制: {text}")
                return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"}
    
    return None
    
def get_client_ip(request: Request) -> str:
    """获取用户真实IP地址"""
    ip_headers = [
        'X-Forwarded-For',
        'X-Real-IP',
        'CF-Connecting-IP',
        'True-Client-IP',
        'X-Client-IP'
    ]
    
    for header in ip_headers:
        ip = request.headers.get(header)
        if ip:
            if header == 'X-Forwarded-For':
                return ip.split(',')[0].strip()
            return ip.strip()
    
    return request.client.host

async def search_platform(platform, tmdb_info, request=None, douban_cookie=None):
    """
    在各平台搜索并返回搜索结果
    使用多策略搜索：依次尝试所有搜索变体直到找到匹配
    Args:
        platform: 平台名称
        tmdb_info: TMDB信息
        request: FastAPI请求对象
        douban_cookie: 用户的豆瓣Cookie（可选）
    """
    try:
        if request and await request.is_disconnected():
            return {"status": "cancelled"}

        if platform == "trakt":
            return [{"use_api": True, "title": tmdb_info.get("title", "")}]

        if platform == "imdb" and tmdb_info.get("imdb_id"):
            imdb_id = tmdb_info["imdb_id"]
            return [{
                "title": tmdb_info["title"],
                "year": tmdb_info.get("year", ""),
                "url": f"https://www.imdb.com/title/{imdb_id}/",
                "imdb_id": imdb_id,
                "direct_match": True
            }]

        is_anthology = tmdb_info.get("is_anthology", False)
        series_info = tmdb_info.get("series_info", {})
        
        if is_anthology and platform in ("rottentomatoes", "metacritic") and series_info:
            main_series_title = series_info.get("main_series_title") or series_info.get("main_title")
            main_series_year = series_info.get("main_series_year")
            
            if main_series_title:
                print(f"[{platform}] 选集剧使用主系列标题搜索: {main_series_title} ({main_series_year})")
                search_tmdb_info = tmdb_info.copy()
                search_tmdb_info["title"] = main_series_title
                search_tmdb_info["original_title"] = main_series_title
                search_tmdb_info["en_title"] = main_series_title
                if main_series_year:
                    search_tmdb_info["year"] = main_series_year
                
                search_url = construct_search_url(main_series_title, tmdb_info.get("type", "tv"), platform, search_tmdb_info)
                
                async def execute_search(browser):
                    context = None
                    try:
                        selected_user_agent = random.choice(USER_AGENTS)
                        context_options = {
                            'viewport': {'width': 1280, 'height': 720},
                            'user_agent': selected_user_agent,
                            'bypass_csp': True,
                            'ignore_https_errors': True,
                            'java_script_enabled': True,
                        }
                        context = await browser.new_context(**context_options)
                        page = await context.new_page()
                        page.set_default_timeout(30000)
                        
                        if platform == "rottentomatoes":
                            results = await handle_rt_search(page, search_url, search_tmdb_info)
                        elif platform == "metacritic":
                            results = await handle_metacritic_search(page, search_url, search_tmdb_info)
                        else:
                            results = []
                        
                        return results
                    finally:
                        if context:
                            try:
                                await context.close()
                            except:
                                pass
                
                try:
                    search_results = await browser_pool.execute_in_browser(execute_search)
                    if search_results:
                        if isinstance(search_results, list):
                            threshold = 60
                            print(f"使用选集剧阈值: {threshold}")
                            print(f"找到 {len(search_results)} 个 {platform} 搜索结果")
                            
                            matched_results = []
                            for result in search_results:
                                if isinstance(result, dict):
                                    result["used_main_series"] = True
                                    result["main_series_title"] = main_series_title
                                    result["main_series_year"] = main_series_year
                                    
                                    variant_info = {
                                        "title": main_series_title,
                                        "year": main_series_year or "",
                                        "strategy": "anthology_series",
                                        "type": "main_series_with_year" if main_series_year else "main_series_no_year"
                                    }
                                    result["search_variant_used"] = variant_info
                                    
                                    if "match_score" not in result:
                                        match_score = await calculate_match_degree(search_tmdb_info, result, platform)
                                    else:
                                        match_score = result["match_score"]
                                    
                                    if platform == "metacritic":
                                        print(f"  Metacritic匹配: '{result.get('title')}' ({result.get('year')}) - 分数: {match_score}, 阈值: {threshold}")
                                    
                                    if match_score >= threshold:
                                        matched_results.append(result)
                            
                            if matched_results:
                                print(f"{platform} 找到 {len(matched_results)} 个匹配结果")
                                return matched_results
                            else:
                                if platform == "metacritic":
                                    print(f"Metacritic未找到匹配结果（所有结果分数都低于阈值 {threshold}）")
                                return None
                        elif isinstance(search_results, dict) and "status" in search_results:
                            return search_results
                        else:
                            return None
                except Exception as e:
                    print(f"[{platform}] 使用主系列信息搜索失败: {e}")
        
        search_variants = tmdb_info.get("search_variants", [])
        
        if not search_variants:
            if platform == "douban":
                search_title = tmdb_info["zh_title"] or tmdb_info["original_title"]
            elif platform in ("imdb", "rottentomatoes", "metacritic"):
                original_title = tmdb_info.get("original_title", "")
                en_title = tmdb_info.get("en_title", "")
                
                def is_english_text(text):
                    if not text:
                        return False
                    try:
                        ascii_count = sum(1 for c in text if ord(c) < 128)
                        return ascii_count / len(text) > 0.8
                    except:
                        return False
                
                if original_title and is_english_text(original_title):
                    search_title = original_title
                elif en_title:
                    search_title = en_title
                else:
                    search_title = original_title or tmdb_info.get("title") or tmdb_info.get("name") or ""
            else:
                search_title = tmdb_info["title"] or tmdb_info.get("name") or tmdb_info["original_title"]
            
            search_variants = [{
                "title": search_title,
                "year": tmdb_info.get("year", ""),
                "type": "default",
                "strategy": "standalone",
                "priority": 1
            }]
        
        media_type = tmdb_info["type"]
        
        async def execute_single_search(search_title, variant_info, browser):
            """执行单个搜索变体的搜索"""
            context = None
            search_url_or_urls = construct_search_url(search_title, media_type, platform, tmdb_info)
            
            if platform == "letterboxd" and isinstance(search_url_or_urls, list):
                search_urls = search_url_or_urls
            else:
                search_urls = [search_url_or_urls] if search_url_or_urls else []
            
            try:
                selected_user_agent = random.choice(USER_AGENTS)

                context_options = {
                    'viewport': {'width': 1280, 'height': 720},
                    'user_agent': selected_user_agent,
                    'bypass_csp': True,
                    'ignore_https_errors': True,
                    'java_script_enabled': True,
                    'has_touch': False,
                    'is_mobile': False,
                    'locale': 'zh-CN',
                    'timezone_id': 'Asia/Shanghai',
                    'extra_http_headers': {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'DNT': '1',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1'
                    }
                }

                context = await browser.new_context(**context_options)

                await context.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda route: route.abort())
                await context.route("**/(analytics|tracking|advertisement)", lambda route: route.abort())
                await context.route("**/beacon/**", lambda route: route.abort())
                await context.route("**/telemetry/**", lambda route: route.abort())
                await context.route("**/stats/**", lambda route: route.abort())

                page = await context.new_page()
                page.set_default_timeout(20000)
                if platform == "letterboxd":
                    try:
                        from playwright_stealth import stealth_async  # type: ignore[reportMissingImports]
                        await stealth_async(page)
                    except Exception:
                        pass

                if platform == "douban":
                    headers = {}
                    if request:
                        client_ip = get_client_ip(request)
                        print(f"豆瓣请求使用IP: {client_ip}")
                        headers.update({
                            'X-Forwarded-For': client_ip,
                            'X-Real-IP': client_ip
                        })
                    if douban_cookie:
                        headers['Cookie'] = douban_cookie
                        print(f"✅ 豆瓣请求使用用户自定义Cookie（长度: {len(douban_cookie)}）")
                    else:
                        print("⚠️ 未提供豆瓣Cookie，使用默认方式")
                    if headers:
                        await page.set_extra_http_headers(headers)

                async def log_request(req):
                    if req.resource_type == "document":
                        pass
                    page.remove_listener('request', log_request)

                page.on('request', log_request)
                
                results = None
                
                try:
                    async def check_request():
                        if request and await request.is_disconnected():
                            print("请求已被取消,停止执行")
                            raise RequestCancelledException()

                    if platform == "letterboxd" and len(search_urls) > 1:
                        for idx, search_url in enumerate(search_urls):
                            if not search_url:
                                continue
                            print(f"{platform} 搜索URL [{idx+1}/{len(search_urls)}]: {search_url}")
                            await check_request()
                            results = await handle_letterboxd_search(page, search_url, tmdb_info)
                            
                            if results and not (isinstance(results, dict) and results.get("status") == RATING_STATUS["NO_FOUND"]):
                                break
                        
                        if results and isinstance(results, dict) and results.get("status") == RATING_STATUS["NO_FOUND"]:
                            print(f"Letterboxd所有搜索方式都未找到结果，确认未收录")
                    else:
                        if not search_urls:
                            print(f"{platform} 无法构造搜索URL")
                            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "无法构造搜索URL"}
                        search_url = search_urls[0]
                        if search_url:
                            print(f"{platform} 搜索URL: {search_url}")
                            await check_request()
                            if platform == "douban":
                                results = await handle_douban_search(page, search_url)
                            elif platform == "imdb":
                                results = await handle_imdb_search(page, search_url)
                            elif platform == "letterboxd":
                                results = await handle_letterboxd_search(page, search_url, tmdb_info)
                            elif platform == "rottentomatoes":
                                results = await handle_rt_search(page, search_url, tmdb_info)
                            elif platform == "metacritic":
                                results = await handle_metacritic_search(page, search_url, tmdb_info)
                            else:
                                print(f"平台 {platform} 不支持通过搜索页面")
                                return None
                        else:
                            print(f"{platform} 搜索URL为空")
                            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "搜索URL为空"}

                    await check_request()
                    if isinstance(results, dict) and "status" in results:
                        if results["status"] == RATING_STATUS["RATE_LIMIT"]:
                            reason = results.get("status_reason") or "访问频率限制"
                            print(f"{platform} 访问频率限制: {reason}")
                            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": reason} 
                        elif results["status"] == RATING_STATUS["TIMEOUT"]:
                            print(f"{platform} 请求超时")
                            return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
                        elif results["status"] == RATING_STATUS["FETCH_FAILED"]:
                            print(f"{platform} 获取失败")
                            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}
                        elif results["status"] == RATING_STATUS["NO_FOUND"]:
                            print(f"{platform}平台未收录此影视")
                            return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}

                    await check_request()
                    if not isinstance(results, list):
                        print(f"{platform} 获取失败")
                        return create_error_rating_data(platform, media_type)

                    print(f"找到 {len(results)} 个 {platform} 搜索结果")

                    await check_request()
                    if variant_info.get("strategy") == "anthology_series":
                        threshold = 60
                        print(f"使用选集剧阈值: {threshold}")
                    else:
                        threshold = {
                            "douban": 70,
                            "imdb": 70,
                            "letterboxd": 70,
                            "rottentomatoes": 70,
                            "metacritic": 70
                        }.get(platform, 70)

                    matched_results = []
                    for result in results:
                        await check_request()
                        result["search_variant_used"] = variant_info
                        
                        if "match_score" in result:
                            match_score = result["match_score"]
                        else:
                            match_score = await calculate_match_degree(tmdb_info, result, platform)

                        if platform == "metacritic" and variant_info.get("strategy") == "anthology_series":
                            print(f"  Metacritic匹配: '{result.get('title')}' ({result.get('year')}) - 分数: {match_score}, 阈值: {threshold}")

                        if match_score >= threshold:
                            matched_results.append(result)
                        else:
                            pass

                    if not matched_results:
                        if platform == "metacritic":
                            print(f"Metacritic未找到匹配结果（所有结果分数都低于阈值 {threshold}）")
                        return None

                    print(f"{platform} 找到 {len(matched_results)} 个匹配结果")
                    return matched_results

                except RequestCancelledException:
                    print("所有请求已取消")
                    return {"status": "cancelled"}
                except Exception as e:
                    print(f"处理搜索时出错: {e}")
                    print(traceback.format_exc())
                    if "Timeout" in str(e):
                        return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"} 
                    return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}

            finally:
                if context:
                    try:
                        await context.close()
                    except Exception:
                        pass
        
        for i, variant in enumerate(search_variants, 1):
            if request and await request.is_disconnected():
                return {"status": "cancelled"}
            
            search_title = variant["title"]
            
            try:
                results = await browser_pool.execute_in_browser(
                    lambda browser, st=search_title, v=variant: execute_single_search(st, v, browser)
                )
                
                if isinstance(results, dict) and "status" in results:
                    if i == len(search_variants):
                        return results
                    continue
                
                if isinstance(results, list) and len(results) > 0:
                    print(f"变体成功！{platform} 找到 {len(results)} 个匹配结果")
                    for result in results:
                        result['search_variant_used'] = variant
                    return results
                
            except Exception as e:
                if i == len(search_variants):
                    return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": str(e)}
                continue
        
        print(f"\n所有 {len(search_variants)} 个搜索变体都失败")
        
        if platform == "douban" and tmdb_info.get("imdb_id"):
            imdb_id = tmdb_info["imdb_id"]
            print(f"\n[豆瓣备用策略] 尝试使用IMDB ID搜索: {imdb_id}")
            
            try:
                imdb_search_url = f"https://search.douban.com/movie/subject_search?search_text={imdb_id}"
                
                async def execute_imdb_search(browser):
                    context = None
                    try:
                        selected_user_agent = random.choice(USER_AGENTS)
                        context_options = {
                            'viewport': {'width': 1280, 'height': 720},
                            'user_agent': selected_user_agent,
                            'bypass_csp': True,
                            'ignore_https_errors': True,
                            'java_script_enabled': True,
                            'has_touch': False,
                            'is_mobile': False,
                            'locale': 'zh-CN',
                            'timezone_id': 'Asia/Shanghai',
                            'extra_http_headers': {
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                                'Accept-Encoding': 'gzip, deflate, br',
                                'DNT': '1',
                                'Connection': 'keep-alive',
                                'Upgrade-Insecure-Requests': '1',
                                'Sec-Fetch-Dest': 'document',
                                'Sec-Fetch-Mode': 'navigate',
                                'Sec-Fetch-Site': 'none',
                                'Sec-Fetch-User': '?1'
                            }
                        }
                        
                        context = await browser.new_context(**context_options)
                        await context.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda route: route.abort())
                        await context.route("**/(analytics|tracking|advertisement)", lambda route: route.abort())
                        await context.route("**/beacon/**", lambda route: route.abort())
                        await context.route("**/telemetry/**", lambda route: route.abort())
                        await context.route("**/stats/**", lambda route: route.abort())
                        
                        page = await context.new_page()
                        page.set_default_timeout(20000)
                        
                        headers = {}
                        if request:
                            client_ip = get_client_ip(request)
                            print(f"豆瓣请求使用IP: {client_ip}")
                            headers.update({
                                'X-Forwarded-For': client_ip,
                                'X-Real-IP': client_ip
                            })
                        if douban_cookie:
                            headers['Cookie'] = douban_cookie
                            print(f"✅ 豆瓣请求使用用户自定义Cookie（长度: {len(douban_cookie)}）")
                        else:
                            print("⚠️ 未提供豆瓣Cookie，使用默认方式")
                        if headers:
                            await page.set_extra_http_headers(headers)
                        
                        results = await handle_douban_search(page, imdb_search_url)
                        
                        if isinstance(results, dict) and "status" in results:
                            return results
                        
                        if isinstance(results, list) and len(results) > 0:
                            print(f"IMDB ID搜索成功！找到 {len(results)} 个结果")
                            if len(results) > 0:
                                results[0]["match_score"] = 100
                                results[0]["search_variant_used"] = {
                                    "title": imdb_id,
                                    "strategy": "imdb_id",
                                    "type": "fallback"
                                }
                            return results
                        
                        return None
                        
                    finally:
                        if context:
                            try:
                                await context.close()
                            except Exception:
                                pass
                
                results = await browser_pool.execute_in_browser(execute_imdb_search)
                
                if isinstance(results, list) and len(results) > 0:
                    return results
                elif isinstance(results, dict) and "status" in results:
                    print(f"IMDB ID备用策略失败: {results.get('status_reason', results.get('status'))}")
                else:
                    print(f"IMDB ID备用策略未找到结果")
                    
            except Exception as e:
                print(f"IMDB ID备用策略出错: {e}")
        
        return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "所有搜索策略都未找到匹配"}

    except Exception as e:
        print(f"搜索 {platform} 时出错: {e}")
        print(traceback.format_exc())
        return []

async def handle_douban_search(page, search_url):
    """处理豆瓣搜索"""
    try:
        await random_delay()
        print(f"访问豆瓣搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        
        try:
            await page.wait_for_load_state('networkidle', timeout=3000)
        except Exception as e:
            print(f"豆瓣等待网络空闲超时: {e}")
        
        await asyncio.sleep(0.2)
        
        rate_limit = await check_rate_limit(page, "douban")
        if rate_limit:
            print("检测到豆瓣访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            items = []
            selectors_to_try = [
                '.sc-bZQynM .item-root',
                '.item-root', 
                'a[class*="title-text"]',
                '[class*="item-root"]',
                'a[href*="/subject/"]'
            ]
            
            for selector in selectors_to_try:
                items = await page.query_selector_all(selector)
                if items:
                    break
            
            results = []
            
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            for item in items:
                try:
                    title_elem = await item.query_selector('.title-text')
                    if title_elem:
                        title_text = await title_elem.inner_text()
                        url = await title_elem.get_attribute('href')
                        
                        title_match = re.search(r'(.*?)\s*\((\d{4})\)', title_text)
                        if title_match:
                            title = title_match.group(1).strip()
                            year = title_match.group(2)
                            
                            results.append({
                                "title": title,
                                "year": year,
                                "url": url
                            })
                        else:
                            results.append({
                                "title": title_text.strip(),
                                "year": "",
                                "url": url
                            })
                except Exception as e:
                    print(f"处理豆瓣单个搜索结果时出错: {e}")
                    continue
            
            return results if results else {"status": RATING_STATUS["NO_FOUND"]}
            
        except Exception as e:
            print(f"等待豆瓣搜索结果时出错: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}
            
    except Exception as e:
        print(f"访问豆瓣搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
        return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}

async def handle_imdb_search(page, search_url):
    """处理IMDB搜索"""
    try:
        async def block_resources(route):
            resource_type = route.request.resource_type
            if resource_type in ["image", "stylesheet", "font", "media"]:
                await route.abort()
            else:
                await route.continue_()
        
        await page.route("**/*", block_resources)
        
        await random_delay()
        print(f"访问 IMDb 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=10000)
        await asyncio.sleep(0.2)
    
        rate_limit = await check_rate_limit(page, "imdb")
        if rate_limit:
            print("检测到IMDb访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            items = await page.query_selector_all('.ipc-metadata-list-summary-item')
            results = []
            
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
                    
            for item in items:
                try:
                    title_elem = await item.query_selector('a.ipc-metadata-list-summary-item__t')
                    
                    if title_elem:
                        title = await title_elem.inner_text()
                        url = await title_elem.get_attribute('href')
                        
                        year = None
                        
                        all_list_items = await item.query_selector_all('.ipc-inline-list__item')
                        for list_item in all_list_items:
                            text = await list_item.inner_text()
                            year_match = re.search(r'\b(19\d{2}|20\d{2})\b', text)
                            if year_match:
                                year = year_match.group(1)
                                break
                        
                        if not year:
                            year_match = re.search(r'\((\d{4})\)', title)
                            if year_match:
                                year = year_match.group(1)
                        
                        if not year:
                            type_elem = await item.query_selector('.ipc-inline-list__item .ipc-metadata-list-summary-item__li')
                            if type_elem:
                                year = await type_elem.inner_text()
                        
                        if url and "/title/" in url:
                            imdb_id = url.split("/title/")[1].split("/")[0]
                            results.append({
                                "title": title,
                                "year": year or "",
                                "imdb_id": imdb_id,
                                "url": f"https://www.imdb.com/title/{imdb_id}/"
                            })
                except Exception as e:
                    print(f"处理IMDb单个搜索结果时出错: {e}")
                    continue
        
            return results if results else {"status": RATING_STATUS["NO_FOUND"]}
        
        except Exception as e:
            print(f"等待IMDb搜索结果超时: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}
            
    except Exception as e:
        print(f"访问IMDb搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
        return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}

async def handle_rt_search(page, search_url, tmdb_info):
    """处理Rotten Tomatoes搜索"""
    try:
        # 拦截不必要的资源以加速页面加载
        async def block_resources(route):
            resource_type = route.request.resource_type
            if resource_type in ["image", "stylesheet", "font", "media"]:
                await route.abort()
            else:
                await route.continue_()
        
        await page.route("**/*", block_resources)
        
        await random_delay()
        print(f"访问 Rotten Tomatoes 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=10000)
        await asyncio.sleep(0.2)
    
        rate_limit = await check_rate_limit(page, "rottentomatoes")
        if rate_limit:
            print("检测到Rotten Tomatoes访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            media_type = tmdb_info.get('type', 'movie')
            result_type = 'movie' if media_type == 'movie' else 'tvSeries'
            
            try:
                filter_elements = await page.query_selector_all('span[data-qa="search-filter-text"]')
                
                for elem in filter_elements:
                    await elem.inner_text()
                
                if media_type == 'movie':
                    movies_tab = await page.wait_for_selector('span[data-qa="search-filter-text"]:has-text("Movies")', timeout=5000)
                    if movies_tab:
                        await movies_tab.click()
                else:
                    tv_tab = await page.wait_for_selector('span[data-qa="search-filter-text"]:has-text("TV Shows")', timeout=5000)
                    if tv_tab:
                        await tv_tab.click()
                
                await asyncio.sleep(1)
            
            except Exception as e:
                print(f"Rotten Tomatoes切换媒体类型标签失败: {str(e)}")
                print(f"Rotten Tomatoes错误类型: {type(e)}")
            
            result_section = f'search-page-result[type="{result_type}"]:not([hidden])'
            section = await page.wait_for_selector(result_section, timeout=5000)
            
            if not section:
                print(f"Rotten Tomatoes未找到{media_type}类型的搜索结果区域")
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            items = await section.query_selector_all('search-page-media-row')
            results = []
            
            if not items:
                print(f"Rotten Tomatoes在{media_type}区域未找到任何结果")
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            print(f"Rotten Tomatoes找到 {len(items)} 个{media_type}类型结果")
            
            is_anthology = tmdb_info.get("is_anthology", False)
            search_variants = tmdb_info.get("search_variants", [])
            
            using_subtitle_search = False
            if is_anthology and search_variants:
                import urllib.parse
                search_query = urllib.parse.unquote(search_url.split("search=")[-1].split("&")[0] if "search=" in search_url else "").lower()
                
                for variant in search_variants:
                    if variant.get("for_rottentomatoes"):
                        variant_title = variant.get("title", "").lower()
                        if variant_title == search_query:
                            using_subtitle_search = True
                            print(f"Rotten Tomatoes[选集剧] 使用副标题搜索：{variant.get('title')}")
                            break
            
            if using_subtitle_search and items:
                item = items[0]
                try:
                    title_elem = await item.query_selector('[data-qa="info-name"]')
                    if title_elem:
                        title = (await title_elem.inner_text()).strip()
                        url = await title_elem.get_attribute('href')
                        year = await item.get_attribute('startyear')
                        
                        print(f"Rotten Tomatoes选集剧第一个结果: {title} ({year})")
                        
                        return [{
                            "title": title,
                            "year": year or tmdb_info.get('year'),
                            "url": url,
                            "match_score": 100,
                            "is_anthology_match": True
                        }]
                except Exception as e:
                    print(f"Rotten Tomatoes获取选集剧第一个结果时出错: {e}")
            
            for item in items:
                try:
                    title_elem = await item.query_selector('[data-qa="info-name"]')
                    if title_elem:
                        title = (await title_elem.inner_text()).strip()
                        url = await title_elem.get_attribute('href')
                        
                        if media_type == 'movie':
                            year = await item.get_attribute('releaseyear')
                        else:
                            year = await item.get_attribute('startyear')
                        
                        url_type_match = ('/m/' in url) if media_type == 'movie' else ('/tv/' in url)
                        if not url_type_match:
                            continue

                        original_title = tmdb_info.get("original_title", "")
                        en_title = tmdb_info.get("en_title", "")
                        
                        def is_english_text(text):
                            if not text:
                                return False
                            try:
                                ascii_count = sum(1 for c in text if ord(c) < 128)
                                return ascii_count / len(text) > 0.8
                            except:
                                return False
                        
                        if original_title and is_english_text(original_title):
                            match_title = original_title
                        elif en_title:
                            match_title = en_title
                        else:
                            match_title = tmdb_info.get("title", "")
                        
                        title_match = title.lower() == match_title.lower()
                        year_match = False
                        
                        match_year = tmdb_info['year']
                        if is_anthology:
                            series_info = tmdb_info.get("series_info", {})
                            if series_info:
                                main_series_year = series_info.get("main_series_year")
                                if main_series_year:
                                    match_year = main_series_year
                                    print(f"Rotten Tomatoes使用主系列年份进行匹配: {main_series_year}")
                        
                        if year:
                            year_match = year == match_year
                        else:
                            current_year = datetime.now().year
                            target_year = int(match_year) if match_year else current_year
                            if target_year > current_year and title_match:
                                year_match = True
                        
                        if title_match and year_match:
                            return [{
                                "title": title,
                                "year": year or tmdb_info['year'],
                                "url": url,
                                "match_score": 100,
                                "number_of_seasons": tmdb_info.get("number_of_seasons", 0)
                            }]

                        result_data = {
                            "title": title,
                            "year": year or tmdb_info['year'],
                            "url": url,
                            "number_of_seasons": tmdb_info.get("number_of_seasons", 0)
                        }
                        
                        result_data["match_score"] = await calculate_match_degree(
                            tmdb_info, 
                            result_data,
                            platform="rottentomatoes"
                        )
                        
                        results.append(result_data)

                except Exception as e:
                    print(f"处理Rotten Tomatoes单个搜索结果时出错: {e}")
                    continue
        
            return results if results else {"status": RATING_STATUS["NO_FOUND"]}
        
        except Exception as e:
            print(f"等待Rotten Tomatoes搜索结果超时: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}
            
    except Exception as e:
        print(f"访问Rotten Tomatoes搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
        return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}

async def handle_metacritic_search(page, search_url, tmdb_info=None):
    """处理Metacritic搜索"""
    try:
        async def block_resources(route):
            resource_type = route.request.resource_type
            if resource_type in ["image", "stylesheet", "font", "media"]:
                await route.abort()
            else:
                await route.continue_()
        
        await page.route("**/*", block_resources)
        
        await random_delay()
        print(f"访问 Metacritic 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=10000)
        await asyncio.sleep(0.2)
    
        rate_limit = await check_rate_limit(page, "metacritic")
        if rate_limit:
            print("检测到Metacritic访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            items = await page.query_selector_all('[data-testid="search-result-item"]')
            results = []
            
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            is_anthology = tmdb_info.get("is_anthology", False) if tmdb_info else False
            series_info = tmdb_info.get("series_info", {}) if tmdb_info else {}
            match_year = tmdb_info['year'] if tmdb_info else None
            if is_anthology and series_info:
                main_series_year = series_info.get("main_series_year")
                if main_series_year:
                    match_year = main_series_year
                    print(f"Metacritic使用主系列年份进行匹配: {main_series_year}")
            
            for item in items:
                try:
                    title_elem = await item.query_selector('.g-text-medium-fluid')
                    year_elem = await item.query_selector('.u-text-uppercase')
                    url = await item.get_attribute('href')
                
                    if title_elem and year_elem and url:
                        title = await title_elem.inner_text()
                        year = await year_elem.inner_text()
                    
                        results.append({
                            "title": title.strip(),
                            "year": year.strip(),
                            "url": f"https://www.metacritic.com{url}"
                        })
                except Exception as e:
                    print(f"处理Metacritic单个搜索结果时出错: {e}")
                    continue
            
            if results:
                print(f"Metacritic找到 {len(results)} 个搜索结果:")
                for i, r in enumerate(results[:5], 1):  # 只打印前5个
                    print(f"  {i}. {r['title']} ({r['year']})")
            else:
                print("Metacritic未找到任何搜索结果")
        
            return results if results else {"status": RATING_STATUS["NO_FOUND"]}
        
        except Exception as e:
            print(f"等待Metacritic搜索结果超时: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}
            
    except Exception as e:
        print(f"访问Metacritic搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
        return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}


async def _is_cloudflare_challenge(page) -> bool:
    """检测当前页面是否为 Cloudflare 安全验证（Just a moment...）"""
    try:
        title = await page.title()
        if title and "Just a moment" in title:
            return True
        content = await page.content()
        if "Enable JavaScript and cookies to continue" in content or "cf_chl_opt" in content or "challenge-platform" in content:
            return True
        return False
    except Exception:
        return False


async def handle_letterboxd_search(page, search_url, tmdb_info):
    """处理Letterboxd搜索"""
    new_ctx = None
    try:
        async def block_resources(route):
            resource_type = route.request.resource_type
            if resource_type in ["image", "stylesheet", "font", "media"]:
                await route.abort()
            else:
                await route.continue_()
        
        await page.route("**/*", block_resources)
        
        await random_delay()
        print(f"访问 Letterboxd 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=10000)
        await asyncio.sleep(0.5)
    
        # Cloudflare 验证页：先等 5 秒看能否自动通过，否则尝试 FlareSolverr（若已配置）
        if await _is_cloudflare_challenge(page):
            print("Letterboxd: 检测到 Cloudflare 安全验证页，等待 5 秒尝试自动通过…")
            await asyncio.sleep(5)
            if await _is_cloudflare_challenge(page):
                fs_url = os.environ.get("FLARESOLVERR_URL", "").strip()
                if fs_url:
                    if not fs_url.endswith("/v1"):
                        fs_url = fs_url.rstrip("/") + "/v1"
                    try:
                        print("Letterboxd: 使用 FlareSolverr 尝试绕过 Cloudflare…")
                        async with aiohttp.ClientSession() as session:
                            async with session.post(
                                fs_url,
                                json={"cmd": "request.get", "url": search_url, "maxTimeout": 60000},
                                timeout=aiohttp.ClientTimeout(total=65),
                            ) as resp:
                                data = await resp.json()
                        if data.get("status") == "ok" and data.get("solution"):
                            sol = data["solution"]
                            cookies = sol.get("cookies") or []
                            if cookies:
                                pw = [{"name": c.get("name"), "value": c.get("value"), "domain": c.get("domain", ".letterboxd.com"), "path": c.get("path", "/")} for c in cookies if c.get("name") and c.get("value")]
                                if pw:
                                    ua = sol.get("userAgent") or ""
                                    if ua:
                                        # 必须用 FlareSolverr 的 User-Agent，否则 cf_clearance 无效
                                        browser = page.context.browser
                                        new_ctx = await browser.new_context(
                                            viewport={"width": 1280, "height": 720},
                                            user_agent=ua,
                                        )
                                        await new_ctx.add_cookies(pw)
                                        new_page = await new_ctx.new_page()
                                        await new_page.route("**/*", block_resources)
                                        await new_page.goto(search_url, wait_until="domcontentloaded", timeout=10000)
                                        await asyncio.sleep(0.5)
                                        if await _is_cloudflare_challenge(new_page):
                                            await new_ctx.close()
                                            new_ctx = None
                                            print("Letterboxd: FlareSolverr 注入 cookie 后仍为验证页，返回 RateLimit")
                                            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
                                        print("Letterboxd: FlareSolverr 成功绕过 Cloudflare，继续解析")
                                        page = new_page
                                    else:
                                        await page.context.add_cookies(pw)
                                        await page.goto(search_url, wait_until="domcontentloaded", timeout=10000)
                                        await asyncio.sleep(0.5)
                                        if not await _is_cloudflare_challenge(page):
                                            print("Letterboxd: FlareSolverr 成功绕过 Cloudflare，继续解析")
                                        else:
                                            print("Letterboxd: FlareSolverr 注入 cookie 后仍为验证页，返回 RateLimit")
                                            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
                                else:
                                    return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
                            else:
                                return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
                        else:
                            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
                    except Exception as e:
                        print(f"Letterboxd: FlareSolverr 请求失败: {e}")
                        return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
                print("Letterboxd: 遭遇 Cloudflare 安全验证，返回 RateLimit（未配置 FLARESOLVERR_URL）")
                return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
    
        rate_limit = await check_rate_limit(page, "letterboxd")
        if rate_limit:
            print("检测到Letterboxd访问限制")
            return rate_limit
        
        try:
            try:
                await page.wait_for_selector('.results li', timeout=5000)
            except Exception as e:
                print(f"Letterboxd等待搜索结果超时: {e}")
            
            items = await page.query_selector_all('div[data-item-link]')
            
            if not items:
                if await _is_cloudflare_challenge(page):
                    print("Letterboxd: 等待超时且为 Cloudflare 验证页，返回 RateLimit（非平台未收录）")
                    return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "Cloudflare 安全验证拦截，请稍后重试"}
                print("Letterboxd未找到搜索结果")
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            first_item = items[0]
            try:
                detail_path = None
                title = "Unknown"
                
                detail_path = await first_item.get_attribute('data-item-link')
                if detail_path:
                    title = await first_item.get_attribute('data-item-name') or title
                
                if not detail_path:
                    print("Letterboxd 无法提取详情页链接")
                    html_snippet = await first_item.inner_html()
                    print(f"HTML片段: {html_snippet[:500]}")
                    return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
                
                detail_url = f"https://letterboxd.com{detail_path}" if not detail_path.startswith('http') else detail_path
                
                print(f"Letterboxd找到匹配结果: {title}")
                
                return [{
                    "title": title,
                    "year": tmdb_info.get("year", ""),
                    "url": detail_url,
                    "match_score": 100
                }]
                
            except Exception as e:
                print(f"处理Letterboxd搜索结果项时出错: {e}")
                import traceback
                print(traceback.format_exc())
                return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "解析失败"}
            
        except Exception as e:
            print(f"处理Letterboxd搜索结果时出错: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}
            
    except Exception as e:
        print(f"访问Letterboxd搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
        return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}
    finally:
        if new_ctx:
            try:
                await new_ctx.close()
            except Exception:
                pass
    
async def extract_rating_info(media_type, platform, tmdb_info, search_results, request=None, douban_cookie=None):
    """从各平台详情页中提取对应评分数据
    Args:
        media_type: 媒体类型
        platform: 平台名称
        tmdb_info: TMDB信息
        search_results: 搜索结果
        request: FastAPI请求对象
        douban_cookie: 用户的豆瓣Cookie（可选）
    """
    async def _extract_rating_with_retry():
        try:
            await random_delay()
            if request and await request.is_disconnected():
                print("请求已被取消,停止执行")
                return {"status": "cancelled"}

            if platform == "trakt":
                try:
                    series_info = tmdb_info.get("series_info")
                    
                    trakt_data = await anthology_handler.search_trakt(tmdb_info, series_info)
                    
                    if trakt_data:
                        print(f"Trakt评分获取成功")
                        
                        result = {
                            "rating": str(trakt_data.get("rating", "暂无")),
                            "votes": str(trakt_data.get("votes", "暂无")),
                            "distribution": trakt_data.get("distribution", {}),
                            "url": trakt_data.get("url", ""),
                            "status": RATING_STATUS["SUCCESSFUL"]
                        }
                        
                        if "seasons" in trakt_data and trakt_data["seasons"]:
                            result["seasons"] = trakt_data["seasons"]
                        
                        return result
                    else:
                        print("Trakt评分获取失败：未找到匹配")
                        return {
                            "rating": "暂无",
                            "votes": "暂无",
                            "distribution": {},
                            "url": "",
                            "status": RATING_STATUS["NO_FOUND"]
                        }
                except Exception as e:
                    print(f"Trakt评分获取失败: {e}")
                    import traceback
                    print(traceback.format_exc())
                    return {
                        "rating": "暂无",
                        "votes": "暂无",
                        "distribution": {},
                        "url": "",
                        "status": RATING_STATUS["FETCH_FAILED"],
                        "status_reason": str(e)
                    }

            if isinstance(search_results, dict) and "status" in search_results:
                status = search_results["status"]
                if status == "cancelled":
                    return search_results
                elif status == RATING_STATUS["RATE_LIMIT"]:
                    return create_rating_data(RATING_STATUS["RATE_LIMIT"], search_results.get("status_reason") or "频率限制")
                elif status == RATING_STATUS["TIMEOUT"]:
                    return create_rating_data(RATING_STATUS["TIMEOUT"], "获取超时")
                elif status == RATING_STATUS["FETCH_FAILED"]:
                    return create_rating_data(RATING_STATUS["FETCH_FAILED"], "获取失败")

            if request and await request.is_disconnected():
                print("请求已被取消,停止执行")
                return {"status": "cancelled"}

            if isinstance(search_results, list) and not search_results:
                print(f"\n{platform}平台未收录此影视")
                return create_rating_data(RATING_STATUS["NO_FOUND"])

            best_match = None
            highest_score = 0
            matched_results = []
            
            for result in search_results:
                if isinstance(result, str):
                    result = {"title": result}

                if request and await request.is_disconnected():
                    print("请求已被取消,停止执行")
                    return {"status": "cancelled"}

                score = await calculate_match_degree(tmdb_info, result, platform)
                result["match_score"] = score
                
                if media_type == "tv" and len(tmdb_info.get("seasons", [])) > 1:
                    if score > 50:
                        matched_results.append(result)
                else:
                    if score > highest_score:
                        highest_score = score
                        best_match = result

            if media_type == "tv" and len(tmdb_info.get("seasons", [])) > 1 and matched_results:
                matched_results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
                print(f"{platform} 找到 {len(matched_results)} 个匹配的季")
                
                best_match = matched_results[0]
            elif not best_match:
                print(f"在{platform}平台未找到匹配的结果")
                return create_empty_rating_data(platform, media_type, RATING_STATUS["NO_FOUND"])

            detail_url = best_match["url"]
            print(f"{platform} 找到最佳匹配结果: {best_match['title']} ({best_match.get('year', '')})")
            print(f"{platform} 访问详情页: {detail_url}")

            async def extract_with_browser(browser):
                context = None
                try:
                    selected_user_agent = random.choice(USER_AGENTS)

                    context_options = {
                        'viewport': {'width': 1280, 'height': 720},
                        'user_agent': selected_user_agent,
                        'bypass_csp': True,
                        'ignore_https_errors': True,
                        'java_script_enabled': True,
                        'has_touch': False,
                        'is_mobile': False,
                        'locale': 'en-US',
                        'timezone_id': 'America/New_York',
                        'extra_http_headers': {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'DNT': '1',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1',
                            'Sec-Fetch-Dest': 'document',
                            'Sec-Fetch-Mode': 'navigate',
                            'Sec-Fetch-Site': 'none',
                            'Sec-Fetch-User': '?1'
                        }
                    }

                    context = await browser.new_context(**context_options)
                    page = await context.new_page()
                    page.set_default_timeout(30000)

                    if platform == "douban":
                        headers = {}
                        if request:
                            client_ip = get_client_ip(request)
                            print(f"豆瓣请求使用IP: {client_ip}")
                            headers.update({
                                'X-Forwarded-For': client_ip,
                                'X-Real-IP': client_ip
                            })
                        if douban_cookie:
                            headers['Cookie'] = douban_cookie
                            print(f"✅ 豆瓣请求使用用户自定义Cookie（长度: {len(douban_cookie)}）")
                        else:
                            print("⚠️ 未提供豆瓣Cookie，使用默认方式")
                        if headers:
                            await page.set_extra_http_headers(headers)

                    if request and await request.is_disconnected():
                        print("请求已被取消,停止执行")
                        return {"status": "cancelled"}

                    if platform == "imdb":
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    elif platform == "douban":
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    elif platform == "letterboxd":
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    elif platform == "rottentomatoes":
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    elif platform == "metacritic":
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    else:
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)

                    try:
                        if platform == "douban":
                            if media_type == "tv" and len(tmdb_info.get("seasons", [])) > 1 and matched_results:
                                print("检测到多季剧集，优先进行分季抓取以获取所有季评分")
                                rating_data = await extract_douban_rating(page, media_type, matched_results)
                            else:
                                rating_data = None
                                douban_id = None
                                
                                if isinstance(search_results, list) and len(search_results) > 0:
                                    first_result = search_results[0]
                                    if isinstance(first_result, dict) and 'url' in first_result:
                                        url_match = re.search(r'/subject/(\d+)', first_result['url'])
                                        if url_match:
                                            douban_id = url_match.group(1)
                                
                                if douban_id:
                                    print(f"尝试使用豆瓣API获取评分 (ID: {douban_id})")
                                    rating_data = await get_douban_rating_via_api(douban_id, douban_cookie)
                                
                                if not rating_data or rating_data.get("status") not in [RATING_STATUS["SUCCESSFUL"], RATING_STATUS["NO_RATING"]]:
                                    if douban_id:
                                        print("豆瓣API失败，fallback到网页抓取")
                                    rating_data = await extract_douban_rating(page, media_type, search_results)
                        elif platform == "imdb":
                            imdb_id = tmdb_info.get("imdb_id")
                            rating_data = None
                            
                            if imdb_id:
                                print(f"尝试使用IMDB GraphQL API获取评分 (ID: {imdb_id})")
                                rating_data = await get_imdb_rating_via_graphql(imdb_id)
                            
                            if not rating_data or rating_data.get("status") != RATING_STATUS["SUCCESSFUL"]:
                                if imdb_id:
                                    print("GraphQL API失败，fallback到网页抓取")
                                rating_data = await extract_imdb_rating(page)
                        elif platform == "letterboxd":
                            rating_data = await extract_letterboxd_rating(page)
                        elif platform == "rottentomatoes":
                            rating_data = await extract_rt_rating(page, media_type, tmdb_info)
                        elif platform == "metacritic":
                            rating_data = await extract_metacritic_rating(page, media_type, tmdb_info)

                        if request and await request.is_disconnected():
                            print("请求已被取消,停止执行")
                            return {"status": "cancelled"}

                        if rating_data:
                            if media_type == "movie":
                                status = check_movie_status(rating_data, platform)
                            else:
                                status = check_tv_status(rating_data, platform)

                            rating_data["status"] = status
                            rating_data["url"] = detail_url

                            if platform in ["rottentomatoes", "metacritic"]:
                                if "series" in rating_data:
                                    rating_data["series"]["status"] = status
                                if "seasons" in rating_data:
                                    for season in rating_data["seasons"]:
                                        season["status"] = status
                        else:
                            rating_data = create_empty_rating_data(platform, media_type, RATING_STATUS["NO_RATING"])

                    except Exception as e:
                        print(f"提取{platform}评分数据时出错: {e}")
                        print(traceback.format_exc())
                        rating_data = create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])

                    return rating_data

                finally:
                    if context:
                        try:
                            await context.close()
                        except Exception:
                            pass

            try:
                return await browser_pool.execute_in_browser(extract_with_browser)
            except Exception as e:
                print(f"访问{platform}详情页时出错: {e}")
                print(traceback.format_exc())
                return create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])

        except Exception as e:
            print(f"执行评分提取时出错: {e}")
            print(traceback.format_exc())
            return create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])

    return await _extract_rating_with_retry()

async def get_douban_rating_via_api(douban_id: str, douban_cookie: str = None) -> dict:
    """使用豆瓣移动端API获取评分（避免限流）"""
    try:
        import aiohttp
        
        url = f"https://m.douban.com/rexxar/api/v2/movie/{douban_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
            'Referer': f'https://m.douban.com/movie/subject/{douban_id}/'
        }
        
        if douban_cookie:
            headers['Cookie'] = douban_cookie
            print(f"✅ 豆瓣API使用用户自定义Cookie（长度: {len(douban_cookie)}）")
        else:
            print("⚠️ 豆瓣API未提供Cookie，使用默认方式")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=10, ssl=False) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    rating = data.get('rating', {})
                    rating_value = rating.get('value')
                    rating_count = rating.get('count')
                    
                    if rating_value and rating_count:
                        print(f"从豆瓣API获取到评分: {rating_value}, 人数: {rating_count}")
                        return {
                            "rating": str(rating_value),
                            "rating_people": str(rating_count),
                            "status": RATING_STATUS["SUCCESSFUL"]
                        }
                    else:
                        print("豆瓣API返回数据但无评分")
                        return {
                            "rating": "暂无",
                            "rating_people": "暂无",
                            "status": RATING_STATUS["NO_RATING"]
                        }
                else:
                    print(f"豆瓣API请求失败: {response.status}")
                    return None
                    
    except Exception as e:
        print(f"豆瓣API调用失败: {e}")
        return None

async def extract_douban_rating(page, media_type, matched_results):
    """从豆瓣详情页提取评分数据"""
    try:
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception as e:
            print(f"豆瓣等待domcontentloaded超时或失败，继续尝试直接解析: {e}")
        content = None
        for attempt in range(2):
            try:
                content = await page.content()
                if content:
                    break
            except Exception as e:
                print(f"豆瓣获取页面内容失败，第{attempt+1}次重试: {e}")
                await asyncio.sleep(0.3)
        if not content:
            return create_empty_rating_data("douban", media_type, RATING_STATUS["TIMEOUT"])
        
        json_match = re.search(r'"aggregateRating":\s*{\s*"@type":\s*"AggregateRating",\s*"ratingCount":\s*"([^"]+)",\s*"bestRating":\s*"([^"]+)",\s*"worstRating":\s*"([^"]+)",\s*"ratingValue":\s*"([^"]+)"', content)
        
        if json_match:
            rating_people = json_match.group(1)
            rating = json_match.group(4)
            print(f"豆瓣评分获取成功")
        else:
            rating_match = re.search(r'<strong[^>]*class="ll rating_num"[^>]*>([^<]*)</strong>', content)
            rating = rating_match.group(1).strip() if rating_match and rating_match.group(1).strip() else "暂无"
            
            people_match = re.search(r'<span[^>]*property="v:votes">(\d+)</span>', content)
            rating_people = people_match.group(1) if people_match else "暂无"
            print(f"豆瓣评分获取成功")
            
        if media_type != "tv":
            if "暂无评分" in content or "尚未上映" in content:
                return create_empty_rating_data("douban", media_type, RATING_STATUS["NO_RATING"])
            
            if rating in [None, "暂无"] or rating_people in [None, "暂无"]:
                return create_empty_rating_data("douban", media_type, RATING_STATUS["FETCH_FAILED"])
                
            return {
                "status": RATING_STATUS["SUCCESSFUL"],
                "rating": rating,
                "rating_people": rating_people
            }
            
        season_results = []
        for result in matched_results:
            title = result.get("title", "")
            season_match = re.search(r'第([一二三四五六七八九十百]+)季|Season\s*(\d+)', title, re.IGNORECASE)
            if season_match:
                chinese_season = season_match.group(1) if season_match.group(1) else None
                arabic_season = season_match.group(2) if len(season_match.groups()) > 1 else None
                
                season_number = chinese_to_arabic(chinese_season) if chinese_season else int(arabic_season) if arabic_season else None
                
                if season_number:
                    season_results.append({
                        "season_number": season_number,
                        "title": title,
                        "url": result.get("url")
                    })
        
        season_results.sort(key=lambda x: x["season_number"])
        
        if not season_results:
            if "暂无评分" in content or "尚未上映" in content:
                return create_empty_rating_data("douban", media_type, RATING_STATUS["NO_RATING"])
            
            if rating in [None, "暂无"] or rating_people in [None, "暂无"]:
                return create_empty_rating_data("douban", media_type, RATING_STATUS["FETCH_FAILED"])
                
            return {
                "status": RATING_STATUS["SUCCESSFUL"],
                "rating": rating,
                "rating_people": rating_people
            }
        
        ratings = {
            "status": RATING_STATUS["SUCCESSFUL"],
            "seasons": []
        }
        
        all_seasons_no_rating = True
        processed_seasons = set()
        
        for season_info in season_results:
            try:
                season_number = season_info["season_number"]
                
                if season_number in processed_seasons:
                    continue
                    
                processed_seasons.add(season_number)
                
                url = season_info["url"]
                if not url:
                    continue

                await random_delay()
                
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                    await asyncio.sleep(0.2)
                except Exception as e:
                    print(f"豆瓣访问第{season_number}季页面失败: {e}")
                    continue
                
                try:
                    season_content = await page.content()
                except Exception as e:
                    print(f"豆瓣获取第{season_number}季页面内容失败: {e}")
                    continue
                
                for attempt in range(3):
                    try:
                        json_match = re.search(r'"aggregateRating":\s*{\s*"@type":\s*"AggregateRating",\s*"ratingCount":\s*"([^"]+)",\s*"bestRating":\s*"([^"]+)",\s*"worstRating":\s*"([^"]+)",\s*"ratingValue":\s*"([^"]+)"', season_content)
                        
                        if json_match:
                            season_rating_people = json_match.group(1)
                            season_rating = json_match.group(4)
                            print(f"豆瓣提取到第{season_number}季评分成功")
                        else:
                            season_rating = await page.evaluate('''() => {
                                const ratingElement = document.querySelector('strong.rating_num');
                                return ratingElement ? ratingElement.textContent.trim() : "暂无";
                            }''')
                            
                            season_rating_people = await page.evaluate('''() => {
                                const votesElement = document.querySelector('span[property="v:votes"]');
                                return votesElement ? votesElement.textContent.trim() : "暂无";
                            }''')
                            
                            if season_rating in ["暂无", "", None]:
                                rating_match = re.search(r'<strong[^>]*class="ll rating_num"[^>]*>([^<]*)</strong>', season_content)
                                if rating_match and rating_match.group(1).strip():
                                    season_rating = rating_match.group(1).strip()
                                
                            if season_rating_people in ["暂无", "", None]:
                                people_match = re.search(r'<span[^>]*property="v:votes">(\d+)</span>', season_content)
                                if people_match:
                                    season_rating_people = people_match.group(1)
                            
                            print(f"豆瓣使用备选方法提取第{season_number}季评分成功")
                        
                        if season_rating not in ["暂无", "", None] and season_rating_people not in ["暂无", "", None]:
                            break
                            
                    except Exception as e:
                        print(f"豆瓣第{attempt + 1}次尝试获取第{season_number}季评分失败: {e}")
                        if attempt < 2:
                            await random_delay()
                            await page.reload()
                            await page.wait_for_load_state("networkidle", timeout=5000)
                            season_content = await page.content()
                            continue
                
                if "暂无评分" in season_content or "尚未上映" in season_content:
                    ratings["seasons"].append({
                        "season_number": season_number,
                        "rating": "暂无",
                        "rating_people": "暂无",
                        "url": url
                    })
                else:
                    if season_rating not in ["暂无", "", None] and season_rating_people not in ["暂无", "", None]:
                        all_seasons_no_rating = False
                        ratings["seasons"].append({
                            "season_number": season_number,
                            "rating": season_rating,
                            "rating_people": season_rating_people,
                            "url": url
                        })
                    else:
                        continue
                
            except Exception as e:
                print(f"豆瓣获取第{season_number}季评分时出错: {e}")
                if "Timeout" in str(e):
                    print(f"豆瓣第{season_number}季访问超时，跳过此季")
                continue
        
        if not ratings["seasons"] and rating not in [None, "暂无"] and rating_people not in [None, "暂无"]:
            return {
                "status": RATING_STATUS["SUCCESSFUL"],
                "rating": rating,
                "rating_people": rating_people
            }
        
        if all_seasons_no_rating and ratings["seasons"]:
            ratings["status"] = RATING_STATUS["NO_RATING"]
        elif not ratings["seasons"]:
            ratings["status"] = RATING_STATUS["FETCH_FAILED"]
            
        return ratings
            
    except Exception as e:
        print(f"提取豆瓣评分数据时出错: {e}")
        return create_empty_rating_data("douban", media_type, RATING_STATUS["FETCH_FAILED"])

async def get_imdb_rating_via_graphql(imdb_id: str) -> dict:
    """使用IMDB GraphQL API获取评分（速度更快）"""
    try:
        import aiohttp
        
        url = "https://caching.graphql.imdb.com/"
        
        query = """
        query GetRating($id: ID!) {
            title(id: $id) {
                id
                titleText {
                    text
                }
                ratingsSummary {
                    aggregateRating
                    voteCount
                }
                releaseYear {
                    year
                }
            }
        }
        """
        
        payload = {
            "query": query,
            "variables": {"id": imdb_id}
        }
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": "https://www.imdb.com",
            "Referer": "https://www.imdb.com/",
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers, timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if data.get("data") and data["data"].get("title"):
                        title_data = data["data"]["title"]
                        ratings = title_data.get("ratingsSummary", {})
                        
                        rating = ratings.get("aggregateRating")
                        vote_count = ratings.get("voteCount")
                        
                        if rating is not None and vote_count is not None:
                            print(f"IMDb GraphQL API评分获取成功")
                            return {
                                "rating": str(rating),
                                "rating_people": str(vote_count),
                                "status": RATING_STATUS["SUCCESSFUL"]
                            }
                    
                    print("IMDb GraphQL API返回数据但无评分")
                    return None
                else:
                    print(f"IMDb GraphQL API请求失败: {response.status}")
                    return None
                    
    except Exception as e:
        print(f"IMDb GraphQL API调用失败: {e}")
        return None

async def extract_imdb_rating(page):
    """从IMDB详情页提取评分数据"""
    try:
        max_attempts = 2
        
        for attempt in range(max_attempts):
            try:
                if attempt == 0:
                    print(f"IMDb快速尝试提取评分...")
                else:
                    print(f"IMDb等待后重试提取评分...")
                    try:
                        await page.wait_for_selector('script[id="__NEXT_DATA__"]', timeout=5000)
                    except Exception as e:
                        print(f"IMDb等待__NEXT_DATA__脚本超时: {e}")
                
                content = await page.content()
                
                json_match = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>\s*({[^<]+})\s*</script>', content)
                
                if json_match:
                    break
                elif attempt < max_attempts - 1:
                    print("IMDb未找到__NEXT_DATA__，等待后重试...")
                    await asyncio.sleep(1)
                    continue
                else:
                    print("未找到IMDB的__NEXT_DATA__脚本")
                    return {
                        "rating": "暂无",
                        "rating_people": "暂无",
                        "status": RATING_STATUS["NO_RATING"]
                    }
                    
            except Exception as e:
                if attempt < max_attempts - 1:
                    print(f"IMDb第{attempt + 1}次提取失败: {e}，重试中...")
                    await asyncio.sleep(1)
                    continue
                raise
            
        try:
            json_data = json.loads(json_match.group(1))
            
            page_props = json_data.get("props", {}).get("pageProps", {})
            above_the_fold = page_props.get("aboveTheFoldData", {})
            ratings_summary = above_the_fold.get("ratingsSummary", {})
            
            aggregate_rating = ratings_summary.get("aggregateRating")
            vote_count = ratings_summary.get("voteCount")
            
            if aggregate_rating is None:
                print("IMDb中未找到评分数据")
                return {
                    "rating": "暂无",
                    "rating_people": "暂无",
                    "status": RATING_STATUS["NO_RATING"]
                }
            
            rating_text = str(aggregate_rating) if aggregate_rating else "暂无"
            rating_people_text = str(vote_count) if vote_count else "暂无"
            
            print(f"IMDb评分获取成功")
            
            return {
                "rating": rating_text,
                "rating_people": rating_people_text
            }
            
        except json.JSONDecodeError as e:
            print(f"解析IMDB JSON数据时出错: {e}")
            return {
                "rating": "暂无",
                "rating_people": "暂无",
                "status": "Fail"
            }

    except Exception as e:
        print(f"提取IMDB评分数据时出错: {e}")
        return {
            "rating": "暂无",
            "rating_people": "暂无",
            "status": "Fail"
        }
        
async def get_rt_rating_fast(page) -> dict:
    """快速从Rotten Tomatoes页面提取JSON数据"""
    try:
        try:
            json_data = await page.evaluate("""
                () => {
                    const script = document.getElementById('media-scorecard-json');
                    return script ? JSON.parse(script.textContent) : null;
                }
            """)
            
            if json_data:
                return json_data
        except Exception as e:
            print(f"Rotten Tomatoes JavaScript提取失败: {e}")
        
        content = await page.content()
        json_match = re.search(r'<script[^>]*id="media-scorecard-json"[^>]*>\s*({[^<]+})\s*</script>', content)
        if json_match:
            import json
            return json.loads(json_match.group(1))
        
        return None
        
    except Exception as e:
        print(f"Rotten Tomatoes快速提取JSON失败: {e}")
        return None

async def extract_rt_rating(page, media_type, tmdb_info):
    """从Rotten Tomatoes详情页提取评分数据"""
    try:
        score_data = await get_rt_rating_fast(page)
        
        if not score_data:
            return create_empty_rating_data("rottentomatoes", media_type, RATING_STATUS["NO_RATING"])
            
        overlay_data = score_data.get("overlay", {})
        
        has_audience = overlay_data.get("hasAudienceAll", False)
        has_critics = overlay_data.get("hasCriticsAll", False)
        
        if not has_audience and not has_critics:
            return create_empty_rating_data("rottentomatoes", media_type, RATING_STATUS["NO_RATING"])
        
        audience_data = overlay_data.get("audienceAll", {})
        critics_data = overlay_data.get("criticsAll", {})
        
        audience_score = "暂无"
        audience_avg = "暂无"
        audience_count = "暂无"
        if has_audience:
            audience_score = audience_data.get("scorePercent", "暂无").rstrip("%") if audience_data.get("scorePercent") else "暂无"
            avg_rating = audience_data.get("averageRating")
            audience_avg = avg_rating if avg_rating and avg_rating not in ["暂无", ""] else "暂无"
            audience_count = audience_data.get("bandedRatingCount", "暂无")
        
        tomatometer = "暂无"
        critics_avg = "暂无"
        critics_count = "暂无"
        if has_critics:
            tomatometer = critics_data.get("scorePercent", "暂无").rstrip("%") if critics_data.get("scorePercent") else "暂无"
            critics_avg = critics_data.get("averageRating", "暂无")
            critics_count = critics_data.get("scoreLinkText", "暂无").split()[0] if critics_data.get("scoreLinkText") else "暂无"
        
        ratings = {
            "series": {
                "tomatometer": tomatometer,
                "audience_score": audience_score,
                "critics_avg": critics_avg,
                "critics_count": critics_count,
                "audience_count": audience_count,
                "audience_avg": audience_avg
            },
            "seasons": [],
            "status": RATING_STATUS["SUCCESSFUL"]
        }
        
        if media_type == "tv":
            content = await page.content()
            if tmdb_info.get("is_anthology"):
                print(f"\n[选集剧]Rotten Tomatoes分季处理")
                tmdb_year = tmdb_info.get("year", "")
                
                season_tiles = re.findall(
                    r'<tile-season[^>]*href="([^"]+)"[^>]*>.*?'
                    r'<rt-text[^>]*slot="title"[^>]*>([^<]+)</rt-text>.*?'
                    r'<rt-text[^>]*slot="airDate"[^>]*>([^<]+)</rt-text>',
                    content,
                    re.DOTALL | re.IGNORECASE
                )
                
                print(f"Rotten Tomatoes解析到 {len(season_tiles)} 个季")
                
                matched_season = None
                for season_url, season_title, season_date in season_tiles:
                    year_match = re.search(r'(\d{4})', season_date)
                    if year_match:
                        season_year = year_match.group(1)
                        if season_year == tmdb_year:
                            season_num_match = re.search(r'/s(\d+)', season_url)
                            if season_num_match:
                                season_number = int(season_num_match.group(1))
                                matched_season = (season_url, season_number, season_title.strip(), season_year)
                                break
                
                if matched_season:
                    season_url, season_number, season_title, season_year = matched_season
                    if not season_url.startswith('http'):
                        season_url = f"https://www.rottentomatoes.com{season_url}"
                    
                    print(f"Rotten Tomatoes访问匹配的季: {season_url}")
                    try:
                        await page.goto(season_url)
                        await asyncio.sleep(0.2)
                        season_content = await page.content()
                        
                        tmdb_season_number = 1
                        
                        season_json_match = re.search(r'<script[^>]*id="media-scorecard-json"[^>]*>\s*({[^<]+})\s*</script>', season_content)
                        if season_json_match:
                            season_score_data = json.loads(season_json_match.group(1))
                            season_overlay = season_score_data.get("overlay", {})
                            
                            season_has_audience = season_overlay.get("hasAudienceAll", False)
                            season_has_critics = season_overlay.get("hasCriticsAll", False)
                            
                            season_audience = season_overlay.get("audienceAll", {})
                            season_critics = season_overlay.get("criticsAll", {})
                            
                            season_data = {
                                "season_number": tmdb_season_number,
                                "tomatometer": "暂无",
                                "audience_score": "暂无",
                                "critics_avg": "暂无",
                                "critics_count": "暂无",
                                "audience_count": "暂无",
                                "audience_avg": "暂无",
                                "_original_season": season_number,
                                "_season_title": season_title,
                                "_season_year": season_year,
                                "url": page.url
                            }
                            
                            if season_has_critics:
                                season_data["tomatometer"] = season_critics.get("scorePercent", "暂无").rstrip("%") if season_critics.get("scorePercent") else "暂无"
                                season_data["critics_avg"] = season_critics.get("averageRating", "暂无")
                                season_data["critics_count"] = season_critics.get("scoreLinkText", "暂无").split()[0] if season_critics.get("scoreLinkText") else "暂无"
                            
                            if season_has_audience:
                                season_data["audience_score"] = season_audience.get("scorePercent", "暂无").rstrip("%") if season_audience.get("scorePercent") else "暂无"
                                season_data["audience_avg"] = season_audience.get("averageRating", "暂无")
                                season_data["audience_count"] = season_audience.get("bandedRatingCount", "暂无")
                            
                            ratings["seasons"].append(season_data)
                            print(f"Rotten Tomatoes评分获取成功")
                    
                    except Exception as e:
                        print(f"Rotten Tomatoes获取Season {season_number}评分数据时出错: {e}")
                else:
                    print(f"Rotten Tomatoes未找到与年份{tmdb_year}匹配的季")
            
            elif tmdb_info.get("number_of_seasons", 0) == 1:
                print(f"\n[单季剧]Rotten Tomatoes分季处理")
                season_tiles = re.findall(
                    r'<tile-season[^>]*href="([^"]+)"[^>]*>',
                    content,
                    re.DOTALL | re.IGNORECASE
                )
                
                if season_tiles:
                    season_url = season_tiles[0]
                    if not season_url.startswith('http'):
                        season_url = f"https://www.rottentomatoes.com{season_url}"
                    
                    print(f"Rotten Tomatoes访问第一季: {season_url}")
                    try:
                        await page.goto(season_url)
                        await asyncio.sleep(0.2)
                        season_content = await page.content()
                        
                        season_json_match = re.search(r'<script[^>]*id="media-scorecard-json"[^>]*>\s*({[^<]+})\s*</script>', season_content)
                        if season_json_match:
                            season_score_data = json.loads(season_json_match.group(1))
                            season_overlay = season_score_data.get("overlay", {})
                            
                            season_has_audience = season_overlay.get("hasAudienceAll", False)
                            season_has_critics = season_overlay.get("hasCriticsAll", False)
                            
                            if season_has_audience or season_has_critics:
                                season_audience = season_overlay.get("audienceAll", {})
                                season_critics = season_overlay.get("criticsAll", {})
                                
                                season_data = {
                                    "season_number": 1,
                                    "tomatometer": "暂无",
                                    "audience_score": "暂无",
                                    "critics_avg": "暂无",
                                    "critics_count": "暂无",
                                    "audience_count": "暂无",
                                    "audience_avg": "暂无",
                                    "url": season_url
                                }
                                
                                if season_has_critics:
                                    season_data["tomatometer"] = season_critics.get("scorePercent", "暂无").rstrip("%") if season_critics.get("scorePercent") else "暂无"
                                    season_data["critics_avg"] = season_critics.get("averageRating", "暂无")
                                    season_data["critics_count"] = season_critics.get("scoreLinkText", "暂无").split()[0] if season_critics.get("scoreLinkText") else "暂无"
                                
                                if season_has_audience:
                                    season_data["audience_score"] = season_audience.get("scorePercent", "暂无").rstrip("%") if season_audience.get("scorePercent") else "暂无"
                                    season_data["audience_avg"] = season_audience.get("averageRating", "暂无")
                                    season_data["audience_count"] = season_audience.get("bandedRatingCount", "暂无")
                                
                                ratings["seasons"].append(season_data)
                                print(f"Rotten Tomatoes评分获取成功")
                    
                    except Exception as e:
                        print(f"Rotten Tomatoes获取单季剧评分数据时出错: {e}")
                else:
                    print(f"Rotten Tomatoes未找到分季数据")
            
            elif tmdb_info.get("number_of_seasons", 0) > 1:
                print(f"\n[多季剧]Rotten Tomatoes分季处理")
                base_url = page.url.split("/tv/")[1].split("/")[0]
                
                for season in range(1, tmdb_info.get("number_of_seasons", 0) + 1):
                    try:
                        season_url = f"https://www.rottentomatoes.com/tv/{base_url}/s{str(season).zfill(2)}"
                        await page.goto(season_url)
                        season_content = await page.content()
                        
                        season_json_match = re.search(r'<script[^>]*id="media-scorecard-json"[^>]*>\s*({[^<]+})\s*</script>', season_content)
                        if not season_json_match:
                            continue
                            
                        season_score_data = json.loads(season_json_match.group(1))
                        season_overlay = season_score_data.get("overlay", {})
                        
                        season_has_audience = season_overlay.get("hasAudienceAll", False)
                        season_has_critics = season_overlay.get("hasCriticsAll", False)
                        
                        if not season_has_audience and not season_has_critics:
                            continue
                            
                        season_audience = season_overlay.get("audienceAll", {})
                        season_critics = season_overlay.get("criticsAll", {})
                        
                        season_tomatometer = "暂无"
                        season_critics_avg = "暂无"
                        season_critics_count = "暂无"
                        season_audience_avg = "暂无"
                        if season_has_critics:
                            season_tomatometer = season_critics.get("scorePercent", "暂无").rstrip("%") if season_critics.get("scorePercent") else "暂无"
                            season_critics_avg = season_critics.get("averageRating", "暂无")
                            season_critics_count = season_critics.get("scoreLinkText", "暂无").split()[0] if season_critics.get("scoreLinkText") else "暂无"
                            
                        season_audience_score = "暂无"
                        season_audience_avg = "暂无"
                        season_audience_count = "暂无"
                        if season_has_audience:
                            season_audience_score = season_audience.get("scorePercent", "暂无").rstrip("%") if season_audience.get("scorePercent") else "暂无"
                            avg_rating = season_audience.get("averageRating")
                            season_audience_avg = avg_rating if avg_rating and avg_rating not in ["暂无", ""] else "暂无"
                            season_audience_count = season_audience.get("bandedRatingCount", "暂无")
                        
                        season_data = {
                            "season_number": season,
                            "tomatometer": season_tomatometer,
                            "audience_score": season_audience_score,
                            "critics_avg": season_critics_avg,
                            "audience_avg": season_audience_avg,
                            "critics_count": season_critics_count,
                            "audience_count": season_audience_count,
                            "url": season_url
                        }
                        
                        ratings["seasons"].append(season_data)
                        print(f"Rotten Tomatoes第{season}季评分获取成功")
                        
                    except Exception as e:
                        print(f"Rotten Tomatoes获取第{season}季评分数据时出错: {e}")
                        continue
                        
        return ratings
        
    except Exception as e:
        print(f"获取 Rotten Tomatoes 评分数据时出错: {e}")
        return create_empty_rating_data("rottentomatoes", media_type, RATING_STATUS["FETCH_FAILED"])

async def get_metacritic_rating_via_json(page) -> dict:
    """从Metacritic页面的JSON数据中提取评分"""
    try:
        content = await page.content()
        
        json_ld_match = re.search(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', content, re.DOTALL)
        if json_ld_match:
            try:
                import json
                json_data = json.loads(json_ld_match.group(1))
                
                if isinstance(json_data, dict) and 'aggregateRating' in json_data:
                    agg_rating = json_data['aggregateRating']
                    
                    rating_value = agg_rating.get('ratingValue')
                    rating_count = agg_rating.get('ratingCount')
                    
                    if rating_value and rating_count:
                        print(f"Metacritic评分获取成功")
                        return {
                            "metascore": str(rating_value),
                            "critics_count": str(rating_count),
                            "source": "json_ld"
                        }
            except Exception as e:
                print(f"Metacritic解析JSON-LD失败: {e}")
        
        react_data_match = re.search(r'window\.__REACT_DATA__\s*=\s*({.*?});', content, re.DOTALL)
        if react_data_match:
            try:
                import json
                react_data = json.loads(react_data_match.group(1))
                
                if 'criticScoreSummary' in react_data:
                    summary = react_data['criticScoreSummary']
                    metascore = summary.get('score')
                    critics_count = summary.get('reviewCount')
                    
                    if metascore and critics_count:
                        print(f"Metacritic评分获取成功")
                        return {
                            "metascore": str(metascore),
                            "critics_count": str(critics_count),
                            "source": "react_data"
                        }
            except Exception as e:
                print(f"Metacritic解析React数据失败: {e}")
        
        return None
        
    except Exception as e:
        print(f"Metacritic JSON提取失败: {e}")
        return None

async def extract_metacritic_rating(page, media_type, tmdb_info):
    """从Metacritic详情页提取评分数据"""
    try:
        json_rating = await get_metacritic_rating_via_json(page)
        
        content = await page.content()
        
        ratings = {
            "overall": {
                "metascore": "暂无",
                "critics_count": "暂无", 
                "userscore": "暂无",
                "users_count": "暂无"
            },
            "seasons": []
        }
        
        if json_rating:
            if json_rating.get("metascore"):
                ratings["overall"]["metascore"] = json_rating["metascore"]
            if json_rating.get("critics_count"):
                ratings["overall"]["critics_count"] = json_rating["critics_count"]

        if ratings["overall"]["metascore"] == "暂无":
            metascore_match = re.search(r'title="Metascore (\d+) out of 100"', content)
            if metascore_match:
                ratings["overall"]["metascore"] = metascore_match.group(1)
            else:
                metascore_elem = await page.query_selector('div[data-v-e408cafe][title*="Metascore"] span')
                if metascore_elem:
                    metascore_text = await metascore_elem.inner_text()
                    if metascore_text and metascore_text.lower() != 'tbd':
                        ratings["overall"]["metascore"] = metascore_text

        if ratings["overall"]["critics_count"] == "暂无":
            critics_count_match = re.search(r'Based on (\d+) Critic Reviews?', content)
            if critics_count_match:
                ratings["overall"]["critics_count"] = critics_count_match.group(1)
            else:
                critics_count_elem = await page.query_selector('a[data-testid="critic-path"] span')
                if critics_count_elem:
                    critics_text = await critics_count_elem.inner_text()
                    match = re.search(r'Based on (\d+) Critic', critics_text)
                    if match:
                        ratings["overall"]["critics_count"] = match.group(1)

        userscore_match = re.search(r'title="User score ([\d.]+) out of 10"', content)
        if userscore_match:
            ratings["overall"]["userscore"] = userscore_match.group(1)
        else:
            userscore_elem = await page.query_selector('div[data-v-e408cafe][title*="User score"] span')
            if userscore_elem:
                userscore_text = await userscore_elem.inner_text()
                if userscore_text and userscore_text.lower() != 'tbd':
                    ratings["overall"]["userscore"] = userscore_text

        users_count_match = re.search(r'Based on ([\d,]+) User Ratings?', content)
        if users_count_match:
            ratings["overall"]["users_count"] = users_count_match.group(1).replace(',', '')
        else:
            users_count_elem = await page.query_selector('a[data-testid="user-path"] span')
            if users_count_elem:
                users_text = await users_count_elem.inner_text()
                match = re.search(r'Based on ([\d,]+) User', users_text)
                if match:
                    ratings["overall"]["users_count"] = match.group(1).replace(',', '')
        
        print(f"Metacritic评分获取成功")

        if media_type == "tv":
            if tmdb_info.get("is_anthology"):
                print(f"\n[选集剧]Metacritic分季处理")
                tmdb_year = tmdb_info.get("year", "")
                
                season_cards = re.findall(
                    r'<div[^>]*data-testid="seasons-modal-card"[^>]*>.*?'
                    r'<a href="([^"]+)".*?'
                    r'SEASON\s+(\d+).*?'
                    r'<span>\s*(\d{4})\s*</span>',
                    content,
                    re.DOTALL | re.IGNORECASE
                )
                
                print(f"Metacritic解析到 {len(season_cards)} 个季")
                
                matched_season = None
                for season_url, season_num, season_year in season_cards:
                    if season_year == tmdb_year:
                        matched_season = (season_url, int(season_num), season_year)
                        break
                
                if matched_season:
                    season_url, season_number, season_year = matched_season
                    if not season_url.startswith('http'):
                        season_url = f"https://www.metacritic.com{season_url}"
                    
                    print(f"Metacritic访问匹配的季: {season_url}")
                    try:
                        await page.goto(season_url, wait_until='networkidle')
                        await asyncio.sleep(0.5)

                        tmdb_season_number = 1
                        
                        season_data = {
                            "season_number": tmdb_season_number,
                            "metascore": "暂无",
                            "critics_count": "暂无",
                            "userscore": "暂无",
                            "users_count": "暂无",
                            "_original_season": season_number,
                            "_season_year": season_year,
                            "url": season_url
                        }

                        season_content = await page.content()
                        
                        season_metascore_match = re.search(r'title="Metascore (\d+) out of 100"', season_content)
                        if season_metascore_match:
                            season_data["metascore"] = season_metascore_match.group(1)
                        
                        season_critics_count_match = re.search(r'Based on (\d+) Critic Reviews?', season_content)
                        if season_critics_count_match:
                            season_data["critics_count"] = season_critics_count_match.group(1)
                        
                        season_userscore_match = re.search(r'title="User score ([\d.]+) out of 10"', season_content)
                        if season_userscore_match:
                            season_data["userscore"] = season_userscore_match.group(1)
                        
                        season_users_count_match = re.search(r'Based on ([\d,]+) User Ratings?', season_content)
                        if season_users_count_match:
                            season_data["users_count"] = season_users_count_match.group(1).replace(',', '')

                        ratings["seasons"].append(season_data)
                        print(f"Metacritic评分获取成功")

                    except Exception as e:
                        print(f"Metacritic获取Season {season_number}评分数据时出错: {e}")
                else:
                    print(f"Metacritic未找到与年份{tmdb_year}匹配的季")
            
            elif tmdb_info.get("number_of_seasons", 0) == 1:
                print(f"\n[单季剧集]Metacritic分季处理")
                season_cards = re.findall(
                    r'<div[^>]*data-testid="seasons-modal-card"[^>]*>.*?'
                    r'<a href="([^"]+)"',
                    content,
                    re.DOTALL | re.IGNORECASE
                )
                
                if season_cards:
                    season_url = season_cards[0]
                    if not season_url.startswith('http'):
                        season_url = f"https://www.metacritic.com{season_url}"
                    
                    print(f"Metacritic访问第一季: {season_url}")
                    try:
                        await page.goto(season_url, wait_until='networkidle')
                        await asyncio.sleep(0.5)
                        
                        season_data = {
                            "season_number": 1,
                            "metascore": "暂无",
                            "critics_count": "暂无",
                            "userscore": "暂无",
                            "users_count": "暂无",
                            "url": season_url
                        }

                        season_content = await page.content()
                        
                        season_metascore_match = re.search(r'title="Metascore (\d+) out of 100"', season_content)
                        if season_metascore_match:
                            season_data["metascore"] = season_metascore_match.group(1)
                        
                        season_critics_count_match = re.search(r'Based on (\d+) Critic Reviews?', season_content)
                        if season_critics_count_match:
                            season_data["critics_count"] = season_critics_count_match.group(1)
                        
                        season_userscore_match = re.search(r'title="User score ([\d.]+) out of 10"', season_content)
                        if season_userscore_match:
                            season_data["userscore"] = season_userscore_match.group(1)
                        
                        season_users_count_match = re.search(r'Based on ([\d,]+) User Ratings?', season_content)
                        if season_users_count_match:
                            season_data["users_count"] = season_users_count_match.group(1).replace(',', '')

                        ratings["seasons"].append(season_data)
                        print(f"Metacritic评分获取成功")

                    except Exception as e:
                        print(f"Metacritic获取单季剧评分数据时出错: {e}")
                else:
                    print(f"Metacritic未找到分季数据")
            
            elif tmdb_info.get("number_of_seasons", 0) > 1:
                print(f"\n[多季剧集]Metacritic分季处理")
                base_url = page.url.rstrip('/')
                
                for season in tmdb_info.get("seasons", []):
                    season_number = season.get("season_number")
                    try:
                        season_url = f"{base_url}/season-{season_number}/"
                        await page.goto(season_url, wait_until='networkidle')
                        await asyncio.sleep(0.5)

                        season_data = {
                            "season_number": season_number,
                            "metascore": "暂无",
                            "critics_count": "暂无",
                            "userscore": "暂无",
                            "users_count": "暂无",
                            "url": season_url
                        }

                        season_content = await page.content()
                        
                        season_metascore_match = re.search(r'title="Metascore (\d+) out of 100"', season_content)
                        if season_metascore_match:
                            season_data["metascore"] = season_metascore_match.group(1)
                        
                        season_critics_count_match = re.search(r'Based on (\d+) Critic Reviews?', season_content)
                        if season_critics_count_match:
                            season_data["critics_count"] = season_critics_count_match.group(1)
                        
                        season_userscore_match = re.search(r'title="User score ([\d.]+) out of 10"', season_content)
                        if season_userscore_match:
                            season_data["userscore"] = season_userscore_match.group(1)
                        
                        season_users_count_match = re.search(r'Based on ([\d,]+) User Ratings?', season_content)
                        if season_users_count_match:
                            season_data["users_count"] = season_users_count_match.group(1).replace(',', '')

                        ratings["seasons"].append(season_data)
                        print(f"Metacritic第{season_number}季评分获取成功")

                    except Exception as e:
                        print(f"Metacritic获取第{season_number}季评分数据时出错: {e}")
                        continue

        all_no_rating = all(
            value == "暂无" or value == "tbd" 
            for value in [
                ratings["overall"]["metascore"],
                ratings["overall"]["critics_count"],
                ratings["overall"]["userscore"],
                ratings["overall"]["users_count"]
            ]
        )
        
        ratings["status"] = (
            RATING_STATUS["NO_RATING"] if all_no_rating
            else RATING_STATUS["SUCCESSFUL"]
        )

        return ratings

    except Exception as e:
        print(f"提取Metacritic评分数据时出错: {e}")
        return create_empty_rating_data("metacritic", media_type, RATING_STATUS["FETCH_FAILED"])

async def extract_letterboxd_rating(page):
    """从Letterboxd详情页提取评分数据"""
    try:
        content = await page.content()
        
        json_match = re.search(r'"aggregateRating":\s*{\s*"bestRating":\s*(\d+),\s*"reviewCount":\s*(\d+),\s*"@type":\s*"aggregateRating",\s*"ratingValue":\s*([\d.]+),\s*"description":\s*"[^"]*",\s*"ratingCount":\s*(\d+),\s*"worstRating":\s*(\d+)\s*}', content)
        
        if json_match:
            rating = json_match.group(3)
            rating_count = json_match.group(4)
            print(f"Letterboxd评分获取成功")
            
            return {
                "rating": rating,
                "rating_count": rating_count,
                "status": RATING_STATUS["SUCCESSFUL"]
            }
        else:            
            rating_elem = await page.query_selector('span.average-rating a.tooltip')
            
            if not rating_elem:
                print("Letterboxd 未找到评分元素")
                return {
                    "rating": "暂无",
                    "rating_count": "暂无",
                    "status": RATING_STATUS["NO_RATING"]
                }
                
            rating = await rating_elem.inner_text()
            
            tooltip = await rating_elem.get_attribute('data-original-title')
            if tooltip:
                match = re.search(r'based on ([\d,]+)', tooltip)
                rating_count = match.group(1).replace(',', '') if match else "暂无"
            else:
                rating_count = "暂无"
            
            print(f"Letterboxd评分获取成功")
            
            return {
                "rating": rating,
                "rating_count": rating_count,
                "status": RATING_STATUS["SUCCESSFUL"]
            }
            
    except Exception as e:
        print(f"提取Letterboxd评分数据时出错: {e}")
        return {
            "rating": "暂无",
            "rating_count": "暂无",
            "status": "Fail"
        }
        
def check_movie_status(platform_data, platform):
    """检查电影评分数据的状态"""
    if not platform_data:
        return RATING_STATUS["FETCH_FAILED"]
        
    if "status" in platform_data:
        return platform_data["status"]
        
    if platform == "douban":
        if platform_data.get("rating") == "暂无" and platform_data.get("rating_people") == "暂无":
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if (platform_data.get("rating") not in [None, "暂无"] and 
                                            platform_data.get("rating_people") not in [None, "暂无"]) else RATING_STATUS["FETCH_FAILED"]
        
    elif platform == "imdb":
        if platform_data.get("rating") == "暂无" and platform_data.get("rating_people") == "暂无":
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if (platform_data.get("rating") not in [None, "暂无", "N/A"] and 
                                            platform_data.get("rating_people") not in [None, "暂无", "N/A"]) else RATING_STATUS["FETCH_FAILED"]
        
    elif platform == "rottentomatoes":
        series_data = platform_data.get("series", {})
        required_fields = ["tomatometer", "audience_score", "critics_avg", "critics_count", "audience_count", "audience_avg"]
        all_no_rating = all(series_data.get(key) == "暂无" for key in required_fields)
        if all_no_rating:
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if all(series_data.get(key) not in [None, "暂无"] for key in required_fields) else RATING_STATUS["FETCH_FAILED"]
        
    elif platform == "metacritic":
        overall_data = platform_data.get("overall", {})
        required_fields = ["metascore", "critics_count", "userscore", "users_count"]
        all_no_rating = all(overall_data.get(key) == "暂无" for key in required_fields)
        if all_no_rating:
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if all(overall_data.get(key) not in [None, "暂无"] for key in required_fields) else RATING_STATUS["FETCH_FAILED"]
    
    elif platform == "letterboxd":
        if platform_data.get("rating") == "暂无" and platform_data.get("rating_count") == "暂无":
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if (platform_data.get("rating") not in [None, "暂无"] and 
                                            platform_data.get("rating_count") not in [None, "暂无"]) else RATING_STATUS["FETCH_FAILED"]
    
    elif platform == "trakt":
        if platform_data.get("rating") == "暂无" and platform_data.get("votes") == "暂无":
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if (platform_data.get("rating") not in [None, "暂无"] and 
                                            platform_data.get("votes") not in [None, "暂无"]) else RATING_STATUS["FETCH_FAILED"]
    
    return RATING_STATUS["FETCH_FAILED"]

def check_tv_status(platform_data, platform):
    """检查剧集评分数据的状态"""
    if not platform_data:
        return RATING_STATUS["FETCH_FAILED"]
        
    if "status" in platform_data:
        return platform_data["status"]
        
    if platform == "douban":
        seasons = platform_data.get("seasons", [])
        if not seasons:
            return RATING_STATUS["FETCH_FAILED"]
            
        all_no_rating = all(
            season.get("rating") == "暂无" and season.get("rating_people") == "暂无"
            for season in seasons
        )
        if all_no_rating:
            return RATING_STATUS["NO_RATING"]
            
        for season in seasons:
            season_fields = ["rating", "rating_people"]
            if not all(season.get(key) not in [None, "暂无"] for key in season_fields):
                return RATING_STATUS["FETCH_FAILED"]
        return RATING_STATUS["SUCCESSFUL"]
        
    elif platform == "imdb":
        if platform_data.get("rating") == "暂无" and platform_data.get("rating_people") == "暂无":
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if (platform_data.get("rating") not in [None, "暂无", "N/A"] and 
                                            platform_data.get("rating_people") not in [None, "暂无", "N/A"]) else RATING_STATUS["FETCH_FAILED"]
        
    elif platform == "rottentomatoes":
        series_data = platform_data.get("series", {})
        seasons_data = platform_data.get("seasons", [])
        
        series_fields = ["tomatometer", "audience_score", "critics_avg", "critics_count", "audience_count", "audience_avg"]
        all_series_no_rating = all(series_data.get(key) in ["暂无", "tbd"] for key in series_fields)
        
        all_seasons_no_rating = all(
            all(season.get(key) in ["暂无", "tbd"] for key in ["tomatometer", "audience_score", "critics_avg", "audience_avg", "critics_count", "audience_count"])
            for season in seasons_data
        )
        
        if all_series_no_rating and all_seasons_no_rating:
            return RATING_STATUS["NO_RATING"]
            
        if not all(series_data.get(key) not in [None, "出错"] for key in series_fields):
            return RATING_STATUS["FETCH_FAILED"]
            
        for season in seasons_data:
            season_fields = ["tomatometer", "audience_score", "critics_avg", "audience_avg", "critics_count", "audience_count"]
            if not all(season.get(key) in ["暂无", "tbd"] or season.get(key) not in [None, "出错"] for key in season_fields):
                return RATING_STATUS["FETCH_FAILED"]
        return RATING_STATUS["SUCCESSFUL"]
        
    elif platform == "metacritic":
        overall_data = platform_data.get("overall", {})
        seasons_data = platform_data.get("seasons", [])
        
        overall_fields = ["metascore", "critics_count", "userscore", "users_count"]
        all_overall_no_rating = all(overall_data.get(key) in ["暂无", "tbd"] for key in overall_fields)
        
        all_seasons_no_rating = all(
            all(season.get(key) in ["暂无", "tbd"] for key in ["metascore", "critics_count", "userscore", "users_count"])
            for season in seasons_data
        )
        
        if all_overall_no_rating and all_seasons_no_rating:
            return RATING_STATUS["NO_RATING"]
            
        if not all(overall_data.get(key) not in [None, "出错"] for key in overall_fields):
            return RATING_STATUS["FETCH_FAILED"]
            
        for season in seasons_data:
            season_fields = ["metascore", "critics_count", "userscore", "users_count"]
            if not all(season.get(key) in ["暂无", "tbd"] or season.get(key) not in [None, "出错"] for key in season_fields):
                return RATING_STATUS["FETCH_FAILED"]
        return RATING_STATUS["SUCCESSFUL"]
    
    elif platform == "letterboxd":
        if platform_data.get("rating") == "暂无" and platform_data.get("rating_count") == "暂无":
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if (platform_data.get("rating") not in [None, "暂无"] and 
                                            platform_data.get("rating_count") not in [None, "暂无"]) else RATING_STATUS["FETCH_FAILED"]
    
    elif platform == "trakt":
        if platform_data.get("rating") == "暂无" and platform_data.get("votes") == "暂无":
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if (platform_data.get("rating") not in [None, "暂无"] and 
                                            platform_data.get("votes") not in [None, "暂无"]) else RATING_STATUS["FETCH_FAILED"]
    
    return RATING_STATUS["FETCH_FAILED"]

def create_empty_rating_data(platform, media_type, status):
    """创建带有状态的空评分数据结构"""
    if platform == "douban":
        return {
            "seasons": [] if media_type == "tv" else None,
            "rating": "暂无",
            "rating_people": "暂无",
            "status": status
        }
    elif platform == "imdb":
        return {
            "rating": "暂无",
            "rating_people": "暂无",
            "status": status
        }
    elif platform == "letterboxd":
        return {
            "rating": "暂无",
            "rating_count": "暂无",
            "status": status
        }
    elif platform == "rottentomatoes":
        return {
            "series": {
                "tomatometer": "暂无",
                "audience_score": "暂无",
                "critics_avg": "暂无",
                "critics_count": "暂无",
                "audience_count": "暂无",
                "audience_avg": "暂无",
                "status": status
            },
            "seasons": [],
            "status": status
        }
    elif platform == "metacritic":
        return {
            "overall": {
                "metascore": "暂无",
                "critics_count": "暂无",
                "userscore": "暂无",
                "users_count": "暂无",
                "status": status
            },
            "seasons": [],
            "status": status
        }
    elif platform == "trakt":
        return {
            "rating": "暂无",
            "votes": "暂无",
            "distribution": {},
            "url": "",
            "status": status
        }

def create_error_rating_data(platform, media_type="movie", status=RATING_STATUS["FETCH_FAILED"], status_reason="获取失败"):
    """为出错的平台创建数据结构    
    Args:
        platform: 平台名称
        media_type: 媒体类型，'movie' 或 'tv'
        status: 状态码，默认为获取失败
        status_reason: 状态原因，默认为获取失败
    """
    if platform == "douban":
        if media_type == "tv":
            return {
                "seasons": [],
                "rating": "出错",
                "rating_people": "出错",
                "status": status,
                "status_reason": status_reason
            }
        else:
            return {
                "rating": "出错",
                "rating_people": "出错",
                "status": status,
                "status_reason": status_reason
            }
            
    elif platform == "imdb":
        return {
            "rating": "出错",
            "rating_people": "出错",
            "status": status,
            "status_reason": status_reason
        }
        
    elif platform == "letterboxd":
        return {
            "rating": "出错",
            "rating_count": "出错",
            "status": status,
            "status_reason": status_reason
        }
    
    elif platform == "trakt":
        return {
            "rating": "出错",
            "votes": "出错",
            "distribution": {},
            "url": "",
            "status": status,
            "status_reason": status_reason
        }
        
    elif platform == "rottentomatoes":
        if media_type == "tv":
            return {
                "series": {
                    "tomatometer": "出错",
                    "audience_score": "出错",
                    "critics_avg": "出错",
                    "audience_avg": "出错",
                    "critics_count": "出错",
                    "audience_count": "出错",
                    "status": status,
                    "status_reason": status_reason
                },
                "seasons": [],
                "status": status,
                "status_reason": status_reason
            }
        else:
            return {
                "series": {
                    "tomatometer": "出错",
                    "audience_score": "出错",
                    "critics_avg": "出错",
                    "audience_avg": "出错",
                    "critics_count": "出错",
                    "audience_count": "出错",
                    "status": status,
                    "status_reason": status_reason
                },
                "status": status,
                "status_reason": status_reason
            }
            
    elif platform == "metacritic":
        if media_type == "tv":
            return {
                "overall": {
                    "metascore": "出错",
                    "critics_count": "出错",
                    "userscore": "出错",
                    "users_count": "出错",
                    "status": status,
                    "status_reason": status_reason
                },
                "seasons": [],
                "status": status,
                "status_reason": status_reason
            }
        else:
            return {
                "overall": {
                    "metascore": "出错",
                    "critics_count": "出错",
                    "userscore": "出错",
                    "users_count": "出错",
                    "status": status,
                    "status_reason": status_reason
                },
                "status": status,
                "status_reason": status_reason
            }
    
    return {
        "rating": "出错",
        "rating_people": "出错",
        "status": status,
        "status_reason": status_reason
    }

def format_rating_output(all_ratings, media_type):
    """格式化所有平台的评分信息（静默模式，只返回数据不打印）"""
    formatted_data = copy.deepcopy(all_ratings)
    
    for platform, data in formatted_data.items():
        if media_type == "movie":
            status = check_movie_status(data, platform)
        else:
            status = check_tv_status(data, platform)
            
        if platform in ["douban", "imdb", "letterboxd"]:
            data["status"] = status
        elif platform == "rottentomatoes":
            if "series" in data:
                data["series"]["status"] = status
            if "seasons" in data:
                for season in data["seasons"]:
                    season["status"] = status
            data["status"] = status
        elif platform == "metacritic":
            if "overall" in data:
                data["overall"]["status"] = status
            if "seasons" in data:
                for season in data["seasons"]:
                    season["status"] = status
            data["status"] = status
    
    return formatted_data

async def parallel_extract_ratings(tmdb_info, media_type, request=None, douban_cookie=None):
    """并行处理所有平台的评分获取
    Args:
        tmdb_info: TMDB信息
        media_type: 媒体类型
        request: FastAPI请求对象
        douban_cookie: 用户的豆瓣Cookie（可选）
    """
    import time
    start_time = time.time()
    
    platforms = ["douban", "imdb", "letterboxd", "rottentomatoes", "metacritic"]
    
    title = tmdb_info.get('zh_title') or tmdb_info.get('title', 'Unknown')
    print(log.section(f"并行获取评分: {title} ({media_type})"))
    
    is_anthology = tmdb_info.get("is_anthology", False)
    
    async def process_platform(platform):
        platform_start = time.time()
        try:
            if request and await request.is_disconnected():
                return platform, {"status": "cancelled"}
                
            cookie = douban_cookie if platform == "douban" else None
            search_results = await search_platform(platform, tmdb_info, request, cookie)
            if isinstance(search_results, dict) and "status" in search_results:
                elapsed = time.time() - platform_start
                print(log.error(f"{platform}: {search_results.get('status_reason', search_results.get('status'))} ({elapsed:.1f}s)"))
                return platform, search_results
                
            rating_data = await extract_rating_info(media_type, platform, tmdb_info, search_results, request, cookie)
            
            elapsed = time.time() - platform_start
            status = rating_data.get('status', 'Unknown')
            if status == RATING_STATUS["SUCCESSFUL"]:
                rating = rating_data.get('rating') or rating_data.get('series', {}).get('tomatometer', '?')
                print(log.success(f"{platform}: {rating} ({elapsed:.1f}s)"))
            else:
                print(log.warning(f"{platform}: {status} ({elapsed:.1f}s)"))
            
            return platform, rating_data
            
        except Exception as e:
            elapsed = time.time() - platform_start
            print(log.error(f"{platform}: {str(e)[:50]} ({elapsed:.1f}s)"))
            
            error_str = str(e).lower()
            if "rate limit" in error_str or "频率限制" in error_str:
                return platform, create_error_rating_data(platform, media_type, RATING_STATUS["RATE_LIMIT"], "访问频率限制")
            elif "timeout" in error_str or "超时" in error_str:
                return platform, create_error_rating_data(platform, media_type, RATING_STATUS["TIMEOUT"], "请求超时")
            else:
                return platform, create_error_rating_data(platform, media_type)
    
    sem = asyncio.Semaphore(5)
    
    async def process_with_semaphore(platform):
        async with sem:
            return await process_platform(platform)
    
    if is_anthology and media_type == "tv":
        print("检测到选集剧，先执行IMDB，然后执行其他平台...")
        
        imdb_result = await process_with_semaphore("imdb")
        imdb_platform, imdb_rating = imdb_result
        
        print(f"IMDB完成，开始执行其他平台（烂番茄和MTC将使用主系列信息）...")
        
        other_platforms = [p for p in platforms if p != "imdb"]
        other_tasks = [process_with_semaphore(platform) for platform in other_platforms]
        other_results = await asyncio.gather(*other_tasks)
        
        all_ratings = {imdb_platform: imdb_rating}
        all_ratings.update({platform: rating for platform, rating in other_results})
    else:
        tasks = [process_with_semaphore(platform) for platform in platforms]
        results = await asyncio.gather(*tasks)
        all_ratings = {platform: rating for platform, rating in results}
    
    total_time = time.time() - start_time
    success_count = sum(1 for r in all_ratings.values() if r.get('status') == RATING_STATUS["SUCCESSFUL"])
    print(f"\n{log.success(f'完成 {success_count}/{len(platforms)} 个平台')} | 总耗时: {total_time:.2f}秒\n")
    
    return format_rating_output(all_ratings, media_type)

async def main():
    try:
        tmdb_id = input("请输入TMDB ID:")
        print("请输入媒体类型(movie/tv),5秒后默认尝试movie类型:")
        
        media_type = None
        try:
            media_type = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, input),
                timeout=5.0
            )
            if media_type not in ["movie", "tv"]:
                print("无效的媒体类型,默认使用movie类型")
                media_type = "movie"
        except asyncio.TimeoutError:
            print("未输入媒体类型,默认使用movie类型")
            media_type = "movie"
            
        all_platforms = ["douban", "imdb", "letterboxd", "rottentomatoes", "metacritic"]
        print("\n可用平台:", ", ".join(all_platforms))
        print("请输入要测试的平台(多个平台用空格分隔),5秒后默认测试所有平台:")
        
        try:
            platforms_input = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, input),
                timeout=5.0
            )
            
            if platforms_input.strip():
                platforms = [p.strip().lower() for p in platforms_input.split()]
                invalid_platforms = [p for p in platforms if p not in all_platforms]
                if invalid_platforms:
                    print(f"警告: 无效的平台 {', '.join(invalid_platforms)}, 这些平台将被忽略")
                    platforms = [p for p in platforms if p in all_platforms]
                if not platforms:
                    print("没有有效的平台输入,将测试所有平台")
                    platforms = all_platforms
            else:
                print("未指定平台,将测试所有平台")
                platforms = all_platforms
                
        except asyncio.TimeoutError:
            print("未在5秒内输入平台,默认测试所有平台")
            platforms = all_platforms
        
        tmdb_info = await get_tmdb_info(tmdb_id, media_type)
        if tmdb_info is None:
            print("获取TMDB信息失败，无法继续执行后续流程")
            return
        
        media_type = tmdb_info["type"]
        print(f"\n开始获取以下平台的评分信息: {', '.join(platforms)}...")
        
        sem = asyncio.Semaphore(5)
        
        async def process_platform(platform):
            async with sem:
                try:
                    print(f"开始获取 {platform} 平台评分...")
                    search_results = await search_platform(platform, tmdb_info)
                    if isinstance(search_results, dict) and "status" in search_results:
                        return platform, search_results
                    
                    rating_data = await extract_rating_info(media_type, platform, tmdb_info, search_results)
                    return platform, rating_data
                    
                except Exception as e:
                    print(f"处理 {platform} 平台时出错: {e}")
                    print(traceback.format_exc())
                    return platform, create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])
        
        tasks = [process_platform(platform) for platform in platforms]
        
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            all_ratings = {}
            for result in results:
                if isinstance(result, Exception):
                    print(f"任务执行出错: {result}")
                    continue
                    
                platform, rating_data = result
                all_ratings[platform] = rating_data
                print(f"{platform} 平台评分信息获取完成")
        
            if all_ratings:
                formatted_ratings = format_rating_output(all_ratings, media_type)
                return formatted_ratings                
            else:
                print("\n=== 评分信息汇总 ===\n未能获取到任何平台的评分信息")
                return {}
            
        except Exception as e:
            print(f"并发获取评分信息时出错: {e}")
            print(traceback.format_exc())
            return {}
            
    except Exception as e:
        print(f"执行过程中出错: {e}")
        print(traceback.format_exc())
        return {}
    
if __name__ == "__main__":
    asyncio.run(main())
    
