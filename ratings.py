# ==========================================
# 评分获取模块 - 负责从各个平台获取影视评分数据
# 支持平台: 豆瓣、IMDB、Letterboxd、烂番茄、Metacritic、TMDB、Trakt
# ==========================================
import re
import json
import random
import asyncio
import traceback
import logging
from fuzzywuzzy import fuzz
from playwright.async_api import async_playwright
import copy
import aiohttp
from urllib.parse import quote
from dataclasses import dataclass, field
from fastapi import Request
import unicodedata
from datetime import datetime
from typing import Dict, Any
from browser_pool import browser_pool
from anthology_handler import anthology_handler

# 配置日志
logger = logging.getLogger(__name__)

# ==========================================
# 日志美化工具
# ==========================================
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
TMDB_API_KEY = "4f681fa7b5ab7346a4e184bbf2d41715"
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
            http2=True,  # 启用 HTTP/2
            timeout=httpx.Timeout(10.0),  # 10秒超时
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

# 在文件开头添加状态枚举
RATING_STATUS = {
    "NO_FOUND": "No Found",      # 平台未收录该影视
    "FETCH_FAILED": "Fail",      # 获取评分数据失败
    "NO_RATING": "No Rating",    # 平台收录但没有评分
    "RATE_LIMIT": "RateLimit",  # 访问频率限制
    "TIMEOUT": "Timeout",        # 请求超时
    "SUCCESSFUL": "Successful"   # 成功获取到评分
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
    delay = random.uniform(0.2, 0.5)  # 减少随机等待时间
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

@dataclass
class RetryConfig:
    """重试配置类"""
    max_retries: int
    base_delay: float
    platform: str
    error_types: dict = field(default_factory=lambda: {
        'rate_limit': {'max_retries': 3, 'delay': 10},  # 访问频率限制
        'timeout': {'max_retries': 3, 'delay': 5},      # 超时
        'network_error': {'max_retries': 3, 'delay': 2}, # 网络错误
        'parse_error': {'max_retries': 3, 'delay': 2},   # 解析错误
        'fail': {'max_retries': 3, 'delay': 2},          # 获取失败
        'error': {'max_retries': 3, 'delay': 2},          # 其他错误
        'no_found': {'max_retries': 3, 'delay': 2}      # 未找到时重试一次
    })

def smart_retry(retry_config: RetryConfig):
    """智能重试装饰器"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            platform = None
            if 'platform' in kwargs:
                platform = kwargs['platform']
            else:
                if len(args) > 1:
                    platform = args[1]
            
            if not platform:
                platform = retry_config.platform
                
            last_error = None
            attempt = 0
            
            while attempt < retry_config.max_retries:
                try:
                    result = await func(*args, **kwargs)
                    
                    # 检查返回的状态
                    if isinstance(result, dict) and 'status' in result:
                        status = result['status']
                        
                        # 根据不同状态决定是否重试
                        if status == RATING_STATUS["RATE_LIMIT"]:
                            error_config = retry_config.error_types['rate_limit']
                            if attempt < error_config['max_retries']:
                                delay = error_config['delay'] * (2 ** attempt)
                                print(f"{platform} 访问频率限制，{delay}秒后重试")
                                await asyncio.sleep(delay)
                                attempt += 1
                                continue
                                
                        elif status == RATING_STATUS["TIMEOUT"]:
                            error_config = retry_config.error_types['timeout']
                            if attempt < error_config['max_retries']:
                                delay = error_config['delay'] * (1.5 ** attempt)
                                print(f"{platform} 请求超时，{delay}秒后重试")
                                await asyncio.sleep(delay)
                                attempt += 1
                                continue
                                
                        elif status == RATING_STATUS["FETCH_FAILED"]:
                            error_config = retry_config.error_types['fail']
                            if attempt < error_config['max_retries']:
                                delay = error_config['delay'] * (1.5 ** attempt)
                                print(f"{platform} 获取失败，{delay}秒后重试")
                                await asyncio.sleep(delay)
                                attempt += 1
                                continue
                                
                        elif status == RATING_STATUS["NO_FOUND"]:
                            error_config = retry_config.error_types['no_found']
                            if attempt < error_config['max_retries']:
                                delay = error_config['delay']
                                print(f"{platform} 未找到匹配结果，{delay}秒后重试最后一次")
                                await asyncio.sleep(delay)
                                attempt += 1
                                continue
                                
                    return result
                    
                except Exception as e:
                    last_error = e
                    error_type = 'network_error' if isinstance(e, aiohttp.ClientError) else 'parse_error'
                    error_config = retry_config.error_types[error_type]
                    
                    if attempt < error_config['max_retries']:
                        delay = error_config['delay'] * (2 ** attempt)
                        print(f"{platform} {str(e)}，{delay}秒后重试")
                        await asyncio.sleep(delay)
                        attempt += 1
                        continue
                    raise e
                    
            # 所有重试都失败
            # 如果是已知的特定状态，保留原始状态
            if isinstance(result, dict) and 'status' in result:
                status = result['status']
                if status in [RATING_STATUS["RATE_LIMIT"], RATING_STATUS["TIMEOUT"], RATING_STATUS["NO_FOUND"]]:
                    return {
                        "status": status,
                        "error_detail": f"重试{retry_config.max_retries}次后仍然失败: {str(last_error)}"
                    }
            
            # 其他情况返回获取失败
            return {
                "status": RATING_STATUS["FETCH_FAILED"],
                "error_detail": str(last_error)
            }
            
        return wrapper
    return decorator

def construct_search_url(title, media_type, platform, tmdb_info):
    """根据影视类型构造各平台搜索URL"""
    encoded_title = quote(title)
    # 为 Metacritic 特别处理标题
    if platform == "metacritic":
        # 移除重音符号并简化标题
        simplified_title = ''.join(c for c in unicodedata.normalize('NFD', title)
                                  if unicodedata.category(c) != 'Mn')
        encoded_title = quote(simplified_title)

    tmdb_id = tmdb_info.get("tmdb_id")
    year = tmdb_info.get("year")

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
            "movie": f"https://letterboxd.com/search/tmdb:{tmdb_id} year:{year}/",
            "tv": f"https://letterboxd.com/search/tmdb:{tmdb_id} year:{year}/"
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
    return search_urls[platform][media_type] if platform in search_urls and media_type in search_urls[platform] else ""
        
async def get_tmdb_info(tmdb_id, media_type, request=None):
    """通过TMDB API获取影视基本信息"""
    try:
        if request and await request.is_disconnected():
            return None
        
        # 使用全局 httpx 客户端（连接池）
        client = get_tmdb_http_client()
        
        # 构建请求URL和参数（使用 Bearer Token，不需要 api_key）
        endpoint_en = f"{TMDB_API_BASE_URL}{media_type}/{tmdb_id}"
        params_en = {
            "language": "en-US",
            "append_to_response": "credits,external_ids"
        }
        
        # 并行获取英文和中文数据（性能优化）
        try:
            en_response, zh_response = await asyncio.gather(
                client.get(endpoint_en, params=params_en),
                client.get(endpoint_en, params={"language": "zh-CN", "append_to_response": "credits,external_ids"}),
                return_exceptions=True
            )
            
            # 处理英文数据
            if isinstance(en_response, Exception):
                print(f"获取{media_type}英文信息失败: {en_response}")
                return None
            
            if en_response.status_code != 200:
                if not request or not (await request.is_disconnected()):
                    print(f"获取{media_type}信息失败，状态码: {en_response.status_code}")
                return None
            
            en_data = en_response.json()
            
            if not request or not (await request.is_disconnected()):
                print(f"影视类型为{media_type}")
            
            # 处理中文数据
            if isinstance(zh_response, Exception) or zh_response.status_code != 200:
                zh_data = en_data
            else:
                zh_data = zh_response.json()
                
        except httpx.TimeoutException:
            print("TMDB API 请求超时")
            return None
        except Exception as e:
            print(f"TMDB API 请求失败: {e}")
            return None

        if not en_data:
            if not request or not (await request.is_disconnected()):
                print("API返回的数据为空")
            return None
            
        # 检查请求是否已被取消
        if request and await request.is_disconnected():
            return None
        
        # 提取基本信息
        if media_type == "movie":
            title = en_data.get("title", "")
            original_title = en_data.get("original_title", "")
            zh_title = zh_data.get("title", "")
            year = en_data.get("release_date", "")[:4] if en_data.get("release_date") else ""
        else:
            title = en_data.get("name", "")
            original_title = en_data.get("original_name", "")
            zh_title = zh_data.get("name", "")
            year = en_data.get("first_air_date", "")[:4] if en_data.get("first_air_date") else ""
        
        # 获取导演信息
        director = ""
        if "credits" in en_data and en_data["credits"]:
            crew = en_data["credits"].get("crew", [])
            directors = [c["name"] for c in crew if c.get("job") == "Director"]
            director = ", ".join(directors)
        
        result = {
            "type": media_type,
            "title": title,
            "original_title": original_title,
            "zh_title": zh_title,
            "year": year,
            "director": director,
            "tmdb_id": str(tmdb_id),
            "imdb_id": en_data.get("imdb_id") or en_data.get("external_ids", {}).get("imdb_id", "")
        }
        
        # 如果是剧集，添加额外信息
        if media_type == "tv":
            result.update({
                "first_air_date": en_data.get("first_air_date", ""),
                "number_of_seasons": en_data.get("number_of_seasons", 0),
                "last_air_date": en_data.get("last_air_date", ""),
                "seasons": [{
                    "season_number": s.get("season_number"),
                    "name": f"Season {s.get('season_number')}",
                    "air_date": s.get("air_date", "")[:4] if s.get("air_date") else "",
                    "episode_count": s.get("episode_count", 0)
                } for s in en_data.get("seasons", [])]
            })
            
            # === 选集剧处理 ===
            # 检查是否为选集剧（启发式判断）
            is_anthology = anthology_handler.is_anthology_series(result)
            result["is_anthology"] = is_anthology
            
            if is_anthology:
                print(f"\n=== 检测到可能的选集剧: {title} ===")
                
                # 提取主系列信息（动态提取，不依赖硬编码）
                series_info = anthology_handler.extract_main_series_info(result)
                if series_info:
                    result["series_info"] = series_info
                    print(f"提取主系列: {series_info.get('main_title')}")
                
                # 如果IMDB ID为空，尝试从多个来源获取
                if not result["imdb_id"]:
                    print("IMDB ID为空，尝试从多个来源获取...")
                    enhanced_imdb_id = await anthology_handler.get_imdb_id_from_multiple_sources(
                        result, 
                        series_info
                    )
                    if enhanced_imdb_id:
                        result["imdb_id"] = enhanced_imdb_id
                        print(f"增强获取到IMDB ID: {enhanced_imdb_id}")
                
                # 生成搜索标题变体（多策略）
                # 这些变体会在搜索各平台时依次尝试
                search_variants = anthology_handler.generate_search_variants(
                    result,
                    series_info
                )
                result["search_variants"] = search_variants
                
                print("==================\n")
            else:
                # 即使不是选集剧，也生成基本的搜索变体
                # 保证所有剧集都有搜索变体
                result["search_variants"] = anthology_handler.generate_search_variants(result, None)
        
        # 检查请求是否已被取消，只在未取消时输出信息
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
    """
    从字符串中提取4位年份，如果无法提取则返回None
    支持格式：
    - "2025"
    - "2022–2025" (范围，返回第一年)
    - "2022–" (开放范围)
    - "(2025)" (括号中的年份)
    """
    if not year_str:
        return None
    
    year_str = str(year_str)
    
    # 尝试提取年份范围的第一年（如 "2022–2025" 或 "2022–"）
    range_match = re.search(r'(\d{4})\s*[–-]\s*(\d{4})?', year_str)
    if range_match:
        return int(range_match.group(1))
    
    # 普通年份提取
    match = re.search(r'\b(19\d{2}|20\d{2})\b', year_str)
    if match:
        return int(match.group(1))
    
    # 不抛出异常，返回None让调用者处理
    return None

async def calculate_match_degree(tmdb_info, result, platform=""):
    """计算搜索结果与TMDB信息的匹配度"""
    import traceback as tb  # 导入traceback模块
    try:
        # 如果结果已经有匹配分数，直接返回
        if "match_score" in result:
            return result["match_score"]      
          
        score = 0
        
        # === 选集剧特殊匹配逻辑 ===
        # 如果使用的是选集剧策略（主系列标题），需要特殊处理
        if tmdb_info.get("is_anthology"):
            search_variant_used = result.get("search_variant_used")
            if not search_variant_used:
                # 尝试从tmdb_info获取当前使用的搜索变体
                search_variants = tmdb_info.get("search_variants", [])
                # 假设使用的是第一个变体（这个逻辑可以改进）
                search_variant_used = search_variants[0] if search_variants else {}
            
            # 如果使用的是anthology_series策略（主系列标题）
            if search_variant_used.get("strategy") == "anthology_series":
                
                result_title = result.get("title", "").lower()
                search_title = search_variant_used.get("title", "").lower()
                
                # 1. 主系列标题严格匹配（关键！避免Monsterland被当成Monster）
                # 不使用模糊匹配，而是检查标题是否包含或等于搜索词
                
                # 清理标题：移除年份、括号等
                cleaned_result_title = re.sub(r'\s*\([^)]*\)\s*', '', result_title).strip()
                cleaned_search_title = search_title.strip()
                
                # 严格匹配逻辑
                is_exact_match = (cleaned_result_title == cleaned_search_title)
                is_contained = (cleaned_search_title in cleaned_result_title.split() or 
                               cleaned_result_title.startswith(cleaned_search_title + " ") or
                               cleaned_result_title == cleaned_search_title)
                
                print(f"  搜索标题: '{cleaned_search_title}'")
                
                if is_exact_match:
                    score = 70  # 完全匹配！
                elif is_contained:
                    score = 65  # 包含关系也接受（如"Monster: Season 1"包含"Monster"）
                else:
                    # 使用模糊匹配作为最后手段，但要求很高
                    fuzzy_score = fuzz.ratio(search_title, result_title)
                    if fuzzy_score >= 95:
                        score = 60
                    else:
                        # 不接受模糊匹配度<95%的，避免Monsterland这种错误
                        score = 0
                        return 0  # 直接返回0，不继续计算
                
                # 2. 年份处理（关键！用于区分同名剧集）
                result_year_text = result.get("year", "")
                tmdb_year = tmdb_info.get("year", "")
                search_year = search_variant_used.get("year", "")
                
                # 提取年份（支持范围如"2022–"）
                result_year_int = extract_year(result_year_text)
                tmdb_year_int = extract_year(tmdb_year)
                
                if result_year_int and tmdb_year_int:
                    # 情况A：年份范围（如"2022–"表示系列）
                    if "–" in result_year_text or "-" in result_year_text:
                        # 检查目标年份是否在系列范围内
                        end_year_match = re.search(r'[–-]\s*(\d{4})', result_year_text)
                        if end_year_match:
                            end_year = int(end_year_match.group(1))
                            if result_year_int <= tmdb_year_int <= end_year:
                                score += 25
                        else:
                            # 开放范围（如"2022–"）
                            if result_year_int <= tmdb_year_int:
                                score += 30
                    
                    # 情况B：单一年份（选集剧的关键逻辑！）
                    else:
                        year_diff = abs(result_year_int - tmdb_year_int)
                        
                        # 对于选集剧：综合判断
                        if year_diff == 0:
                            # 年份精确匹配
                            score += 20
                        elif year_diff <= 3:
                            # 年份非常接近（3年内）
                            score += 15
                        elif result_year_int < tmdb_year_int and year_diff <= 5:
                            # 结果年份早于目标，且在5年内 → 可能是选集剧系列
                            score += 10
                        elif result_year_int < tmdb_year_int and year_diff <= 10:
                            # 在10年内，给少量分数
                            score += 5
                        else:
                            pass

                elif not result_year_int:
                    pass
                
                # 3. 副标题匹配（关键！通用方案的核心）
                # 不需要知道首播年份，只需要匹配副标题
                subtitle_hint = search_variant_used.get("subtitle_hint", "")
                if subtitle_hint:
                    subtitle_lower = subtitle_hint.lower()
                    # 完全包含副标题 - 这是最可靠的匹配
                    if subtitle_lower in result_title:
                        score += 40  # 高分！
                    else:
                        # 模糊匹配副标题的各个部分
                        subtitle_match = fuzz.partial_ratio(subtitle_lower, result_title)
                        if subtitle_match > 70:
                            score += subtitle_match * 0.3
                
                # 4. 对于IMDB，如果是"Monster" + 年份范围包含我们的目标年份，也应该匹配
                if platform == "imdb":
                    # 检查年份范围（如 "2022–2025" 或 "2022–"）
                    if "–" in result_year_text or "-" in result_year_text:
                        if result_year_int and tmdb_year_int:
                            if result_year_int <= tmdb_year_int:
                                score += 15
                
                print(f"{platform}[选集剧匹配]最终得分: {score}")
                return score
        
        # 专门针对豆瓣平台
        if platform == "douban":
            
            # 1. 提取豆瓣标题中的所有可能部分
            result_title = result.get("title", "").lower()
            # 分离中英文标题，去掉年份部分
            parts = result_title.split('(')[0].strip()
            title_parts = parts.split(' ')
            
            # 2. 尝试匹配 TMDB 中的各种标题
            tmdb_titles = [
                tmdb_info.get("title", "").lower(),
                tmdb_info.get("original_title", "").lower(),
                tmdb_info.get("zh_title", "").lower()
            ]
            
            # 计算最高匹配分数
            title_scores = []
            
            # 2.1 先计算整体标题匹配度
            for tmdb_title in tmdb_titles:
                if tmdb_title:
                    whole_score = fuzz.ratio(tmdb_title, result_title)
                    title_scores.append(whole_score)
                    
                    # 添加部分匹配算法
                    partial_score = fuzz.partial_ratio(tmdb_title, result_title)
                    title_scores.append(partial_score)
            
            # 2.2 再计算分词后的匹配度
            for tmdb_title in tmdb_titles:
                if tmdb_title:
                    # 对每个标题部分计算匹配度
                    for part in title_parts:
                        if part and len(part) > 1:
                            part_score = fuzz.ratio(tmdb_title, part)
                            title_scores.append(part_score)
            
            if title_scores:
                max_title_score = max(title_scores)
                score = max_title_score * 0.6
            
            # 3. 如果是剧集，额外检查季数
            if tmdb_info.get("type") == "tv":
                # 先检查是否是单季剧集
                total_seasons = len([s for s in tmdb_info.get("seasons", []) if s.get("season_number", 0) > 0])
                is_single_season = total_seasons == 1
                
                result_season_number = None
                
                # 如果是单季剧集，且标题中没有明确的季数标识，则默认为第一季
                if is_single_season:
                    # 检查标题中是否有明确的季数标识
                    has_season_marker = (
                        re.search(r'第[一二三四五六七八九十百]+季', result.get("title", "")) or
                        re.search(r'season\s*\d+', result.get("title", "").lower())
                    )
                    
                    if not has_season_marker:
                        result_season_number = 1
                
                # 如果不是单季剧集或标题中有明确的季数标识，则尝试解析季数
                if result_season_number is None:
                    # 中文季数格式
                    season_match = re.search(r'第([一二三四五六七八九十百]+)季', result.get("title", ""))
                    if season_match:
                        chinese_season_number = season_match.group(1)
                        result_season_number = chinese_to_arabic(chinese_season_number)
                    else:
                        # 英文季数格式
                        season_match = re.search(r'season\s*(\d+)', result.get("title", "").lower())
                        if season_match:
                            result_season_number = int(season_match.group(1))
                
                if result_season_number is not None:
                    for season in tmdb_info.get("seasons", []):
                        if season.get("season_number") == result_season_number:
                            # 对于多季剧集，季数匹配给予更高权重
                            if total_seasons > 1:
                                score += 50  # 增加季数匹配权重
                            else:
                                score += 30
                            break
            
            # 4. 年份匹配
            try:
                if tmdb_info.get("type") == "movie":
                    tmdb_year = str(tmdb_info.get("year", ""))
                    result_year = str(result.get("year", ""))
                    
                    if tmdb_year and result_year:
                        tmdb_year_int = extract_year(tmdb_year)
                        result_year_int = extract_year(result_year)
                        
                        # 只有两个年份都能提取时才比较
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
                            # 无法提取年份，不影响匹配，但也不加分
                            print(f"年份无法提取: TMDB={tmdb_year}, 结果={result_year}")
                else: 
                    # 剧集
                    # 先检查是否是单季剧集
                    total_seasons = len([s for s in tmdb_info.get("seasons", []) if s.get("season_number", 0) > 0])
                    is_single_season = total_seasons == 1
                    
                    result_year = str(result.get("year", ""))
                    
                    # 获取结果中的季数
                    result_season_number = None
                    season_match = re.search(r'第([一二三四五六七八九十百]+)季', result.get("title", ""))
                    if season_match:
                        chinese_season_number = season_match.group(1)
                        result_season_number = chinese_to_arabic(chinese_season_number)
                    else:
                        season_match = re.search(r'season\s*(\d+)', result.get("title", "").lower())
                        if season_match:
                            result_season_number = int(season_match.group(1))
                    
                    # 如果是单季剧集且标题中没有季数标识，默认为第1季
                    if is_single_season and not result_season_number:
                        result_season_number = 1
                    
                    if result_season_number is not None:
                        
                        # 查找对应季的播出年份
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
                        # 如果是单季剧集但没有找到季数标识，使用第一季的播出年份
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
                # traceback已在函数开头导入为tb
                print(f"错误详情: {tb.format_exc()}")
            
            # 5. IMDB ID匹配（10分）
            if tmdb_info.get("imdb_id") and result.get("imdb_id"):
                if tmdb_info["imdb_id"] == result["imdb_id"]:
                    score += 10   
        else:
            # 其他平台或非剧集的匹配逻辑
            # 获取所有可能的标题
            tmdb_titles = [
                tmdb_info.get("title", "").lower(),
                tmdb_info.get("original_title", "").lower(),
                tmdb_info.get("zh_title", "").lower() if platform == "douban" else ""
            ]
            result_title = result.get("title", "").lower()
            
            # 清理标题中的年份信息
            result_title = re.sub(r'\s*\(\d{4}\)\s*', '', result_title)
            
            # 1. 标题匹配度计算（60分）
            title_scores = [fuzz.ratio(t, result_title) for t in tmdb_titles if t]
            if title_scores:
                title_score = max(title_scores)
                score += title_score * 0.6
            
            # 2. 年份匹配（30分）
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
            
            # 3. IMDB ID匹配（10分）
            if tmdb_info.get("imdb_id") and result.get("imdb_id"):
                if tmdb_info["imdb_id"] == result["imdb_id"]:
                    score += 10
        
        # 根据平台调整匹配阈值
        threshold = {
            "douban": 70,
            "imdb": 70,
            "letterboxd": 70,
            "rottentomatoes": 70,
            "metacritic": 70
        }.get(platform, 70)
        
        # 返回匹配结果
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
    """检查页面是否出现访问限制
    Returns:
        dict: 如果检测到访问限制,返回状态对象
        None: 如果没有访问限制
    """
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
        # 检查 error code 008
        page_text = await page.content()
        if "error code: 008" in page_text:
            print("豆瓣访问频率限制: error code 008")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"}
    
    # 首先检查页面全文是否包含特定文本
    page_text = await page.locator('body').text_content()
    if any(phrase in page_text for phrase in rules["phrases"]):
        print(f"{platform} 访问频率限制: 检测到限制文本")
        return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"}
    
    # 然后检查特定选择器
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

async def search_platform(platform, tmdb_info, request=None):
    """
    在各平台搜索并返回搜索结果
    使用多策略搜索：依次尝试所有搜索变体直到找到匹配
    """
    try:
        # 检查请求是否已被取消
        if request and await request.is_disconnected():
            return {"status": "cancelled"}

        # === Trakt特殊处理 ===
        # Trakt不需要通过搜索页面，直接在extract_rating_info中通过API处理
        # 这里返回一个标记，让后续逻辑知道使用API
        if platform == "trakt":
            return [{"use_api": True, "title": tmdb_info.get("title", "")}]

        # 对于IMDB,如果有IMDB ID则直接返回详情页URL
        if platform == "imdb" and tmdb_info.get("imdb_id"):
            imdb_id = tmdb_info["imdb_id"]
            return [{
                "title": tmdb_info["title"],
                "year": tmdb_info.get("year", ""),
                "url": f"https://www.imdb.com/title/{imdb_id}/",
                "imdb_id": imdb_id,
                "direct_match": True
            }]

        # === 多策略搜索 ===
        # 获取搜索变体（如果有）
        search_variants = tmdb_info.get("search_variants", [])
        
        # 如果没有搜索变体，使用默认标题
        if not search_variants:
            if platform == "douban":
                search_title = tmdb_info["zh_title"] or tmdb_info["original_title"]
            else:
                search_title = tmdb_info["title"] or tmdb_info["original_title"]
            
            search_variants = [{
                "title": search_title,
                "year": tmdb_info.get("year", ""),
                "type": "default",
                "strategy": "standalone",
                "priority": 1
            }]
        
        media_type = tmdb_info["type"]
        
        # 定义单次搜索的执行函数
        async def execute_single_search(search_title, variant_info, browser):
            """执行单个搜索变体的搜索"""
            context = None
            search_url = construct_search_url(search_title, media_type, platform, tmdb_info)
            
            try:
                # 先选择 User-Agent
                selected_user_agent = random.choice(USER_AGENTS)

                # 优化上下文配置
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

                # 创建上下文
                context = await browser.new_context(**context_options)

                # 添加请求拦截
                await context.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda route: route.abort())
                await context.route("**/(analytics|tracking|advertisement)", lambda route: route.abort())
                await context.route("**/beacon/**", lambda route: route.abort())
                await context.route("**/telemetry/**", lambda route: route.abort())
                await context.route("**/stats/**", lambda route: route.abort())

                # 创建页面并设置
                page = await context.new_page()
                page.set_default_timeout(20000) 

                # 如果是豆瓣，设置用户IP
                if platform == "douban" and request:
                    client_ip = get_client_ip(request)
                    print(f"豆瓣请求使用IP: {client_ip}")
                    await page.set_extra_http_headers({
                        'X-Forwarded-For': client_ip,
                        'X-Real-IP': client_ip
                    })

                print(f"{platform} 搜索URL: {search_url}")

                # 添加请求监控
                async def log_request(req):
                    if req.resource_type == "document":
                        pass
                    page.remove_listener('request', log_request)

                page.on('request', log_request)
                
                # 初始化results变量
                results = None
                
                try:
                    # 在每个关键操作前检查请求状态
                    async def check_request():
                        if request and await request.is_disconnected():
                            print("请求已被取消,停止执行")
                            raise RequestCancelledException()

                    # 获取搜索结果
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
                        results = await handle_metacritic_search(page, search_url)
                    else:
                        # 不支持的平台
                        print(f"平台 {platform} 不支持通过搜索页面")
                        return None

                    # 检查访问限制
                    await check_request()
                    if isinstance(results, dict) and "status" in results:
                        if results["status"] == RATING_STATUS["RATE_LIMIT"]:
                            print(f"{platform} 访问频率限制")
                            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
                        elif results["status"] == RATING_STATUS["TIMEOUT"]:
                            print(f"{platform} 请求超时")
                            return {"status": RATING_STATUS["TIMEOUT"], "status_reason": "请求超时"}
                        elif results["status"] == RATING_STATUS["FETCH_FAILED"]:
                            print(f"{platform} 获取失败")
                            return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": "获取失败"}
                        elif results["status"] == RATING_STATUS["NO_FOUND"]:
                            print(f"{platform}平台未收录此影视")
                            return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}

                    # 检查搜索结果
                    await check_request()
                    if not isinstance(results, list):
                        print(f"{platform} 获取失败")
                        return create_error_rating_data(platform, media_type)

                    print(f"找到 {len(results)} 个 {platform} 搜索结果")

                    # 根据匹配度过滤结果
                    await check_request()
                    # 对于选集剧策略，降低阈值
                    # 因为我们通过副标题匹配，基础分可能较低
                    if variant_info.get("strategy") == "anthology_series":
                        threshold = 60  # 选集剧降低阈值
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
                        # 将当前使用的变体信息添加到result中
                        result["search_variant_used"] = variant_info
                        
                        # 如果结果已经有匹配分数，直接使用
                        if "match_score" in result:
                            match_score = result["match_score"]
                        else:
                            match_score = await calculate_match_degree(tmdb_info, result, platform)

                        if match_score >= threshold:
                            matched_results.append(result)
                        else:
                            pass

                    if not matched_results:
                        return None  # 返回None表示这个变体失败，尝试下一个

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
                # 只关闭上下文，不关闭浏览器（浏览器由池管理）
                if context:
                    try:
                        await context.close()
                    except Exception:
                        pass
        
        # === 主搜索循环：依次尝试每个变体 ===
        for i, variant in enumerate(search_variants, 1):
            # 检查请求是否已被取消
            if request and await request.is_disconnected():
                return {"status": "cancelled"}
            
            search_title = variant["title"]
            
            try:
                # 使用浏览器池执行这个变体的搜索
                # 使用默认参数固定变量值，避免lambda捕获问题
                results = await browser_pool.execute_in_browser(
                    lambda browser, st=search_title, v=variant: execute_single_search(st, v, browser)
                )
                
                # 检查结果
                if isinstance(results, dict) and "status" in results:
                    # 如果是错误状态且是最后一个变体，返回错误
                    if i == len(search_variants):
                        return results
                    # 否则尝试下一个变体
                    continue
                
                if isinstance(results, list) and len(results) > 0:
                    print(f"变体成功！{platform} 找到 {len(results)} 个匹配结果")
                    # 标记这个变体成功
                    for result in results:
                        result['search_variant_used'] = variant
                    return results
                
            except Exception as e:
                # 如果是最后一个变体，返回错误
                if i == len(search_variants):
                    return {"status": RATING_STATUS["FETCH_FAILED"], "status_reason": str(e)}
                # 否则继续尝试下一个
                continue
        
        # 所有变体都失败
        print(f"\n所有 {len(search_variants)} 个搜索变体都失败")
        
        # === 豆瓣特殊处理：尝试使用 IMDB ID 搜索 ===
        if platform == "douban" and tmdb_info.get("imdb_id"):
            imdb_id = tmdb_info["imdb_id"]
            print(f"\n[豆瓣备用策略] 尝试使用IMDB ID搜索: {imdb_id}")
            
            try:
                # 构造 IMDB ID 搜索 URL
                imdb_search_url = f"https://search.douban.com/movie/subject_search?search_text={imdb_id}"
                
                # 定义 IMDB ID 搜索的执行函数
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
                        
                        # 如果有请求对象，设置用户IP
                        if request:
                            client_ip = get_client_ip(request)
                            print(f"豆瓣请求使用IP: {client_ip}")
                            await page.set_extra_http_headers({
                                'X-Forwarded-For': client_ip,
                                'X-Real-IP': client_ip
                            })
                        
                        # 执行搜索
                        results = await handle_douban_search(page, imdb_search_url)
                        
                        # 检查结果
                        if isinstance(results, dict) and "status" in results:
                            return results
                        
                        if isinstance(results, list) and len(results) > 0:
                            # IMDB ID 搜索通常只返回一个精确结果
                            print(f"IMDB ID搜索成功！找到 {len(results)} 个结果")
                            # 给第一个结果（最可能匹配的）高分
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
                
                # 使用浏览器池执行 IMDB ID 搜索
                results = await browser_pool.execute_in_browser(execute_imdb_search)
                
                # 检查结果
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
        
        # 等待网络空闲，确保页面完全加载
        try:
            await page.wait_for_load_state('networkidle', timeout=3000)
        except Exception as e:
            print(f"豆瓣等待网络空闲超时: {e}")
        
        await asyncio.sleep(0.2)  # 减少等待时间
        
        # 立即检查是否出现访问频率限制
        rate_limit = await check_rate_limit(page, "douban")
        if rate_limit:
            print("检测到豆瓣访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            # 检查搜索结果 - 使用多种选择器策略
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
            
            results = []  # 初始化results变量
            
            # 如果仍然没有搜索结果
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            for item in items:
                try:
                    title_elem = await item.query_selector('.title-text')
                    if title_elem:
                        title_text = await title_elem.inner_text()
                        url = await title_elem.get_attribute('href')
                        
                        # 提取标题和年份，支持多种格式
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
                            # 如果没有年份信息，只保存标题
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
        # 拦截不必要的资源以加速页面加载
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
    
        # 立即检查是否出现访问频率限制
        rate_limit = await check_rate_limit(page, "imdb")
        if rate_limit:
            print("检测到IMDb访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            # 检查搜索结果
            items = await page.query_selector_all('.ipc-metadata-list-summary-item')
            results = []
            
            # 如果没有搜索结果
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
                    
            for item in items:
                try:
                    title_elem = await item.query_selector('a.ipc-metadata-list-summary-item__t')
                    
                    if title_elem:
                        title = await title_elem.inner_text()
                        url = await title_elem.get_attribute('href')
                        
                        # 尝试从多个位置提取年份
                        year = None
                        
                        # 方法1：尝试从所有inline-list项中查找年份
                        all_list_items = await item.query_selector_all('.ipc-inline-list__item')
                        for list_item in all_list_items:
                            text = await list_item.inner_text()
                            # 提取4位数字年份
                            year_match = re.search(r'\b(19\d{2}|20\d{2})\b', text)
                            if year_match:
                                year = year_match.group(1)
                                break
                        
                        # 方法2：如果还没找到，从标题中提取年份
                        if not year:
                            year_match = re.search(r'\((\d{4})\)', title)
                            if year_match:
                                year = year_match.group(1)
                        
                        # 如果实在找不到年份，至少获取类型信息
                        if not year:
                            type_elem = await item.query_selector('.ipc-inline-list__item .ipc-metadata-list-summary-item__li')
                            if type_elem:
                                year = await type_elem.inner_text()  # 可能是 "TV Series" 等
                        
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
    
        # 立即检查是否出现访问频率限制
        rate_limit = await check_rate_limit(page, "rottentomatoes")
        if rate_limit:
            print("检测到Rotten Tomatoes访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            # 确保从tmdb_info中正确获取media_type
            media_type = tmdb_info.get('type', 'movie')
            result_type = 'movie' if media_type == 'movie' else 'tvSeries'
            
            # 根据媒体类型点击对应标签
            try:
                # 首先等待搜索过滤器加载完成
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
            
            # 根据媒体类型选择对应的结果区域并等待其可见
            result_section = f'search-page-result[type="{result_type}"]:not([hidden])'
            section = await page.wait_for_selector(result_section, timeout=5000)
            
            if not section:
                print(f"Rotten Tomatoes未找到{media_type}类型的搜索结果区域")
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            # 在对应区域内查找结果
            items = await section.query_selector_all('search-page-media-row')
            results = []
            
            # 如果没有搜索结果
            if not items:
                print(f"Rotten Tomatoes在{media_type}区域未找到任何结果")
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            print(f"Rotten Tomatoes找到 {len(items)} 个{media_type}类型结果")
            
            # === 选集剧特殊处理：如果使用副标题搜索，直接接受第一个结果 ===
            is_anthology = tmdb_info.get("is_anthology", False)
            search_variants = tmdb_info.get("search_variants", [])
            
            # 检查当前搜索是否使用了副标题
            using_subtitle_search = False
            if is_anthology and search_variants:
                # 从URL中提取搜索关键词
                import urllib.parse
                search_query = urllib.parse.unquote(search_url.split("search=")[-1].split("&")[0] if "search=" in search_url else "").lower()
                
                # 检查是否匹配副标题变体（必须完全匹配，不是包含关系）
                for variant in search_variants:
                    if variant.get("for_rottentomatoes"):
                        variant_title = variant.get("title", "").lower()
                        # 严格匹配：搜索的就是纯副标题（不包含主标题）
                        if variant_title == search_query:
                            using_subtitle_search = True
                            print(f"Rotten Tomatoes[选集剧] 使用副标题搜索：{variant.get('title')}")
                            break
            
            if using_subtitle_search and items:
                # 直接取第一个结果
                item = items[0]
                try:
                    # 获取标题和链接
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
                            "match_score": 100,  # 直接给最高分
                            "is_anthology_match": True
                        }]
                except Exception as e:
                    print(f"Rotten Tomatoes获取选集剧第一个结果时出错: {e}")
                    # 继续正常流程
            
            # === 正常搜索流程 ===
            for item in items:
                try:
                    # 获取标题和链接
                    title_elem = await item.query_selector('[data-qa="info-name"]')
                    if title_elem:
                        title = (await title_elem.inner_text()).strip()
                        url = await title_elem.get_attribute('href')
                        
                        # 根据媒体类型获取年份
                        if media_type == 'movie':
                            year = await item.get_attribute('releaseyear')
                        else:
                            year = await item.get_attribute('startyear')
                        
                        # 验证URL是否匹配正确的媒体类型
                        url_type_match = ('/m/' in url) if media_type == 'movie' else ('/tv/' in url)
                        if not url_type_match:
                            continue
                    
                        # 精准匹配标题和年份
                        if title_elem:
                            title = (await title_elem.inner_text()).strip()
                            url = await title_elem.get_attribute('href')
                            
                            # 根据媒体类型获取年份
                            if media_type == 'movie':
                                year = await item.get_attribute('releaseyear')
                            else:
                                year = await item.get_attribute('startyear')
                            
                            # 验证URL是否匹配正确的媒体类型
                            url_type_match = ('/m/' in url) if media_type == 'movie' else ('/tv/' in url)
                            if not url_type_match:
                                continue

                            # 修改匹配逻辑
                            title_match = title.lower() == tmdb_info['title'].lower()
                            year_match = False
                            
                            if year:
                                year_match = year == tmdb_info['year']
                            else:
                                # 对于未来播出的剧集，如果标题完全匹配就认为是正确结果
                                current_year = datetime.now().year
                                target_year = int(tmdb_info['year'])
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

                            # 如果不是精确匹配，添加到结果列表用于模糊匹配
                            result_data = {
                                "title": title,
                                "year": year or tmdb_info['year'],
                                "url": url,
                                "number_of_seasons": tmdb_info.get("number_of_seasons", 0)
                            }
                            
                            # 计算匹配度时也考虑未来剧集的特殊情况
                            if not year and target_year > current_year:
                                # 对于未来剧集，增加标题匹配的权重
                                result_data["match_score"] = await calculate_match_degree(
                                    tmdb_info, 
                                    result_data,
                                    platform="rottentomatoes",
                                    title_weight=0.9
                                )
                            else:
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

async def handle_metacritic_search(page, search_url):
    """处理Metacritic搜索"""
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
        print(f"访问 Metacritic 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=10000)
        await asyncio.sleep(0.2)
    
        # 立即检查是否出现访问频率限制
        rate_limit = await check_rate_limit(page, "metacritic")
        if rate_limit:
            print("检测到Metacritic访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            # 检查搜索结果
            items = await page.query_selector_all('[data-testid="search-result-item"]')
            results = []
            
            # 如果没有搜索结果
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
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

async def handle_letterboxd_search(page, search_url, tmdb_info):
    """处理Letterboxd搜索"""
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
        print(f"访问 Letterboxd 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=10000)
        await asyncio.sleep(0.2)
    
        # 检查访问限制
        rate_limit = await check_rate_limit(page, "letterboxd")
        if rate_limit:
            print("检测到Letterboxd访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"], "status_reason": "访问频率限制"} 
        
        try:
            # 等待搜索结果加载
            try:
                await page.wait_for_selector('.results li', timeout=5000)
            except Exception as e:
                print(f"Letterboxd等待搜索结果超时: {e}")
            
            # 获取搜索结果（TMDB ID搜索通常返回唯一结果）
            items = await page.query_selector_all('div[data-item-link]')
            
            if not items:
                print("Letterboxd未找到搜索结果")
                return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
            
            # 提取第一个结果的详情页链接
            first_item = items[0]
            try:
                detail_path = None
                title = "Unknown"
                
                detail_path = await first_item.get_attribute('data-item-link')
                if detail_path:
                    title = await first_item.get_attribute('data-item-name') or title
                
                if not detail_path:
                    print("Letterboxd 无法提取详情页链接")
                    # 调试：打印页面HTML片段
                    html_snippet = await first_item.inner_html()
                    print(f"HTML片段: {html_snippet[:500]}")
                    return {"status": RATING_STATUS["NO_FOUND"], "status_reason": "平台未收录"}
                
                # 构建完整URL
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
    
async def extract_rating_info(media_type, platform, tmdb_info, search_results, request=None):
    """从各平台详情页中提取对应评分数据"""
    async def _extract_rating_with_retry():
        try:
            await random_delay()
            # 检查请求是否已被取消
            if request and await request.is_disconnected():
                print("请求已被取消,停止执行")
                return {"status": "cancelled"}

            # === Trakt 特殊处理 ===
            # Trakt使用API而不是网页爬取，需要特殊处理
            if platform == "trakt":
                try:
                    # 获取选集剧信息（如果有）
                    series_info = tmdb_info.get("series_info")
                    
                    # 使用anthology_handler搜索Trakt
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
                        
                        # 如果有分季评分数据，也一并返回
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

            # 处理特殊状态
            if isinstance(search_results, dict) and "status" in search_results:
                status = search_results["status"]
                if status == "cancelled":
                    return search_results
                elif status == RATING_STATUS["RATE_LIMIT"]:
                    return create_rating_data(RATING_STATUS["RATE_LIMIT"], "频率限制")
                elif status == RATING_STATUS["TIMEOUT"]:
                    return create_rating_data(RATING_STATUS["TIMEOUT"], "获取超时")
                elif status == RATING_STATUS["FETCH_FAILED"]:
                    return create_rating_data(RATING_STATUS["FETCH_FAILED"], "获取失败")

            # 检查请求状态
            if request and await request.is_disconnected():
                print("请求已被取消,停止执行")
                return {"status": "cancelled"}

            # 只有在确实执行了搜索但没有结果时才返回 NO_FOUND
            if isinstance(search_results, list) and not search_results:
                print(f"\n{platform}平台未收录此影视")
                return create_rating_data(RATING_STATUS["NO_FOUND"])

            # 计算最佳匹配
            best_match = None
            highest_score = 0
            matched_results = []
            
            for result in search_results:
                if isinstance(result, str):
                    result = {"title": result}

                # 检查请求状态
                if request and await request.is_disconnected():
                    print("请求已被取消,停止执行")
                    return {"status": "cancelled"}

                score = await calculate_match_degree(tmdb_info, result, platform)
                result["match_score"] = score
                
                # 对于多季剧集，收集所有匹配度较高的结果
                if media_type == "tv" and len(tmdb_info.get("seasons", [])) > 1:
                    if score > 50:  # 设置一个合理的阈值
                        matched_results.append(result)
                else:
                    # 对于电影或单季剧集，选择最佳匹配
                    if score > highest_score:
                        highest_score = score
                        best_match = result

            # 对于多季剧集，如果有多个匹配结果，按匹配度排序
            if media_type == "tv" and len(tmdb_info.get("seasons", [])) > 1 and matched_results:
                matched_results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
                print(f"{platform} 找到 {len(matched_results)} 个匹配的季")
                
                best_match = matched_results[0]  # 选择匹配度最高的作为主要结果
            elif not best_match:
                print(f"在{platform}平台未找到匹配的结果")
                return create_empty_rating_data(platform, media_type, RATING_STATUS["NO_FOUND"])

            detail_url = best_match["url"]
            print(f"{platform} 找到最佳匹配结果: {best_match['title']} ({best_match.get('year', '')})")
            print(f"{platform} 访问详情页: {detail_url}")

            # 使用浏览器池执行评分提取
            async def extract_with_browser(browser):
                context = None
                try:
                    # 选择 User-Agent
                    selected_user_agent = random.choice(USER_AGENTS)

                    # 上下文配置
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

                    # 如果是豆瓣，设置用户IP
                    if platform == "douban" and request:
                        client_ip = get_client_ip(request)
                        print(f"豆瓣请求使用IP: {client_ip}")
                        await page.set_extra_http_headers({
                            'X-Forwarded-For': client_ip,
                            'X-Real-IP': client_ip
                        })

                    # 检查请求状态
                    if request and await request.is_disconnected():
                        print("请求已被取消,停止执行")
                        return {"status": "cancelled"}

                    # 根据平台特点设置不同的加载策略
                    if platform == "imdb":
                        # IMDB 评分是动态加载的
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    elif platform == "douban":
                        # 豆瓣评分在 DOM 中就有
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    elif platform == "letterboxd":
                        # Letterboxd 评分在 DOM 中就有
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    elif platform == "rottentomatoes":
                        # 烂番茄需要等待评分加载
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    elif platform == "metacritic":
                        # Metacritic 评分在 DOM 中就有
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)
                    else:
                        # 默认策略
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=15000)
                        await asyncio.sleep(0.3)

                    try:
                        if platform == "douban":
                            # 多季剧集：优先分季抓取，确保同时获取所有季的评分
                            if media_type == "tv" and len(tmdb_info.get("seasons", [])) > 1 and matched_results:
                                print("检测到多季剧集，优先进行分季抓取以获取所有季评分")
                                rating_data = await extract_douban_rating(page, media_type, matched_results)
                            else:
                                # 单季或无法识别出分季：优先使用豆瓣API（避免限流），失败则回退到网页抓取
                                rating_data = None
                                douban_id = None
                                
                                # 尝试从搜索结果中提取豆瓣ID
                                if isinstance(search_results, list) and len(search_results) > 0:
                                    first_result = search_results[0]
                                    if isinstance(first_result, dict) and 'url' in first_result:
                                        # 从URL中提取ID: https://movie.douban.com/subject/12345678/
                                        url_match = re.search(r'/subject/(\d+)', first_result['url'])
                                        if url_match:
                                            douban_id = url_match.group(1)
                                
                                # 如果有豆瓣ID，优先使用API
                                if douban_id:
                                    print(f"尝试使用豆瓣API获取评分 (ID: {douban_id})")
                                    rating_data = await get_douban_rating_via_api(douban_id)
                                
                                # 如果API失败，fallback到网页抓取
                                if not rating_data or rating_data.get("status") not in [RATING_STATUS["SUCCESSFUL"], RATING_STATUS["NO_RATING"]]:
                                    if douban_id:
                                        print("豆瓣API失败，fallback到网页抓取")
                                    rating_data = await extract_douban_rating(page, media_type, search_results)
                        elif platform == "imdb":
                            # 优先使用GraphQL API（速度更快）
                            imdb_id = tmdb_info.get("imdb_id")
                            rating_data = None
                            
                            if imdb_id:
                                print(f"尝试使用IMDB GraphQL API获取评分 (ID: {imdb_id})")
                                rating_data = await get_imdb_rating_via_graphql(imdb_id)
                            
                            # 如果API失败，fallback到网页抓取
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

                        # 检查请求状态
                        if request and await request.is_disconnected():
                            print("请求已被取消,停止执行")
                            return {"status": "cancelled"}

                        if rating_data:
                            # 检查评分数据是否完整
                            if media_type == "movie":
                                status = check_movie_status(rating_data, platform)
                            else:
                                status = check_tv_status(rating_data, platform)

                            rating_data["status"] = status

                            # 对于特殊平台的子数据状态设置
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
                    # 只关闭上下文，不关闭浏览器（浏览器由池管理）
                    if context:
                        try:
                            await context.close()
                        except Exception:
                            pass

            try:
                # 使用浏览器池执行评分提取
                return await browser_pool.execute_in_browser(extract_with_browser)
            except Exception as e:
                print(f"访问{platform}详情页时出错: {e}")
                print(traceback.format_exc())
                return create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])

        except Exception as e:
            print(f"执行评分提取时出错: {e}")
            print(traceback.format_exc())
            return create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])

    # 调用带重试的内部函数
    return await _extract_rating_with_retry()

async def get_douban_rating_via_api(douban_id: str) -> dict:
    """使用豆瓣移动端API获取评分（避免限流）"""
    try:
        import aiohttp
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        url = f"https://m.douban.com/rexxar/api/v2/movie/{douban_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
            'Referer': f'https://m.douban.com/movie/subject/{douban_id}/'
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=10, ssl=False) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # 提取评分信息
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
        # 等待页面加载完成
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception as e:
            print(f"豆瓣等待domcontentloaded超时或失败，继续尝试直接解析: {e}")
        # 获取页面内容（带简易重试）
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
            # 无法获取内容时返回超时
            return create_empty_rating_data("douban", media_type, RATING_STATUS["TIMEOUT"])
        
        # 使用正则表达式提取JSON数据
        json_match = re.search(r'"aggregateRating":\s*{\s*"@type":\s*"AggregateRating",\s*"ratingCount":\s*"([^"]+)",\s*"bestRating":\s*"([^"]+)",\s*"worstRating":\s*"([^"]+)",\s*"ratingValue":\s*"([^"]+)"', content)
        
        if json_match:
            rating_people = json_match.group(1)
            rating = json_match.group(4)
            print(f"豆瓣评分获取成功")
        else:
            # 如果JSON提取失败，回退到原来的正则表达式方法
            rating_match = re.search(r'<strong[^>]*class="ll rating_num"[^>]*>([^<]*)</strong>', content)
            rating = rating_match.group(1).strip() if rating_match and rating_match.group(1).strip() else "暂无"
            
            people_match = re.search(r'<span[^>]*property="v:votes">(\d+)</span>', content)
            rating_people = people_match.group(1) if people_match else "暂无"
            print(f"豆瓣评分获取成功")
            
        if media_type != "tv":
            # 检查是否显示"暂无评分"或"尚未上映"
            if "暂无评分" in content or "尚未上映" in content:
                return create_empty_rating_data("douban", media_type, RATING_STATUS["NO_RATING"])
            
            # 检查评分和评分人数是否有效
            if rating in [None, "暂无"] or rating_people in [None, "暂无"]:
                return create_empty_rating_data("douban", media_type, RATING_STATUS["FETCH_FAILED"])
                
            return {
                "status": RATING_STATUS["SUCCESSFUL"],
                "rating": rating,
                "rating_people": rating_people
            }
            
        # TV剧集评分处理
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
        
        # 按季数排序
        season_results.sort(key=lambda x: x["season_number"])
        
        # 如果没有找到任何季信息，按单季剧集处理
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
        
        # 多季剧集处理
        ratings = {
            "status": RATING_STATUS["SUCCESSFUL"],
            "seasons": []
        }
        
        all_seasons_no_rating = True
        processed_seasons = set()
        
        # 处理每一季
        for season_info in season_results:
            try:
                season_number = season_info["season_number"]
                
                # 避免重复处理同一季
                if season_number in processed_seasons:
                    continue
                    
                processed_seasons.add(season_number)
                
                url = season_info["url"]
                if not url:
                    continue

                # 添加随机延迟，避免触发反爬虫机制
                await random_delay()
                
                # 为每个季创建新的页面上下文，避免连续访问导致的问题
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                    await asyncio.sleep(0.2)  # 减少等待时间
                except Exception as e:
                    print(f"豆瓣访问第{season_number}季页面失败: {e}")
                    continue
                
                # 首先获取页面内容
                try:
                    season_content = await page.content()
                except Exception as e:
                    print(f"豆瓣获取第{season_number}季页面内容失败: {e}")
                    continue
                
                for attempt in range(3):
                    try:
                        # 首先尝试从JSON数据中提取评分
                        json_match = re.search(r'"aggregateRating":\s*{\s*"@type":\s*"AggregateRating",\s*"ratingCount":\s*"([^"]+)",\s*"bestRating":\s*"([^"]+)",\s*"worstRating":\s*"([^"]+)",\s*"ratingValue":\s*"([^"]+)"', season_content)
                        
                        if json_match:
                            season_rating_people = json_match.group(1)
                            season_rating = json_match.group(4)
                            print(f"豆瓣提取到第{season_number}季评分成功")
                        else:
                            # 如果JSON提取失败，使用JavaScript获取评分
                            season_rating = await page.evaluate('''() => {
                                const ratingElement = document.querySelector('strong.rating_num');
                                return ratingElement ? ratingElement.textContent.trim() : "暂无";
                            }''')
                            
                            season_rating_people = await page.evaluate('''() => {
                                const votesElement = document.querySelector('span[property="v:votes"]');
                                return votesElement ? votesElement.textContent.trim() : "暂无";
                            }''')
                            
                            # 如果获取到的是空值，尝试使用正则表达式作为备选方案
                            if season_rating in ["暂无", "", None]:
                                rating_match = re.search(r'<strong[^>]*class="ll rating_num"[^>]*>([^<]*)</strong>', season_content)
                                if rating_match and rating_match.group(1).strip():
                                    season_rating = rating_match.group(1).strip()
                                
                            if season_rating_people in ["暂无", "", None]:
                                people_match = re.search(r'<span[^>]*property="v:votes">(\d+)</span>', season_content)
                                if people_match:
                                    season_rating_people = people_match.group(1)
                            
                            print(f"豆瓣使用备选方法提取第{season_number}季评分成功")
                        
                        # 如果成功获取到评分，跳出重试循环
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
                
                # 检查是否真的没有评分
                if "暂无评分" in season_content or "尚未上映" in season_content:
                    ratings["seasons"].append({
                        "season_number": season_number,
                        "rating": "暂无",
                        "rating_people": "暂无"
                    })
                else:
                    if season_rating not in ["暂无", "", None] and season_rating_people not in ["暂无", "", None]:
                        all_seasons_no_rating = False
                        ratings["seasons"].append({
                            "season_number": season_number,
                            "rating": season_rating,
                            "rating_people": season_rating_people
                        })
                    else:
                        continue
                
            except Exception as e:
                print(f"豆瓣获取第{season_number}季评分时出错: {e}")
                # 如果是超时错误，记录但不影响其他季的处理
                if "Timeout" in str(e):
                    print(f"豆瓣第{season_number}季访问超时，跳过此季")
                continue
        
        # 如果没有找到任何季的评分，但有总评分，则使用总评分
        if not ratings["seasons"] and rating not in [None, "暂无"] and rating_people not in [None, "暂无"]:
            return {
                "status": RATING_STATUS["SUCCESSFUL"],
                "rating": rating,
                "rating_people": rating_people
            }
        
        # 根据所有季的状态设置整体状态
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
        
        # GraphQL查询
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
                    
                    # 检查是否有数据
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
        # 策略：先快速尝试，失败后再等待重试
        max_attempts = 2
        
        for attempt in range(max_attempts):
            try:
                # 第一次快速尝试，第二次等待更长时间
                if attempt == 0:
                    # 快速尝试（不等待）
                    print(f"IMDb快速尝试提取评分...")
                else:
                    # 等待后重试
                    print(f"IMDb等待后重试提取评分...")
                    try:
                        await page.wait_for_selector('script[id="__NEXT_DATA__"]', timeout=5000)
                    except Exception as e:
                        print(f"IMDb等待__NEXT_DATA__脚本超时: {e}")
                        # 即使超时也继续尝试提取
                
                # 获取页面源代码
                content = await page.content()
                
                # 使用正则表达式提取JSON数据
                json_match = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>\s*({[^<]+})\s*</script>', content)
                
                if json_match:
                    # 成功找到JSON，跳出重试循环
                    break
                elif attempt < max_attempts - 1:
                    # 没找到且还有重试机会，等待后重试
                    print("IMDb未找到__NEXT_DATA__，等待后重试...")
                    await asyncio.sleep(1)
                    continue
                else:
                    # 最后一次尝试也失败
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
            # 解析JSON数据
            json_data = json.loads(json_match.group(1))
            
            # 提取评分数据
            page_props = json_data.get("props", {}).get("pageProps", {})
            above_the_fold = page_props.get("aboveTheFoldData", {})
            ratings_summary = above_the_fold.get("ratingsSummary", {})
            
            # 获取评分和评分人数
            aggregate_rating = ratings_summary.get("aggregateRating")
            vote_count = ratings_summary.get("voteCount")
            
            if aggregate_rating is None:
                print("IMDb中未找到评分数据")
                return {
                    "rating": "暂无",
                    "rating_people": "暂无",
                    "status": RATING_STATUS["NO_RATING"]
                }
            
            # 格式化评分和人数
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
        
@dataclass
class RTRating:
    tomatometer: str = "暂无"
    audience_score: str = "暂无"
    critics_avg: str = "暂无"
    audience_avg: str = "暂无"
    critics_count: str = "暂无"
    audience_count: str = "暂无"

async def get_rt_rating_fast(page) -> dict:
    """快速从Rotten Tomatoes页面提取JSON数据"""
    try:
        # 方法1: 直接通过JavaScript执行获取JSON（最快）
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
        
        # 方法2: Fallback到正则表达式提取
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
        # 使用优化的快速提取方法
        score_data = await get_rt_rating_fast(page)
        
        if not score_data:
            return create_empty_rating_data("rottentomatoes", media_type, RATING_STATUS["NO_RATING"])
            
        overlay_data = score_data.get("overlay", {})
        
        # 检查是否有观众和专业评分数据
        has_audience = overlay_data.get("hasAudienceAll", False)
        has_critics = overlay_data.get("hasCriticsAll", False)
        
        # 如果两种评分都没有，返回NO_RATING
        if not has_audience and not has_critics:
            return create_empty_rating_data("rottentomatoes", media_type, RATING_STATUS["NO_RATING"])
        
        audience_data = overlay_data.get("audienceAll", {})
        critics_data = overlay_data.get("criticsAll", {})
        
        # 提取观众评分数据
        audience_score = "暂无"
        audience_avg = "暂无"
        audience_count = "暂无"
        if has_audience:
            audience_score = audience_data.get("scorePercent", "暂无").rstrip("%") if audience_data.get("scorePercent") else "暂无"
            avg_rating = audience_data.get("averageRating")
            audience_avg = avg_rating if avg_rating and avg_rating not in ["暂无", ""] else "暂无"
            audience_count = audience_data.get("bandedRatingCount", "暂无")
        
        # 提取专业评分数据
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
        
        # 处理剧集分季数据
        if media_type == "tv":
            # 获取页面内容用于季度数据解析
            content = await page.content()
            # === 选集剧特殊处理：从页面解析所有季，根据年份匹配 ===
            if tmdb_info.get("is_anthology"):
                print(f"\n[选集剧]Rotten Tomatoes分季处理")
                tmdb_year = tmdb_info.get("year", "")
                
                # 解析页面中的Seasons部分
                # <tile-season href="/tv/monster_2022/s01">
                #   <rt-text slot="title">DAHMER -- The Jeffrey Dahmer Story</rt-text>
                #   <rt-text slot="airDate">Sep 2022</rt-text>
                season_tiles = re.findall(
                    r'<tile-season[^>]*href="([^"]+)"[^>]*>.*?'
                    r'<rt-text[^>]*slot="title"[^>]*>([^<]+)</rt-text>.*?'
                    r'<rt-text[^>]*slot="airDate"[^>]*>([^<]+)</rt-text>',
                    content,
                    re.DOTALL | re.IGNORECASE
                )
                
                print(f"Rotten Tomatoes解析到 {len(season_tiles)} 个季")
                
                # 根据年份匹配到正确的季
                matched_season = None
                for season_url, season_title, season_date in season_tiles:
                    # 从日期中提取年份 (如 "Oct 2025" -> "2025")
                    year_match = re.search(r'(\d{4})', season_date)
                    if year_match:
                        season_year = year_match.group(1)
                        if season_year == tmdb_year:
                            # 从URL中提取季号（如 /tv/monster_2022/s03 -> 3）
                            season_num_match = re.search(r'/s(\d+)', season_url)
                            if season_num_match:
                                season_number = int(season_num_match.group(1))
                                matched_season = (season_url, season_number, season_title.strip(), season_year)
                                break
                
                if matched_season:
                    season_url, season_number, season_title, season_year = matched_season
                    # 确保URL完整
                    if not season_url.startswith('http'):
                        season_url = f"https://www.rottentomatoes.com{season_url}"
                    
                    print(f"Rotten Tomatoes访问匹配的季: {season_url}")
                    try:
                        await page.goto(season_url)
                        await asyncio.sleep(0.2)
                        season_content = await page.content()
                        
                        # 对于选集剧单季条目：映射为Season 1
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
                                "_season_year": season_year
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
            
            # 单季剧集处理
            elif tmdb_info.get("number_of_seasons", 0) == 1:
                print(f"\n[单季剧]Rotten Tomatoes分季处理")
                # 尝试解析页面中的第一季数据
                season_tiles = re.findall(
                    r'<tile-season[^>]*href="([^"]+)"[^>]*>',
                    content,
                    re.DOTALL | re.IGNORECASE
                )
                
                if season_tiles:
                    # 取第一个季的URL
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
                                    "audience_avg": "暂无"
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
            
            # 普通多季剧集处理
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
                        
                        # 检查分季是否有观众和专业评分数据
                        season_has_audience = season_overlay.get("hasAudienceAll", False)
                        season_has_critics = season_overlay.get("hasCriticsAll", False)
                        
                        # 如果两种评分都没有，跳过这一季
                        if not season_has_audience and not season_has_critics:
                            continue
                            
                        season_audience = season_overlay.get("audienceAll", {})
                        season_critics = season_overlay.get("criticsAll", {})
                        
                        # 提取分季评分数据
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
                            "audience_count": season_audience_count
                        }
                        
                        ratings["seasons"].append(season_data)
                        
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
        
        # 尝试提取页面中的JSON-LD结构化数据
        json_ld_match = re.search(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', content, re.DOTALL)
        if json_ld_match:
            try:
                import json
                json_data = json.loads(json_ld_match.group(1))
                
                # 检查aggregateRating数据
                if isinstance(json_data, dict) and 'aggregateRating' in json_data:
                    agg_rating = json_data['aggregateRating']
                    
                    # Metacritic的评分是0-100，需要检查
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
        
        # 尝试从页面中的其他JSON数据提取
        # Metacritic页面可能包含window.__REACT_DATA__等全局变量
        react_data_match = re.search(r'window\.__REACT_DATA__\s*=\s*({.*?});', content, re.DOTALL)
        if react_data_match:
            try:
                import json
                react_data = json.loads(react_data_match.group(1))
                
                # 尝试从React数据中提取评分
                # 具体路径需要根据实际数据结构调整
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
        # 首先尝试快速从JSON提取
        json_rating = await get_metacritic_rating_via_json(page)
        
        # 获取页面源代码
        content = await page.content()
        
        # 初始化评分数据
        ratings = {
            "overall": {
                "metascore": "暂无",
                "critics_count": "暂无", 
                "userscore": "暂无",
                "users_count": "暂无"
            },
            "seasons": []
        }
        
        # 如果JSON提取成功，优先使用JSON数据（跳过复杂的HTML解析）
        if json_rating:
            if json_rating.get("metascore"):
                ratings["overall"]["metascore"] = json_rating["metascore"]
            if json_rating.get("critics_count"):
                ratings["overall"]["critics_count"] = json_rating["critics_count"]

        # 从网页源代码中提取专业评分（作为fallback）
        if ratings["overall"]["metascore"] == "暂无":
            metascore_match = re.search(r'title="Metascore (\d+) out of 100"', content)
            if metascore_match:
                ratings["overall"]["metascore"] = metascore_match.group(1)
            else:
                # 备选方案：使用DOM选择器
                metascore_elem = await page.query_selector('div[data-v-e408cafe][title*="Metascore"] span')
                if metascore_elem:
                    metascore_text = await metascore_elem.inner_text()
                    if metascore_text and metascore_text.lower() != 'tbd':
                        ratings["overall"]["metascore"] = metascore_text

        # 从网页源代码中提取专业评分人数（作为fallback）
        if ratings["overall"]["critics_count"] == "暂无":
            critics_count_match = re.search(r'Based on (\d+) Critic Reviews?', content)
            if critics_count_match:
                ratings["overall"]["critics_count"] = critics_count_match.group(1)
            else:
                # 备选方案：使用DOM选择器
                critics_count_elem = await page.query_selector('a[data-testid="critic-path"] span')
                if critics_count_elem:
                    critics_text = await critics_count_elem.inner_text()
                    match = re.search(r'Based on (\d+) Critic', critics_text)
                    if match:
                        ratings["overall"]["critics_count"] = match.group(1)

        # 从网页源代码中提取用户评分
        userscore_match = re.search(r'title="User score ([\d.]+) out of 10"', content)
        if userscore_match:
            ratings["overall"]["userscore"] = userscore_match.group(1)
        else:
            # 备选方案：使用DOM选择器
            userscore_elem = await page.query_selector('div[data-v-e408cafe][title*="User score"] span')
            if userscore_elem:
                userscore_text = await userscore_elem.inner_text()
                if userscore_text and userscore_text.lower() != 'tbd':
                    ratings["overall"]["userscore"] = userscore_text

        # 从网页源代码中提取用户评分人数
        users_count_match = re.search(r'Based on ([\d,]+) User Ratings?', content)
        if users_count_match:
            ratings["overall"]["users_count"] = users_count_match.group(1).replace(',', '')
        else:
            # 备选方案：使用DOM选择器
            users_count_elem = await page.query_selector('a[data-testid="user-path"] span')
            if users_count_elem:
                users_text = await users_count_elem.inner_text()
                match = re.search(r'Based on ([\d,]+) User', users_text)
                if match:
                    ratings["overall"]["users_count"] = match.group(1).replace(',', '')
        
        print(f"Metacritic评分获取成功")

        # 如果是剧集,尝试解析分季信息
        if media_type == "tv":
            # === 选集剧特殊处理：从页面解析所有季，根据年份匹配 ===
            if tmdb_info.get("is_anthology"):
                print(f"\n[选集剧]Metacritic分季处理")
                tmdb_year = tmdb_info.get("year", "")
                
                # 解析页面中的All Seasons列表
                season_cards = re.findall(
                    r'<div[^>]*data-testid="seasons-modal-card"[^>]*>.*?'
                    r'<a href="([^"]+)".*?'
                    r'SEASON\s+(\d+).*?'
                    r'<span>\s*(\d{4})\s*</span>',
                    content,
                    re.DOTALL | re.IGNORECASE
                )
                
                print(f"Metacritic解析到 {len(season_cards)} 个季")
                
                # 根据年份匹配到正确的季
                matched_season = None
                for season_url, season_num, season_year in season_cards:
                    if season_year == tmdb_year:
                        matched_season = (season_url, int(season_num), season_year)
                        break
                
                if matched_season:
                    season_url, season_number, season_year = matched_season
                    # 确保URL完整
                    if not season_url.startswith('http'):
                        season_url = f"https://www.metacritic.com{season_url}"
                    
                    print(f"Metacritic访问匹配的季: {season_url}")
                    try:
                        await page.goto(season_url, wait_until='domcontentloaded')
                        await asyncio.sleep(0.2)

                        # 对于选集剧单季条目：
                        # Metacritic的Season 3 → 映射为 Season 1（因为TMDB认为这是单季剧集）
                        # 这样前端就能找到评分数据
                        tmdb_season_number = 1  # 单季剧集总是Season 1
                        
                        season_data = {
                            "season_number": tmdb_season_number,  # 使用TMDB的季号（1）
                            "metascore": "暂无",
                            "critics_count": "暂无",
                            "userscore": "暂无",
                            "users_count": "暂无",
                            "_original_season": season_number,  # 保存Metacritic的原始季号
                            "_season_year": season_year  # 保存年份信息
                        }

                        # 获取分季页面源代码
                        season_content = await page.content()
                        
                        # 从网页源代码中提取分季专业评分
                        season_metascore_match = re.search(r'title="Metascore (\d+) out of 100"', season_content)
                        if season_metascore_match:
                            season_data["metascore"] = season_metascore_match.group(1)
                        
                        # 提取其他评分数据
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
            
            # 单季剧集处理
            elif tmdb_info.get("number_of_seasons", 0) == 1:
                print(f"\n[单季剧集]Metacritic分季处理")
                # 尝试解析页面中的第一季数据
                season_cards = re.findall(
                    r'<div[^>]*data-testid="seasons-modal-card"[^>]*>.*?'
                    r'<a href="([^"]+)"',
                    content,
                    re.DOTALL | re.IGNORECASE
                )
                
                if season_cards:
                    # 取第一个季的URL
                    season_url = season_cards[0]
                    if not season_url.startswith('http'):
                        season_url = f"https://www.metacritic.com{season_url}"
                    
                    print(f"Metacritic访问第一季: {season_url}")
                    try:
                        await page.goto(season_url, wait_until='domcontentloaded')
                        await asyncio.sleep(0.2)
                        
                        season_data = {
                            "season_number": 1,
                            "metascore": "暂无",
                            "critics_count": "暂无",
                            "userscore": "暂无",
                            "users_count": "暂无"
                        }

                        # 获取分季页面源代码
                        season_content = await page.content()
                        
                        # 从网页源代码中提取分季专业评分
                        season_metascore_match = re.search(r'title="Metascore (\d+) out of 100"', season_content)
                        if season_metascore_match:
                            season_data["metascore"] = season_metascore_match.group(1)
                        
                        # 提取其他评分数据
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
            
            # 普通多季剧集处理
            elif tmdb_info.get("number_of_seasons", 0) > 1:
                print(f"\n[多季剧集]Metacritic分季处理")
                base_url = page.url.rstrip('/')
                
                for season in tmdb_info.get("seasons", []):
                    season_number = season.get("season_number")
                    try:
                        season_url = f"{base_url}/season-{season_number}/"
                        await page.goto(season_url, wait_until='domcontentloaded')
                        await asyncio.sleep(0.2)

                        season_data = {
                            "season_number": season_number,
                            "metascore": "暂无",
                            "critics_count": "暂无",
                            "userscore": "暂无",
                            "users_count": "暂无"
                        }

                        season_content = await page.content()
                        
                        # 提取评分数据
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
                        print(f"Metacritic获取第{season_number}季评分数据时出错: {e}")
                        continue

        # 检查评分状态
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
        # 获取页面源代码
        content = await page.content()
        
        # 使用正则表达式提取JSON数据
        json_match = re.search(r'"aggregateRating":\s*{\s*"bestRating":\s*(\d+),\s*"reviewCount":\s*(\d+),\s*"@type":\s*"aggregateRating",\s*"ratingValue":\s*([\d.]+),\s*"description":\s*"[^"]*",\s*"ratingCount":\s*(\d+),\s*"worstRating":\s*(\d+)\s*}', content)
        
        if json_match:
            rating = json_match.group(3)  # ratingValue
            rating_count = json_match.group(4)  # ratingCount
            print(f"Letterboxd评分获取成功")
            
            return {
                "rating": rating,
                "rating_count": rating_count,
                "status": RATING_STATUS["SUCCESSFUL"]
            }
        else:            
            # 获取评分元素
            rating_elem = await page.query_selector('span.average-rating a.tooltip')
            
            if not rating_elem:
                print("Letterboxd 未找到评分元素")
                return {
                    "rating": "暂无",
                    "rating_count": "暂无",
                    "status": RATING_STATUS["NO_RATING"]
                }
                
            # 获取评分
            rating = await rating_elem.inner_text()
            
            # 获取评分人数
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
        
    # 检查是否有明确的状态
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
        
    # 检查是否有明确的状态
    if "status" in platform_data:
        return platform_data["status"]
        
    if platform == "douban":
        seasons = platform_data.get("seasons", [])
        if not seasons:
            return RATING_STATUS["FETCH_FAILED"]
            
        # 检查是否所有季都是"暂无"评分
        all_no_rating = all(
            season.get("rating") == "暂无" and season.get("rating_people") == "暂无"
            for season in seasons
        )
        if all_no_rating:
            return RATING_STATUS["NO_RATING"]
            
        # 检查每季数据
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
        
        # 检查整部剧集数据
        series_fields = ["tomatometer", "audience_score", "critics_avg", "critics_count", "audience_count", "audience_avg"]
        all_series_no_rating = all(series_data.get(key) in ["暂无", "tbd"] for key in series_fields)
        
        # 检查每季数据是否都是"暂无"或"tbd"
        all_seasons_no_rating = all(
            all(season.get(key) in ["暂无", "tbd"] for key in ["tomatometer", "audience_score", "critics_avg", "audience_avg", "critics_count", "audience_count"])
            for season in seasons_data
        )
        
        if all_series_no_rating and all_seasons_no_rating:
            return RATING_STATUS["NO_RATING"]
            
        # 检查整部剧集数据
        if not all(series_data.get(key) not in [None, "出错"] for key in series_fields):
            return RATING_STATUS["FETCH_FAILED"]
            
        # 检查每季数据
        for season in seasons_data:
            season_fields = ["tomatometer", "audience_score", "critics_avg", "audience_avg", "critics_count", "audience_count"]
            # 允许"暂无"和"tbd"，但不允许None和"出错"
            if not all(season.get(key) in ["暂无", "tbd"] or season.get(key) not in [None, "出错"] for key in season_fields):
                return RATING_STATUS["FETCH_FAILED"]
        return RATING_STATUS["SUCCESSFUL"]
        
    elif platform == "metacritic":
        overall_data = platform_data.get("overall", {})
        seasons_data = platform_data.get("seasons", [])
        
        # 检查整体数据是否都是"暂无"或"tbd"
        overall_fields = ["metascore", "critics_count", "userscore", "users_count"]
        all_overall_no_rating = all(overall_data.get(key) in ["暂无", "tbd"] for key in overall_fields)
        
        # 检查每季数据是否都是"暂无"或"tbd"
        all_seasons_no_rating = all(
            all(season.get(key) in ["暂无", "tbd"] for key in ["metascore", "critics_count", "userscore", "users_count"])
            for season in seasons_data
        )
        
        if all_overall_no_rating and all_seasons_no_rating:
            return RATING_STATUS["NO_RATING"]
            
        # 检查整体数据
        if not all(overall_data.get(key) not in [None, "出错"] for key in overall_fields):
            return RATING_STATUS["FETCH_FAILED"]
            
        # 检查每季数据
        for season in seasons_data:
            season_fields = ["metascore", "critics_count", "userscore", "users_count"]
            # 允许"暂无"和"tbd"，但不允许None和"出错"
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
    
    # 默认返回基础错误数据结构
    return {
        "rating": "出错",
        "rating_people": "出错",
        "status": status,
        "status_reason": status_reason
    }

def format_rating_output(all_ratings, media_type):
    """格式化所有平台的评分信息（静默模式，只返回数据不打印）"""
    # 构建返回的数据结构（添加状态信息）
    formatted_data = copy.deepcopy(all_ratings)
    
    for platform, data in formatted_data.items():
        if media_type == "movie":
            status = check_movie_status(data, platform)
        else:
            status = check_tv_status(data, platform)
            
        # 根据平台类型添加状态
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

async def parallel_extract_ratings(tmdb_info, media_type, request=None):
    """并行处理所有平台的评分获取"""
    import time
    start_time = time.time()
    
    platforms = ["douban", "imdb", "letterboxd", "rottentomatoes", "metacritic"]
    
    # 打印开始信息
    title = tmdb_info.get('zh_title') or tmdb_info.get('title', 'Unknown')
    print(log.section(f"并行获取评分: {title} ({media_type})"))
    
    async def process_platform(platform):
        platform_start = time.time()
        try:
            # 检查请求状态
            if request and await request.is_disconnected():
                return platform, {"status": "cancelled"}
                
            # 搜索和提取（静默处理）
            search_results = await search_platform(platform, tmdb_info, request)
            if isinstance(search_results, dict) and "status" in search_results:
                elapsed = time.time() - platform_start
                print(log.error(f"{platform}: {search_results.get('status_reason', search_results.get('status'))} ({elapsed:.1f}s)"))
                return platform, search_results
                
            rating_data = await extract_rating_info(media_type, platform, tmdb_info, search_results, request)
            
            # 输出结果
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
    
    # 使用信号量限制并发数
    sem = asyncio.Semaphore(5)
    
    async def process_with_semaphore(platform):
        async with sem:
            return await process_platform(platform)
    
    # 并行执行所有平台的处理
    tasks = [process_with_semaphore(platform) for platform in platforms]
    results = await asyncio.gather(*tasks)
    
    # 整理结果
    all_ratings = {platform: rating for platform, rating in results}
    
    # 打印总结
    total_time = time.time() - start_time
    success_count = sum(1 for r in all_ratings.values() if r.get('status') == RATING_STATUS["SUCCESSFUL"])
    print(f"\n{log.success(f'完成 {success_count}/{len(platforms)} 个平台')} | 总耗时: {total_time:.2f}秒\n")
    
    # 格式化输出（不再打印详细信息）
    return format_rating_output(all_ratings, media_type)

async def main():
    try:
        tmdb_id = input("请输入TMDB ID:")
        # 等待5秒让用户输入媒体类型
        print("请输入媒体类型(movie/tv),5秒后默认尝试movie类型:")
        
        # 创建一个异步等待用户输入的任务
        media_type = None
        try:
            # 等待用户输入,最多5秒
            media_type = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, input),
                timeout=5.0
            )
            # 验证输入的类型是否有效
            if media_type not in ["movie", "tv"]:
                print("无效的媒体类型,默认使用movie类型")
                media_type = "movie"
        except asyncio.TimeoutError:
            print("未输入媒体类型,默认使用movie类型")
            media_type = "movie"
            
        # 让用户选择要测试的平台
        all_platforms = ["douban", "imdb", "letterboxd", "rottentomatoes", "metacritic"]
        print("\n可用平台:", ", ".join(all_platforms))
        print("请输入要测试的平台(多个平台用空格分隔),5秒后默认测试所有平台:")
        
        try:
            # 等待用户输入,最多5秒
            platforms_input = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, input),
                timeout=5.0
            )
            
            # 处理平台输入
            if platforms_input.strip():
                platforms = [p.strip().lower() for p in platforms_input.split()]
                # 验证输入的平台是否有效
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
        
        # 使用信号量限制并发数
        sem = asyncio.Semaphore(5)
        
        async def process_platform(platform):
            async with sem:
                try:
                    print(f"开始获取 {platform} 平台评分...")
                    # 获取搜索结果
                    search_results = await search_platform(platform, tmdb_info)
                    if isinstance(search_results, dict) and "status" in search_results:
                        return platform, search_results
                    
                    # 提取评分信息
                    rating_data = await extract_rating_info(media_type, platform, tmdb_info, search_results)
                    return platform, rating_data
                    
                except Exception as e:
                    print(f"处理 {platform} 平台时出错: {e}")
                    print(traceback.format_exc())
                    return platform, create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])
        
        # 创建并发任务
        tasks = [process_platform(platform) for platform in platforms]
        
        # 并发执行所有任务
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 处理结果
            all_ratings = {}
            for result in results:
                if isinstance(result, Exception):
                    print(f"任务执行出错: {result}")
                    continue
                    
                platform, rating_data = result
                all_ratings[platform] = rating_data
                print(f"{platform} 平台评分信息获取完成")
        
            # 只有在all_ratings不为空时才调用format_rating_output
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
