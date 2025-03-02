# ==========================================
# 评分获取模块
# ==========================================
import re
import json
import random
import asyncio
import traceback
from fuzzywuzzy import fuzz
from playwright.async_api import async_playwright
import copy
import aiohttp
from urllib.parse import quote
from dataclasses import dataclass, field
from fastapi import Request
from asyncio import Semaphore


TMDB_API_KEY = "4f681fa7b5ab7346a4e184bbf2d41715"
TMDB_API_BASE_URL = "https://api.themoviedb.org/3/"

# 常见的User-Agent列表，可根据实际情况扩充更新
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/89.0.2 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/89.0.2 Safari/537.36",
    "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:45.0) Gecko/20100101 Firefox/45.0",
    "Mozilla/5.0 (Windows NT 6.1; rv:54.0) Gecko/20100101 Firefox/54.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/91.0.864.67 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Edge/91.0.864.48"
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
    delay = random.uniform(0.5, 2)
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
        
    # 处理特殊情况：十几
    if chinese_num.startswith('十') and len(chinese_num) == 2:
        return 10 + chinese_to_arabic_map.get(chinese_num[1], 0)
    
    # 处理特殊情况：十
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
        'rate_limit': {'max_retries': 3, 'delay': 60},  # 访问频率限制
        'timeout': {'max_retries': 3, 'delay': 5},      # 超时
        'network_error': {'max_retries': 3, 'delay': 2}, # 网络错误
        'parse_error': {'max_retries': 2, 'delay': 1},   # 解析错误
        'fail': {'max_retries': 2, 'delay': 3},          # 获取失败
        'error': {'max_retries': 2, 'delay': 2},          # 其他错误
        'no_found': {'max_retries': 1, 'delay': 2}      # 未找到时重试一次
    })

def smart_retry(retry_config: RetryConfig):
    """智能重试装饰器"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # 从函数参数中获取 platform
            platform = None
            if 'platform' in kwargs:
                platform = kwargs['platform']
            else:
                # 假设 platform 是第二个参数 (media_type, platform, ...)
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
            return {
                "status": RATING_STATUS["FETCH_FAILED"],
                "error_detail": str(last_error)
            }
            
        return wrapper
    return decorator

async def retry_request(func, *args, max_retries=3, delay=1):
    """重试请求的异步装饰器"""
    for i in range(max_retries):
        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args)
            else:
                result = func(*args)
            return result
        except Exception as e:
            if i == max_retries - 1:
                raise e
            print(f"请求失败，{delay}秒后重试: {e}")
            await asyncio.sleep(delay)

def construct_search_url(title, media_type, platform):
    """根据影视类型构造各平台搜索URL"""
    encoded_title = quote(title)
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
            "movie": f"https://letterboxd.com/search/films/{encoded_title}/",
            "tv": f"https://letterboxd.com/search/films/{encoded_title}/"
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
    """通过TMDB API获取影视基本信息
    
    Args:
        tmdb_id: TMDB ID
        media_type: 媒体类型('movie'或'tv')
        request: 可选,用于检查请求是否被取消
    """
    try:
        if request and await request.is_disconnected():
            return None
            
        async with aiohttp.ClientSession() as session:
            # 直接根据media_type获取对应类型的信息
            endpoint = f"{TMDB_API_BASE_URL}{media_type}/{tmdb_id}?api_key={TMDB_API_KEY}&language=en-US&append_to_response=credits,external_ids"
            async with session.get(endpoint) as response:
                if response.status == 200:
                    if not request or not (await request.is_disconnected()):
                        print(f"影视类型为{media_type}")
                    en_data = await response.json()
                else:
                    if not request or not (await request.is_disconnected()):
                        print(f"获取{media_type}信息失败")
                    return None

            if not en_data:
                if not request or not (await request.is_disconnected()):
                    print("API返回的数据为空")
                return None
                
            # 检查请求是否已被取消
            if request and await request.is_disconnected():
                return None
                
            # 获取中文数据
            zh_endpoint = endpoint.replace("language=en-US", "language=zh-CN")
            async with session.get(zh_endpoint) as zh_response:
                zh_data = await zh_response.json() if zh_response.status == 200 else en_data
        
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

async def calculate_match_degree(tmdb_info, result, platform=""):
    """计算搜索结果与TMDB信息的匹配度"""
    try:
        # 如果结果已经有匹配分数，直接返回
        if "match_score" in result:
            return result["match_score"]      
          
        score = 0
        
        # 专门针对豆瓣平台
        if platform == "douban":
            # 1. 提取豆瓣标题中的所有可能部分
            result_title = result.get("title", "").lower()
            # 分离中英文标题，去掉年份部分
            parts = result_title.split('(')[0].strip()
            title_parts = parts.split(' ')  # 按空格分割
            
            # 2. 尝试匹配 TMDB 中的各种标题
            tmdb_titles = [
                tmdb_info.get("title", "").lower(),
                tmdb_info.get("original_title", "").lower(),
                tmdb_info.get("zh_title", "").lower()
            ]
            
            # 计算最高匹配分数
            title_scores = []
            for tmdb_title in tmdb_titles:
                if tmdb_title:
                    # 对每个标题部分计算匹配度
                    for part in title_parts:
                        if part and len(part) > 1:  # 确保部分不为空且长度大于1
                            score = fuzz.ratio(tmdb_title, part)
                            title_scores.append(score)
            
            if title_scores:
                score = max(title_scores) * 0.6  # 标题匹配占60分
            
            # 3. 如果是剧集，额外检查季数
            if tmdb_info.get("type") == "tv":
                season_match = re.search(r'第([一二三四五六七八九十百]+)季', result_title)
                if season_match:
                    chinese_season_number = season_match.group(1)
                    result_season_number = chinese_to_arabic(chinese_season_number)
                    
                    for season in tmdb_info.get("seasons", []):
                        if season.get("season_number") == result_season_number:
                            score += 30  # 季数匹配加30分
                            break
            
            # 4. 年份匹配（电影30分，剧集10分）
            try:
                tmdb_year = str(tmdb_info.get("year", ""))
                result_year = str(result.get("year", ""))
                if tmdb_year and result_year:
                    year_diff = abs(int(tmdb_year) - int(result_year))
                    if year_diff == 0:
                        score += 30 if tmdb_info.get("type") == "movie" else 10
                    elif year_diff == 1 and tmdb_info.get("type") == "movie":
                        score += 15  # 电影年份差1年时给15分
            except (ValueError, TypeError) as e:
                print(f"年份比较出错: {e}")
            
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
                    year_diff = abs(int(tmdb_year) - int(result_year))
                    if year_diff == 0:
                        score += 30
                    elif year_diff == 1:
                        score += 15
            except (ValueError, TypeError) as e:
                print(f"年份比较出错: {e}")
            
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
            print("匹配成功!")
            return score
        else:
            return 0
            
    except Exception as e:
        print(f"计算匹配度时出错: {e}")
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
            return {"status": RATING_STATUS["RATE_LIMIT"]}
    
    # 首先检查页面全文是否包含特定文本
    page_text = await page.locator('body').text_content()
    if any(phrase in page_text for phrase in rules["phrases"]):
        print(f"{platform} 访问频率限制: 检测到限制文本")
        return {"status": RATING_STATUS["RATE_LIMIT"]}
    
    # 然后检查特定选择器
    for selector in rules["selectors"]:
        elem = await page.query_selector(selector)
        if elem:
            text = await elem.inner_text()
            if any(phrase.lower() in text.lower() for phrase in rules["phrases"]):
                print(f"{platform} 访问频率限制: {text}")
                return {"status": RATING_STATUS["RATE_LIMIT"]}
    
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
    """在各平台搜索并返回搜索结果"""
    browser = None
    context = None
    page = None
    
    try:
        # 检查请求是否已被取消
        if request and await request.is_disconnected():
            return {"status": "cancelled"}
            
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
            
        if platform == "douban":
            search_title = tmdb_info["zh_title"] or tmdb_info["original_title"]
        else:
            search_title = tmdb_info["title"] or tmdb_info["original_title"]
        
        media_type = tmdb_info["type"]
        search_url = construct_search_url(search_title, media_type, platform)
        
        async with async_playwright() as p:
            # 先选择 User-Agent
            selected_user_agent = random.choice(USER_AGENTS)
            
            # 优化浏览器启动配置
            browser_args = [
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-features=BlockInsecurePrivateNetworkRequests',
                '--disable-features=AudioServiceOutOfProcess',
                '--disable-features=NetworkService',
                '--disable-features=NetworkServiceInProcess',
                '--disable-features=SafeBrowsing',
                '--disable-sync',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-background-networking',
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--mute-audio',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--disable-javascript',
                '--disable-images',
                '--disable-css',
                '--disable-fonts',
                '--disable-animations',
                '--disable-video',
                '--disable-audio'
            ]

            # 启动浏览器
            browser = await p.chromium.launch(
                headless=True,
                args=browser_args,
                timeout=30000,
                ignore_default_args=['--enable-automation']
            )
            
            # 检查请求状态
            if request and await request.is_disconnected():
                print("请求已被取消,停止执行")
                return {"status": "cancelled"}
                
            # 优化上下文配置
            context_options = {
                'viewport': {'width': 1920, 'height': 1080},
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
            
            # 创建上下文
            context = await browser.new_context(**context_options)
            
            # 添加请求拦截
            await context.route("**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2,ttf}", lambda route: route.abort())
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
        
            print(f"正在搜索 {platform}: {search_url}")

            # 添加请求监控
            async def log_request(request):
                if request.resource_type == "document":
                    pass
                page.remove_listener('request', log_request)
                
            page.on('request', log_request)
            try:
                # 在每个关键操作前检查请求状态
                async def check_request():
                    if request and await request.is_disconnected():
                        print("请求已被取消,停止执行")
                        raise RequestCancelledException()

                # 获取搜索结果
                await check_request()
                if platform == "douban":
                    results = await retry_request(handle_douban_search, page, search_url)
                elif platform == "imdb":
                    results = await retry_request(handle_imdb_search, page, search_url)
                elif platform == "letterboxd":
                    results = await retry_request(handle_letterboxd_search, page, search_url, tmdb_info)
                elif platform == "rottentomatoes":
                    results = await retry_request(handle_rt_search, page, search_url, tmdb_info)
                elif platform == "metacritic":
                    results = await retry_request(handle_metacritic_search, page, search_url)
                
                # 检查访问限制
                await check_request()
                if isinstance(results, dict) and "status" in results:
                    if results["status"] == RATING_STATUS["RATE_LIMIT"]:
                        print(f"{platform} 访问频率限制")
                        return {"status": RATING_STATUS["RATE_LIMIT"]} 
                    elif results["status"] == RATING_STATUS["TIMEOUT"]:
                        print(f"{platform} 请求超时")
                        return {"status": RATING_STATUS["TIMEOUT"]}
                    elif results["status"] == RATING_STATUS["FETCH_FAILED"]:
                        print(f"{platform} 获取失败")
                        return {"status": RATING_STATUS["FETCH_FAILED"]}
                    elif results["status"] == RATING_STATUS["NO_FOUND"]:
                        print(f"{platform}平台未收录此影视")
                        return {"status": RATING_STATUS["NO_FOUND"]}
                
                # 检查搜索结果
                await check_request()
                if not isinstance(results, list):
                    if isinstance(results, list):
                        print(f"{platform} 搜索无结果")
                        return []
                    else:
                        print(f"{platform} 获取失败")
                        return create_error_rating_data(platform, media_type)
                
                print(f"找到 {len(results)} 个 {platform} 搜索结果")
                
                # 根据匹配度过滤结果
                await check_request()
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
                    # 如果结果已经有匹配分数，直接使用
                    if "match_score" in result:
                        match_score = result["match_score"]
                    else:
                        match_score = await calculate_match_degree(tmdb_info, result, platform)
                    
                    if match_score >= threshold:
                        matched_results.append(result)
                
                if not matched_results:
                    print(f"{platform} 未找到足够匹配的结果")
                    return []
                
                return matched_results
                
            except RequestCancelledException:
                print("所有请求已取消")
                return {"status": "cancelled"}
            except Exception as e:
                print(f"处理 {platform} 搜索时出错: {e}")
                print(traceback.format_exc())
                if "Timeout" in str(e):
                    return {"status": RATING_STATUS["TIMEOUT"]} 
                return {"status": RATING_STATUS["FETCH_FAILED"]}
            
    except Exception as e:
        print(f"搜索 {platform} 时出错: {e}")
        print(traceback.format_exc())
        return []
        
    finally:
        # 确保资源被正确清理
        if page:
            try:
                await page.unroute_all(behavior='ignoreErrors')
                await page.close()
            except Exception as e:
                print(f"关闭页面时出错: {e}")
                
        if context:
            try:
                await context.close()
            except Exception as e:
                print(f"关闭上下文时出错: {e}")
                
        if browser:
            try:
                await browser.close()
            except Exception as e:
                print(f"关闭浏览器时出错: {e}")

@smart_retry(RetryConfig(
    max_retries=2,
    base_delay=1,
    platform="douban"
))
async def handle_douban_search(page, search_url):
    """处理豆瓣搜索"""
    try:
        await random_delay()
        print(f"访问豆瓣搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
        
        # 立即检查是否出现访问频率限制
        rate_limit = await check_rate_limit(page, "douban")
        if rate_limit:
            print("检测到豆瓣访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        try:
            # 检查搜索结果
            items = await page.query_selector_all('.item-root')
            results = []
            
            # 如果没有搜索结果
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"]}
            
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
                            
                            meta_elem = await item.query_selector('.meta')
                            director = ""
                            if meta_elem:
                                meta_text = await meta_elem.inner_text()
                                director = meta_text.split('/')[0].strip()
                            
                            results.append({
                                "title": title,
                                "year": year,
                                "director": director,
                                "url": url
                            })
                except Exception as e:
                    print(f"处理豆瓣单个搜索结果时出错: {e}")
                    continue
            
            return results if results else {"status": RATING_STATUS["NO_FOUND"]}
            
        except Exception as e:
            print(f"等待豆瓣搜索结果时出错: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"]}
            return {"status": RATING_STATUS["FETCH_FAILED"]}
            
    except Exception as e:
        print(f"访问豆瓣搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}

@smart_retry(RetryConfig(
    max_retries=2,
    base_delay=1,
    platform="imdb"
))
async def handle_imdb_search(page, search_url):
    """处理IMDB搜索"""
    try:
        await random_delay()
        print(f"访问 IMDB 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
    
        # 立即检查是否出现访问频率限制
        rate_limit = await check_rate_limit(page, "imdb")
        if rate_limit:
            print("检测到IMDB访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        try:
            # 检查搜索结果
            items = await page.query_selector_all('.ipc-metadata-list-summary-item')
            results = []
            
            # 如果没有搜索结果
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"]}
                    
            for item in items:
                try:
                    title_elem = await item.query_selector('a.ipc-metadata-list-summary-item__t')
                    year_elem = await item.query_selector('.ipc-inline-list__item .ipc-metadata-list-summary-item__li')
                
                    if title_elem and year_elem:
                        title = await title_elem.inner_text()
                        url = await title_elem.get_attribute('href')
                        year = await year_elem.inner_text()
                    
                        if url and "/title/" in url:
                            imdb_id = url.split("/title/")[1].split("/")[0]
                            results.append({
                                "title": title,
                                "year": year,
                                "imdb_id": imdb_id,
                                "url": f"https://www.imdb.com/title/{imdb_id}/"
                            })
                except Exception as e:
                    print(f"处理IMDB单个搜索结果时出错: {e}")
                    continue
        
            return results if results else {"status": RATING_STATUS["NO_FOUND"]}
        
        except Exception as e:
            print(f"等待IMDB搜索结果超时: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"]}
            return {"status": RATING_STATUS["FETCH_FAILED"]}
            
    except Exception as e:
        print(f"访问IMDB搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}

@smart_retry(RetryConfig(
    max_retries=2,
    base_delay=1,
    platform="rottentomatoes"
))
async def handle_rt_search(page, search_url, tmdb_info):
    """处理Rotten Tomatoes搜索"""
    try:
        await random_delay()  # 添加随机延时
        print(f"访问 Rotten Tomatoes 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
    
        # 立即检查是否出现访问频率限制
        rate_limit = await check_rate_limit(page, "rottentomatoes")
        if rate_limit:
            print("检测到IMDB访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        try:
            # 检查搜索结果
            items = await page.query_selector_all('search-page-media-row')
            results = []
            
            # 如果没有搜索结果
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"]}
            
            for item in items:
                try:
                    # 获取标题和链接
                    title_elem = await item.query_selector('[data-qa="info-name"]')
                    if title_elem:
                        title = (await title_elem.inner_text()).strip()
                        url = await title_elem.get_attribute('href')
                    
                        # 获取年份
                        year_elem = await item.query_selector('span[data-qa="info-year"]')
                        if year_elem:
                            year_text = await year_elem.inner_text()
                            year_match = re.search(r'\((\d{4})', year_text)
                            year = year_match.group(1) if year_match else None
                        else:
                            year = None
                    
                        print(f"找到结果: {title} ({year})")
                    
                        # 精准匹配标题和年份
                        if (title.lower() == tmdb_info['title'].lower() and 
                            year == tmdb_info['year']):
                            return [{
                                "title": title,
                                "year": year,
                                "url": url,
                                "match_score": 100,
                                "number_of_seasons": tmdb_info.get("number_of_seasons", 0)
                            }]
                    
                        results.append({
                            "title": title,
                            "year": year,
                            "url": url,
                            "match_score": await calculate_match_degree(tmdb_info, {"title": title, "year": year}),
                            "number_of_seasons": tmdb_info.get("number_of_seasons", 0)
                        })
                except Exception as e:
                    print(f"处理Rotten Tomatoes单个搜索结果时出错: {e}")
                    continue
        
            return results if results else {"status": RATING_STATUS["NO_FOUND"]}
        
        except Exception as e:
            print(f"等待Rotten Tomatoes搜索结果超时: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"]}
            return {"status": RATING_STATUS["FETCH_FAILED"]}
            
    except Exception as e:
        print(f"访问Rotten Tomatoes搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}

@smart_retry(RetryConfig(
    max_retries=2,
    base_delay=1,
    platform="metacritic"
))
async def handle_metacritic_search(page, search_url):
    """处理Metacritic搜索"""
    try:
        await random_delay()
        print(f"访问 Metacritic 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
    
        # 立即检查是否出现访问频率限制
        rate_limit = await check_rate_limit(page, "metacritic")
        if rate_limit:
            print("检测到Metacritic访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        try:
            # 检查搜索结果
            items = await page.query_selector_all('[data-testid="search-result-item"]')
            results = []
            
            # 如果没有搜索结果
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"]}
            
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
                return {"status": RATING_STATUS["TIMEOUT"]}
            return {"status": RATING_STATUS["FETCH_FAILED"]}
            
    except Exception as e:
        print(f"访问Metacritic搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}

@smart_retry(RetryConfig(
    max_retries=2,
    base_delay=1,
    platform="letterboxd"
))
async def handle_letterboxd_search(page, search_url, tmdb_info):
    """处理Letterboxd搜索"""
    try:
        print(f"访问 Letterboxd 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)  # 减少初始等待时间
    
        # 检查访问限制
        rate_limit = await check_rate_limit(page, "letterboxd")
        if rate_limit:
            print("检测到Letterboxd访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        try:
            # 获取所有搜索结果
            items = await page.query_selector_all('.results li .film-title-wrapper')
            if not items:
                print("Letterboxd: 未找到搜索结果")
                return {"status": RATING_STATUS["NO_FOUND"]}
            
            # 一次性收集所有结果信息
            results = []
            for item in items:
                try:
                    link = await item.query_selector('a')
                    if not link:
                        continue
                        
                    url = await link.get_attribute('href')
                    title = await link.inner_text()
                    
                    year_elem = await item.query_selector('small.metadata a')
                    year = await year_elem.inner_text() if year_elem else ""
                    
                    if url:
                        results.append({
                            "title": title,
                            "year": year.strip('()'),
                            "url": f"https://letterboxd.com{url}"
                        })
                except Exception as e:
                    print(f"处理搜索结果项时出错: {e}")
                    continue
            
            print(f"找到 {len(results)} 个搜索结果")
            
            # 逐个检查结果的TMDB ID
            for result in results:
                try:
                    print(f"\n检查结果: {result['title']} ({result['year']})")
                    await page.goto(result["url"], wait_until='domcontentloaded')
                    await asyncio.sleep(0.3)  # 减少每个结果的等待时间
                    
                    # 获取页面源代码
                    content = await page.content()
                    
                    # 使用正则表达式匹配TMDB链接
                    tmdb_match = re.search(r'https://www\.themoviedb\.org/(?:movie|tv)/(\d+)', content)
                    if tmdb_match:
                        tmdb_id = tmdb_match.group(1)
                        print(f"找到TMDB ID: {tmdb_id}")
                        if tmdb_id == str(tmdb_info.get("tmdb_id")):
                            print("TMDB ID匹配成功!")
                            result["match_score"] = 100
                            return [result]
                except Exception as e:
                    print(f"检查结果时出错: {e}")
                    continue
            
            print("Letterboxd: 未找到TMDB ID匹配的结果")
            return {"status": RATING_STATUS["NO_FOUND"]}
            
        except Exception as e:
            print(f"处理Letterboxd搜索结果时出错: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"]}
            return {"status": RATING_STATUS["FETCH_FAILED"]}
            
    except Exception as e:
        print(f"访问Letterboxd搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}

async def extract_rating_info(media_type, platform, tmdb_info, search_results, request=None):
    """从各平台详情页HTML中提取对应评分数据"""
    @smart_retry(RetryConfig(
        max_retries=3,
        base_delay=2,
        platform=platform
    ))
    async def _extract_rating_with_retry():
        browser = None
        context = None
        page = None
        
        try:
            await random_delay()  # 添加随机延时
            # 检查请求是否已被取消
            if request and await request.is_disconnected():
                print("请求已被取消,停止执行")
                return {"status": "cancelled"}
        
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
            for result in search_results:
                if isinstance(result, str):
                    result = {"title": result}
                    
                # 检查请求状态
                if request and await request.is_disconnected():
                    print("请求已被取消,停止执行")
                    return {"status": "cancelled"}
                    
                score = await calculate_match_degree(tmdb_info, result, platform)
                if score > highest_score:
                    highest_score = score
                    best_match = result

            if not best_match:
                print(f"在{platform}平台未找到匹配的结果")
                return create_empty_rating_data(platform, media_type, RATING_STATUS["NO_FOUND"])
        
            detail_url = best_match["url"]
            print(f"找到最佳匹配结果: {best_match['title']} ({best_match.get('year', '')})")
            print(f"访问详情页: {detail_url}")
    
            try:
                async with async_playwright() as p:
                    # 选择 User-Agent
                    selected_user_agent = random.choice(USER_AGENTS)
                
                    # 浏览器启动配置
                    browser_args = [
                        '--disable-dev-shm-usage',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--disable-features=BlockInsecurePrivateNetworkRequests',
                        '--disable-features=AudioServiceOutOfProcess',
                        '--disable-features=NetworkService',
                        '--disable-features=NetworkServiceInProcess',
                        '--disable-features=SafeBrowsing',
                        '--disable-sync',
                        '--no-first-run',
                        '--no-default-browser-check',
                        '--disable-background-networking',
                        '--disable-extensions',
                        '--disable-component-extensions-with-background-pages',
                        '--disable-default-apps',
                        '--mute-audio',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-infobars',
                        '--window-size=1920,1080',
                        f'--user-agent={selected_user_agent}'
                    ]
                
                    browser = await p.chromium.launch(
                        headless=True,
                        args=browser_args,
                        timeout=60000,
                        ignore_default_args=['--enable-automation']
                    )
                
                    # 上下文配置
                    context_options = {
                        'viewport': {'width': 1920, 'height': 1080},
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
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                        await asyncio.sleep(2)  # 增加到2秒确保页面完全加载
                    elif platform == "douban":
                        # 豆瓣评分在 DOM 中就有
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                        await asyncio.sleep(2)  # 增加到2秒确保页面完全加载
                    elif platform == "letterboxd":
                        # Letterboxd 评分在 DOM 中就有
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                        await asyncio.sleep(2)  # 增加到2秒确保页面完全加载
                    elif platform == "rottentomatoes":
                        # 烂番茄需要等待评分加载
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                        await asyncio.sleep(2)  # 增加到2秒确保页面完全加载
                    elif platform == "metacritic":
                        # Metacritic 评分在 DOM 中就有
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                        await asyncio.sleep(2)  # 增加到2秒确保页面完全加载
                    else:
                        # 默认策略
                        await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                        await asyncio.sleep(2)  # 增加到2秒确保页面完全加载
            
                    try:
                        if platform == "douban":
                            rating_data = await extract_douban_rating(page, media_type, search_results)
                        elif platform == "imdb":
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
            
            except Exception as e:
                print(f"访问{platform}详情页时出错: {e}")
                print(traceback.format_exc())
                return create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])
                
        except Exception as e:
            print(f"执行评分提取时出错: {e}")
            print(traceback.format_exc())
            return create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])
            
        finally:
            # 确保资源被正确释放
            if page:
                try:
                    await page.unroute_all(behavior='ignoreErrors')
                    await page.close()
                except Exception as e:
                    print(f"关闭页面时出错: {e}")
            if context:
                try:
                    await context.close()
                except Exception as e:
                    print(f"关闭上下文时出错: {e}")
            if browser:
                try:
                    await browser.close()
                except Exception as e:
                    print(f"关闭浏览器时出错: {e}")

    # 调用带重试的内部函数
    return await _extract_rating_with_retry()

async def extract_douban_rating(page, media_type, matched_results):
    try:
        content = await page.content()
        
        # 使用正则表达式匹配评分数据
        rating_match = re.search(r'<strong[^>]*class="ll rating_num"[^>]*>([^<]*)</strong>', content)
        rating = rating_match.group(1).strip() if rating_match and rating_match.group(1).strip() else "暂无"
        
        # 匹配评分人数
        people_match = re.search(r'<span[^>]*property="v:votes">(\d+)</span>', content)
        rating_people = people_match.group(1) if people_match else "暂无"
            
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
        ratings = {
            "status": RATING_STATUS["SUCCESSFUL"],
            "seasons": []
        }
        
        all_seasons_no_rating = True  # 用于跟踪是否所有季都暂无评分
        
        for result in matched_results:
            try:
                title = result.get("title", "")
                season_match = re.search(r'第([一二三四五六七八九十百]+)季', title)
                if not season_match:
                    continue
                    
                chinese_season_number = season_match.group(1)
                season_number = chinese_to_arabic(chinese_season_number)
                
                url = result.get("url")
                if not url:
                    continue
                
                await page.goto(url)
                season_content = await page.content()
                
                # 提取分季评分
                season_rating_match = re.search(r'<strong[^>]*class="ll rating_num"[^>]*>([^<]*)</strong>', season_content)
                season_rating = season_rating_match.group(1).strip() if season_rating_match and season_rating_match.group(1).strip() else "暂无"
                
                # 提取分季评分人数
                season_people_match = re.search(r'<span[^>]*property="v:votes">(\d+)</span>', season_content)
                season_rating_people = season_people_match.group(1) if season_people_match else "暂无"
                
                # 检查分季是否显示"暂无评分"或"尚未上映"
                if "暂无评分" in season_content or "尚未上映" in season_content:
                    ratings["seasons"].append({
                        "season_number": season_number,
                        "rating": "暂无",
                        "rating_people": "暂无"
                    })
                else:
                    if season_rating not in [None, "暂无"] and season_rating_people not in [None, "暂无"]:
                        all_seasons_no_rating = False
                    ratings["seasons"].append({
                        "season_number": season_number,
                        "rating": season_rating,
                        "rating_people": season_rating_people
                    })
                
            except Exception as e:
                print(f"获取第{season_number if 'season_number' in locals() else '未知'}季评分时出错: {e}")
                continue
        
        # 根据所有季的状态设置整体状态
        if all_seasons_no_rating:
            ratings["status"] = RATING_STATUS["NO_RATING"]
        elif not ratings["seasons"]:
            ratings["status"] = RATING_STATUS["FETCH_FAILED"]
            
        return ratings
            
    except Exception as e:
        print(f"提取豆瓣评分数据时出错: {e}")
        return create_empty_rating_data("douban", media_type, RATING_STATUS["FETCH_FAILED"])

async def extract_imdb_rating(page):
    """从IMDB详情页提取评分数据"""
    try:
        # 检查是否有评分元素
        rating_elem = await page.query_selector('.sc-d541859f-1.imUuxf')
        if not rating_elem:
            return {
                "rating": "暂无",
                "rating_people": "暂无",
                "status": RATING_STATUS["NO_RATING"]
            }

        # 等待评分元素加载
        await page.wait_for_selector('.sc-d541859f-1.imUuxf', timeout=2000)
        
        # 提取评分
        rating = await page.query_selector('.sc-d541859f-1.imUuxf')
        rating_text = await rating.inner_text() if rating else "暂无"
        
        # 提取评分人数
        rating_people = await page.query_selector('.sc-d541859f-3.dwhNqC')
        rating_people_text = await rating_people.inner_text() if rating_people else "暂无"
        
        print(f"IMDB评分: {rating_text}")
        print(f"IMDB评分人数: {rating_people_text}")
        
        return {
            "rating": rating_text,
            "rating_people": rating_people_text
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

async def extract_rt_rating(page, media_type, tmdb_info):
    """从Rotten Tomatoes详情页提取评分数据"""
    try:
        # 获取页面源代码
        content = await page.content()
        
        # 使用正则表达式提取JSON数据
        json_match = re.search(r'<script[^>]*id="media-scorecard-json"[^>]*>\s*({[^<]+})\s*</script>', content)
        if not json_match:
            return create_empty_rating_data("rottentomatoes", media_type, RATING_STATUS["NO_RATING"])
            
        try:
            score_data = json.loads(json_match.group(1))
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
                "status": RATING_STATUS["SUCCESSFUL"]  # 只要有一种评分就视为成功
            }
            
            # 处理剧集分季数据
            if media_type == "tv" and tmdb_info.get("number_of_seasons", 0) > 0:
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
                        print(f"获取第{season}季评分数据时出错: {e}")
                        continue
                            
            return ratings
            
        except json.JSONDecodeError as e:
            print(f"解析JSON数据时出错: {e}")
            return create_empty_rating_data("rottentomatoes", media_type, RATING_STATUS["FETCH_FAILED"])
            
    except Exception as e:
        print(f"获取 Rotten Tomatoes 评分数据时出错: {e}")
        return create_empty_rating_data("rottentomatoes", media_type, RATING_STATUS["FETCH_FAILED"])

async def extract_metacritic_rating(page, media_type, tmdb_info):
    """从Metacritic详情页提取评分数据"""
    try:
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

        # 提取专业评分
        metascore_elem = await page.query_selector('div[data-v-e408cafe][title*="Metascore"] span')
        if metascore_elem:
            metascore_text = await metascore_elem.inner_text()
            if metascore_text and metascore_text.lower() != 'tbd':
                ratings["overall"]["metascore"] = metascore_text

        # 提取专业评分人数
        critics_count_elem = await page.query_selector('a[data-testid="critic-path"] span')
        if critics_count_elem:
            critics_text = await critics_count_elem.inner_text()
            match = re.search(r'Based on (\d+) Critic', critics_text)
            if match:
                ratings["overall"]["critics_count"] = match.group(1)

        # 提取用户评分
        userscore_elem = await page.query_selector('div[data-v-e408cafe][title*="User score"] span')
        if userscore_elem:
            userscore_text = await userscore_elem.inner_text()
            if userscore_text and userscore_text.lower() != 'tbd':
                ratings["overall"]["userscore"] = userscore_text

        # 提取用户评分人数
        users_count_elem = await page.query_selector('a[data-testid="user-path"] span')
        if users_count_elem:
            users_text = await users_count_elem.inner_text()
            match = re.search(r'Based on ([\d,]+) User', users_text)
            if match:
                ratings["overall"]["users_count"] = match.group(1).replace(',', '')

        # 如果是剧集且有多季,获取每一季的评分数据
        if media_type == "tv" and tmdb_info.get("number_of_seasons", 0) > 0:
            base_url = page.url.rstrip('/')
            
            for season in tmdb_info.get("seasons", []):
                season_number = season.get("season_number")
                try:
                    season_url = f"{base_url}/season-{season_number}/"
                    await page.goto(season_url, wait_until='domcontentloaded')
                    await asyncio.sleep(0.5)

                    season_data = {
                        "season_number": season_number,
                        "metascore": "暂无",
                        "critics_count": "暂无",
                        "userscore": "暂无",
                        "users_count": "暂无"
                    }

                    # 提取分季专业评分
                    season_metascore_elem = await page.query_selector('div[data-v-e408cafe][title*="Metascore"] span')
                    if season_metascore_elem:
                        metascore_text = await season_metascore_elem.inner_text()
                        if metascore_text and metascore_text.lower() != 'tbd':
                            season_data["metascore"] = metascore_text

                    # 提取分季专业评分人数
                    season_critics_elem = await page.query_selector('a[data-testid="critic-path"] span')
                    if season_critics_elem:
                        critics_text = await season_critics_elem.inner_text()
                        match = re.search(r'Based on (\d+) Critic', critics_text)
                        if match:
                            season_data["critics_count"] = match.group(1)

                    # 提取分季用户评分
                    season_userscore_elem = await page.query_selector('div[data-v-e408cafe][title*="User score"] span')
                    if season_userscore_elem:
                        userscore_text = await season_userscore_elem.inner_text()
                        if userscore_text and userscore_text.lower() != 'tbd':
                            season_data["userscore"] = userscore_text

                    # 提取分季用户评分人数
                    season_users_elem = await page.query_selector('a[data-testid="user-path"] span')
                    if season_users_elem:
                        users_text = await season_users_elem.inner_text()
                        match = re.search(r'Based on ([\d,]+) User', users_text)
                        if match:
                            season_data["users_count"] = match.group(1).replace(',', '')

                    ratings["seasons"].append(season_data)

                except Exception as e:
                    print(f"获取第{season_number}季评分数据时出错: {e}")
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
        # 获取评分元素
        rating_elem = await page.query_selector('span.average-rating a.tooltip')
        
        if not rating_elem:
            print("Letterboxd: 未找到评分元素,该影视暂无评分")
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
            
        print(f"Letterboxd评分数据: 评分={rating}, 评分人数={rating_count}")
        
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

def create_error_rating_data(platform, media_type="movie"):
    """为出错的平台创建数据结构    
    Args:
        platform: 平台名称
        media_type: 媒体类型，'movie' 或 'tv'
    """
    if platform == "douban":
        if media_type == "tv":
            return {
                "seasons": [],
                "rating": "出错",
                "rating_people": "出错",
                "status": "Fail"
            }
        else:
            return {
                "rating": "出错",
                "rating_people": "出错",
                "status": "Fail"
            }
            
    elif platform == "imdb":
        return {
            "rating": "出错",
            "rating_people": "出错",
            "status": "Fail"
        }
        
    elif platform == "letterboxd":
        return {
            "rating": "出错",
            "rating_count": "出错",
            "status": "Fail"
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
                    "status": "Fail"
                },
                "seasons": [],
                "status": "Fail"
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
                    "status": "Fail"
                },
                "status": "Fail"
            }
            
    elif platform == "metacritic":
        if media_type == "tv":
            return {
                "overall": {
                    "metascore": "出错",
                    "critics_count": "出错",
                    "userscore": "出错",
                    "users_count": "出错",
                    "status": "Fail"
                },
                "seasons": [],
                "status": "Fail"
            }
        else:
            return {
                "overall": {
                    "metascore": "出错",
                    "critics_count": "出错",
                    "userscore": "出错",
                    "users_count": "出错",
                    "status": "Fail"
                },
                "status": "Fail"
            }
    
    # 默认返回基础错误数据结构
    return {
        "rating": "出错",
        "rating_people": "出错",
        "status": "Fail"
    }

def format_rating_output(all_ratings, media_type):
    """格式化输出所有平台的评分信息"""
    print("\n=== 评分信息汇总 ===\n")
    
    # 状态映射表
    status_map = {
        "Successful": "成功",
        "Fail": "失败", 
        "No Found": "未收录",
        "Timeout": "超时",
        "No Rating": "暂无评分",
        "RateLimit": "访问频繁"
    }
    
    # 豆瓣
    if "douban" in all_ratings:
        print("豆瓣：")
        status = all_ratings["douban"].get("status", "Fail")
        print(f"状态：{status_map.get(status, status)}")
        
        if status == "Successful":
            if media_type == "movie":
                print(f"评分：{all_ratings['douban'].get('rating', '暂无')}")
                print(f"评分人数：{all_ratings['douban'].get('rating_people', '暂无')}\n")
            else:
                seasons = all_ratings["douban"].get("seasons", [])
                if seasons:
                    for season in sorted(seasons, key=lambda x: x["season_number"]):
                        print(f"第{season['season_number']}季：")
                        print(f"评分：{season.get('rating', '暂无')}")
                        print(f"评分人数：{season.get('rating_people', '暂无')}")
                print()
        else:
            print()
    
    # IMDb
    if "imdb" in all_ratings:
        print("IMDb：")
        status = all_ratings["imdb"].get("status", "Fail")
        print(f"状态：{status_map.get(status, status)}")
        
        if status == "Successful":
            print(f"评分：{all_ratings['imdb'].get('rating', '暂无')}")
            print(f"评分人数：{all_ratings['imdb'].get('rating_people', '暂无')}\n")
        else:
            print()
    
    # Letterboxd
    if "letterboxd" in all_ratings:
        print("Letterboxd：")
        status = all_ratings["letterboxd"].get("status", "Fail")
        print(f"状态：{status_map.get(status, status)}")
        
        if status == "Successful":
            print(f"评分：{all_ratings['letterboxd'].get('rating', '暂无')}")
            print(f"评分人数：{all_ratings['letterboxd'].get('rating_count', '暂无')}\n")
        else:
            print()
    
    # Rotten Tomatoes
    if "rottentomatoes" in all_ratings:
        print("Rotten Tomatoes：")
        status = all_ratings["rottentomatoes"].get("status", "Fail")
        print(f"状态：{status_map.get(status, status)}")
        
        if status == "Successful":
            if media_type == "tv":
                rt_data = all_ratings.get('rottentomatoes', {}).get('series', {})
                print(f"整部剧集专业评分：{rt_data.get('tomatometer', '暂无')}")
                print(f"整部剧集观众评分：{rt_data.get('audience_score', '暂无')}")
                print(f"整部剧集专业平均评分：{rt_data.get('critics_avg', '暂无')}")
                print(f"整部剧集观众平均评分：{rt_data.get('audience_avg', '暂无')}")
                print(f"整部剧集专业评分人数：{rt_data.get('critics_count', '暂无')}")
                print(f"整部剧集观众评分人数：{rt_data.get('audience_count', '暂无')}")
                
                # 各季评分
                for season in all_ratings['rottentomatoes'].get('seasons', []):
                    print(f"\n第{season['season_number']}季专业评分：{season.get('tomatometer', '暂无')}")
                    print(f"第{season['season_number']}季观众评分：{season.get('audience_score', '暂无')}")
                    print(f"第{season['season_number']}季专业平均评分：{season.get('critics_avg', '暂无')}")
                    print(f"第{season['season_number']}季观众平均评分：{season.get('audience_avg', '暂无')}")
                    print(f"第{season['season_number']}季专业评分人数：{season.get('critics_count', '暂无')}")
                    print(f"第{season['season_number']}季观众评分人数：{season.get('audience_count', '暂无')}")
            else:
                overall_data = all_ratings['rottentomatoes'].get('series', {})
                print(f"专业评分：{overall_data.get('tomatometer', '暂无')}")
                print(f"观众评分：{overall_data.get('audience_score', '暂无')}")
                print(f"专业平均评分：{overall_data.get('critics_avg', '暂无')}")
                print(f"观众平均评分：{overall_data.get('audience_avg', '暂无')}")
                print(f"专业评分人数：{overall_data.get('critics_count', '暂无')}")
                print(f"观众评分人数：{overall_data.get('audience_count', '暂无')}")
        print()
    
    # Metacritic
    if "metacritic" in all_ratings:
        print("Metacritic：")
        status = all_ratings["metacritic"].get("status", "Fail")
        print(f"状态：{status_map.get(status, status)}")
        
        if status == "Successful":
            mc_data = all_ratings['metacritic']
            if media_type == "tv":
                overall = mc_data.get('overall', {})
                print("整部剧集专业评分：" + overall.get('metascore', '暂无'))
                print("整部剧集观众评分：" + overall.get('userscore', '暂无'))
                print("整部剧集专业评分人数：" + overall.get('critics_count', '暂无'))
                print("整部剧集观众评分人数：" + overall.get('users_count', '暂无'))
                
                # 各季评分
                for season in mc_data.get('seasons', []):
                    print(f"\n第{season['season_number']}季专业评分：{season.get('metascore', '暂无')}")
                    print(f"第{season['season_number']}季观众评分：{season.get('userscore', '暂无')}")
                    print(f"第{season['season_number']}季专业评分人数：{season.get('critics_count', '暂无')}")
                    print(f"第{season['season_number']}季观众评分人数：{season.get('users_count', '暂无')}")
            else:
                mc_data = all_ratings['metacritic'].get('overall', {})
                print(f"专业评分：{mc_data.get('metascore', '暂无')}")
                print(f"专业评分人数：{mc_data.get('critics_count', '暂无')}")
                print(f"观众评分：{mc_data.get('userscore', '暂无')}")
                print(f"观众评分人数：{mc_data.get('users_count', '暂无')}")
        print()

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
    platforms = ["douban", "imdb", "letterboxd", "rottentomatoes", "metacritic"]
    
    async def process_platform(platform):
        try:
            # 检查请求状态
            if request and await request.is_disconnected():
                print(f"{platform} 请求已取消")
                return platform, {"status": "cancelled"}
                
            print(f"开始获取 {platform} 平台评分...")
            
            # 搜索结果
            search_results = await search_platform(platform, tmdb_info, request)
            if isinstance(search_results, dict) and "status" in search_results:
                return platform, search_results
                
            # 提取评分
            rating_data = await extract_rating_info(media_type, platform, tmdb_info, search_results, request)
            return platform, rating_data
            
        except Exception as e:
            print(f"处理 {platform} 平台时出错: {e}")
            print(traceback.format_exc())
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
    
    # 格式化输出
    return format_rating_output(all_ratings, media_type)

async def main():
    try:
        tmdb_id = input("请输入TMDB ID:")
        # 等待2秒让用户输入媒体类型
        print("请输入媒体类型(movie/tv),2秒后默认尝试movie类型:")
        
        # 创建一个异步等待用户输入的任务
        media_type = None
        try:
            # 等待用户输入,最多2秒
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
        print("请输入要测试的平台(多个平台用空格分隔),2秒后默认测试所有平台:")
        
        try:
            # 等待用户输入,最多2秒
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
            print("未在2秒内输入平台,默认测试所有平台")
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
