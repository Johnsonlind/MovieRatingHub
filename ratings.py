import re
import json
import random
import asyncio
import traceback
from fuzzywuzzy import fuzz
from playwright.async_api import async_playwright
import copy
import requests
from bs4 import BeautifulSoup
from douban_api import DoubanAPI
import aiohttp
from urllib.parse import quote
from dataclasses import dataclass


TMDB_API_KEY = "4f681fa7b5ab7346a4e184bbf2d41715"
TMDB_API_BASE_URL = "https://api.themoviedb.org/3/"

# 常见的User-Agent列表，可根据实际情况扩充更新
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/89.0.2 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/89.0.2 Safari/537.36"
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

async def get_tmdb_info(tmdb_id, request=None):
    """通过TMDB API获取影视基本信息"""
    try:
        # 检查请求是否已被取消
        if request and await request.is_disconnected():
            return None
            
        async with aiohttp.ClientSession() as session:
            # 先尝试获取电影信息
            endpoint = f"{TMDB_API_BASE_URL}movie/{tmdb_id}?api_key={TMDB_API_KEY}&language=en-US&append_to_response=credits,external_ids"
            async with session.get(endpoint) as response:
                # 检查请求是否已被取消
                if request and await request.is_disconnected():
                    return None
                    
                if response.status == 200:
                    if not request or not (await request.is_disconnected()):
                        print("影视类型为电影")
                    en_data = await response.json()
                else:
                    if not request or not (await request.is_disconnected()):
                        print("影视类型不是电影")
                        print("电影API错误响应: 未找到电影")
                        print("尝试获取剧集信息...")
                    
                    # 尝试获取剧集信息
                    endpoint = f"{TMDB_API_BASE_URL}tv/{tmdb_id}?api_key={TMDB_API_KEY}&language=en-US&append_to_response=credits,external_ids"
                    async with session.get(endpoint) as response:
                        # 检查请求是否已被取消
                        if request and await request.is_disconnected():
                            return None
                            
                        if response.status == 200:
                            if not request or not (await request.is_disconnected()):
                                print("影视类型为剧集")
                            en_data = await response.json()
                        else:
                            if not request or not (await request.is_disconnected()):
                                print("影视类型不是剧集")
                                print(f"剧集API错误响应: 未找到剧集")
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
        
        # 确定媒体类型
        is_movie = "release_date" in en_data
        
        # 提取基本信息
        if is_movie:
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
            "type": "movie" if is_movie else "tv",
            "title": title,
            "original_title": original_title,
            "zh_title": zh_title,
            "year": year,
            "director": director,
            "tmdb_id": str(tmdb_id),
            "imdb_id": en_data.get("imdb_id") or en_data.get("external_ids", {}).get("imdb_id", "")
        }
        
        # 如果是剧集，添加额外信息
        if not is_movie:
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


async def construct_detail_url(media_type, tmdb_info, platform):
    """根据TMDB信息构造各平台的详情页URL"""
    try:
        # 打印TMDB信息以便调试
        print(f"\nTMDB信息: {tmdb_info}")
        
        title = tmdb_info.get('original_title', tmdb_info.get('original_name', ''))
        year = tmdb_info.get('year', '')
        imdb_id = tmdb_info.get('imdb_id', '')
        
        if not title:
            print(f"未能获取到标题信息")
            return None
            
        print(f"正在构造 {platform} 的URL (标题: {title}, 年份: {year})")
        
        if platform == "douban":
            # 使用豆瓣API搜索
            douban = DoubanAPI()
            results = await douban.search(tmdb_info["zh_title"], tmdb_info)
            if results:
                for result in results:
                    if abs(int(result.year) - int(year)) <= 1:
                        return f"https://movie.douban.com/subject/{result.sid}/"
            print(f"豆瓣搜索无结果: {title}")
            
        elif platform == "imdb":
            if imdb_id:
                return f"https://www.imdb.com/title/{imdb_id}/"
            else:
                encoded_title = quote(title)
                return f"https://www.imdb.com/find/?q={encoded_title}&s=tt&ttype={'ft' if media_type == 'movie' else 'tv'}"
                
        elif platform == "letterboxd":
            # Letterboxd电影和剧集都使用相同的URL格式
            clean_title = clean_url_component(title)
            return f"https://letterboxd.com/film/{clean_title}"
                
        elif platform == "rottentomatoes":
            clean_title = clean_url_component(title)
            if media_type == "movie":
                return f"https://www.rottentomatoes.com/m/{clean_title}"
            else:
                return f"https://www.rottentomatoes.com/tv/{clean_title}"
                
        elif platform == "metacritic":
            clean_title = clean_url_component(title)
            if media_type == "movie":
                return f"https://www.metacritic.com/movie/{clean_title}"
            else:
                return f"https://www.metacritic.com/tv/{clean_title}"
                
    except Exception as e:
        print(f"构造{platform}平台URL时出错: {e}")
        print(traceback.format_exc())
        
    return None

def clean_url_component(text):
    """清理URL组件中的特殊字符"""
    if not text:
        return ""
        
    # 移除括号及其内容
    text = re.sub(r'\([^)]*\)', '', text)
    
    # 移除特殊字符，保留字母、数字和空格
    cleaned = re.sub(r'[^a-zA-Z0-9\s-]', '', text)
    
    # 将空格替换为连字符
    cleaned = cleaned.strip().replace(' ', '-')
    
    # 转换为小写
    cleaned = cleaned.lower()
    
    # 移除多余的连字符
    cleaned = re.sub(r'-+', '-', cleaned)
    
    # 移除开头和结尾的连字符
    cleaned = cleaned.strip('-')
    
    return cleaned

async def verify_url(url, platform):
    """验证URL是否有效"""
    if not url:
        return False
        
    try:
        print(f"正在验证URL: {url}")
        async with aiohttp.ClientSession() as session:
            async with session.head(url, allow_redirects=True) as response:
                is_valid = response.status == 200
                print(f"URL验证结果: {is_valid} (状态码: {response.status})")
                return is_valid
    except Exception as e:
        print(f"验证URL时出错: {e}")
        return False


async def get_element_text(page_or_element, selector):
    """辅助函数：获取元素文本内容"""
    try:
        element = await page_or_element.query_selector(selector)
        return await element.inner_text() if element else "暂无"
    except:
        return "暂无"

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

async def search_douban(page, tmdb_info):
    """在豆瓣搜索影视信息"""
    try:
        # 构建搜索URL
        search_url = f"https://search.douban.com/movie/subject_search?search_text={quote(tmdb_info['zh_title'])}"
        print(f"访问豆瓣搜索页面: {search_url}")

        await page.goto(search_url, wait_until='domcontentloaded')
        await asyncio.sleep(2)
        
        # 使用统一的访问限制检查函数
        rate_limit = await check_rate_limit(page, "douban")
        if rate_limit:
            print("检测到豆瓣访问限制")
            return {"status": RATING_STATUS["RATE_LIMIT"]} 

        # 获取搜索结果
        results = []
        items = await page.query_selector_all('.title-text')
        print(f"找到 {len(items)} 个搜索结果")
        if not items:
            print("未找到搜索结果")
            return {"status": RATING_STATUS["NO_FOUND"]}
        
        # 根据媒体类型使用不同的匹配逻辑
        if tmdb_info.get("type") == "tv":
            print("使用剧集匹配逻辑")
            for item in items:
                try:
                    # 获取标题和年份
                    text = await item.inner_text()
                    match = re.search(r'(.*?)\s*(?:\((\d{4})\))?$', text)
                    if not match:
                        continue
                        
                    title = match.group(1).strip()
                    year = match.group(2) if match.group(2) else ""
                    
                    # 获取URL
                    href = await item.get_attribute('href')
                    if not href:
                        continue
                    
                    # 获取季数信息（如果有）
                    season_match = re.search(r'第([一二三四五六七八九十百]+)季', title)
                    season_number = chinese_to_arabic(season_match.group(1)) if season_match else None
                    
                    result = {
                        "title": title,
                        "year": year,
                        "url": href,
                    }
                    
                    # 使用严格的匹配规则
                    match_score = calculate_match_degree(tmdb_info, result, platform="douban")
                    if match_score >= 70:  # 只保留匹配度高的结果
                        print(f"找到匹配结果: {title} ({year}) - 第{season_number}季 - 匹配分数: {match_score}")
                        results.append(result)
                    else:
                        print(f"不匹配的结果: {title} ({year}) - 第{season_number}季 - 匹配分数: {match_score}")
                    
                except Exception as e:
                    print(f"处理豆瓣搜索结果项时出错: {e}")
                    continue
        else:
            print("使用电影匹配逻辑")
            for item in items:
                try:
                    # 获取标题和年份
                    text = await item.inner_text()
                    match = re.search(r'(.*?)\s*(?:\((\d{4})\))?$', text)
                    if not match:
                        continue
                        
                    title = match.group(1).strip()
                    year = match.group(2) if match.group(2) else ""
                    
                    # 获取URL
                    href = await item.get_attribute('href')
                    if not href:
                        continue
                    
                    result = {
                        "title": title,
                        "year": year,
                        "url": href
                    }
                    
                    # 使用常规匹配规则
                    match_score = calculate_match_degree(tmdb_info, result, platform="douban")
                    if match_score > 50:  # 对电影使用更宽松的匹配条件
                        print(f"找到匹配结果: {title} ({year}) - 匹配分数: {match_score}")
                        results.append(result)
                    else:
                        print(f"不匹配的结果: {title} ({year}) - 匹配分数: {match_score}")
                    
                except Exception as e:
                    print(f"处理豆瓣搜索结果项时出错: {e}")
                    continue
        
        # 按匹配分数排序        
        results.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        print(f"搜索完成，找到 {len(results)} 个匹配结果")
        return results
        
    except Exception as e:
        print(f"访问豆瓣搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}
    
async def search_imdb(page, tmdb_info):
    """在IMDB搜索影视信息"""
    try:
        # 如果有IMDB ID，直接使用
        if tmdb_info.get("imdb_id"):
            imdb_id = tmdb_info["imdb_id"]
            return [{
                "title": tmdb_info["title"],
                "year": tmdb_info["year"],
                "url": f"https://www.imdb.com/title/{imdb_id}/",
                "imdb_id": imdb_id
            }]
            
        # 如果没有IMDB ID，才进行搜索
        search_url = f"https://www.imdb.com/find/?q={quote(tmdb_info['title'])}"
        print(f"访问IMDB搜索页面: {search_url}")

        await page.goto(search_url, wait_until='domcontentloaded')
        await asyncio.sleep(2)
        
        # 使用统一的访问限制检查函数
        rate_limit = await check_rate_limit(page, "imdb")
        if rate_limit:
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        # 获取搜索结果
        results = []
        items = await page.query_selector_all('.ipc-metadata-list-summary-item__t')
        print(f"找到 {len(items)} 个搜索结果")
        if not items:
            print("未找到搜索结果")
            return {"status": RATING_STATUS["NO_FOUND"]}
        
        for item in items:
            try:
                # 获取标题
                title = await item.inner_text()
                
                # 获取年份
                year_elem = await item.evaluate('element => element.closest(".ipc-metadata-list-summary-item").querySelector(".ipc-inline-list__item span")')
                year = await year_elem.inner_text() if year_elem else ""
                
                # 获取IMDB ID
                href = await item.get_attribute('href')
                imdb_id = re.search(r'/title/(tt\d+)/', href).group(1) if href else ""
                
                if title and year and imdb_id:
                    results.append({
                        "title": title,
                        "year": year,
                        "url": f"https://www.imdb.com/title/{imdb_id}/",
                        "imdb_id": imdb_id
                    })
            except Exception as e:
                print(f"处理IMDB搜索结果项时出错: {e}")
                continue
                
        # 按匹配分数排序        
        results.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        print(f"搜索完成，找到 {len(results)} 个匹配结果")
        return results
        
    except Exception as e:
        print(f"访问IMDB搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}
    
async def search_rottentomatoes(page, tmdb_info):
    """在Rotten Tomatoes搜索影视信息"""
    try:
        # 构建搜索URL
        search_url = f"https://www.rottentomatoes.com/search?search={quote(tmdb_info['title'])}"
        print(f"访问Rotten Tomatoes搜索页面: {search_url}")

        await page.goto(search_url, wait_until='domcontentloaded')
        await asyncio.sleep(2)
        
        # 使用统一的访问限制检查函数
        rate_limit = await check_rate_limit(page, "rottentomatoes")
        if rate_limit:
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        # 直接获取所有搜索结果
        results = []
        items = await page.query_selector_all('search-page-media-row[data-qa="data-row"]')
        print(f"找到 {len(items)} 个搜索结果")
        if not items:
            print("未找到搜索结果")
            return {"status": RATING_STATUS["NO_FOUND"]}
        
        for item in items:
            try:
                title_elem = await item.query_selector('a[data-qa="info-name"]')
                if title_elem:
                    title = await title_elem.inner_text()
                    title = title.strip()
                    url = await title_elem.get_attribute('href')
                    year = await item.get_attribute('startyear')
                    
                    print(f"找到结果: {title} ({year})")
                    
                    # 精确匹配标题
                    if title.lower() == tmdb_info['title'].lower():
                        print(f"找到完全匹配: {title} ({year})")
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
                        "match_score": calculate_match_degree(tmdb_info, {"title": title, "year": year}),
                        "number_of_seasons": tmdb_info.get("number_of_seasons", 0)
                    })
            except Exception as e:
                print(f"处理Rotten Tomatoes搜索结果项时出错: {e}")
                continue

        # 按匹配分数排序        
        results.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        print(f"搜索完成，找到 {len(results)} 个匹配结果")
        return results
            
    except Exception as e:
        print(f"访问Rotten Tomatoes搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}


async def search_metacritic(page, tmdb_info):
    """在Metacritic搜索影视信息"""
    try:
        # 构建搜索URL
        search_url = f"https://www.metacritic.com/search/{quote(tmdb_info['title'])}/"
        print(f"访问Metacritic搜索页面: {search_url}")

        await page.goto(search_url, wait_until='domcontentloaded')
        await asyncio.sleep(2)

        # 使用统一的访问限制检查函数
        rate_limit = await check_rate_limit(page, "metacritic")
        if rate_limit:
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        # 获取搜索结果
        results = []
        items = await page.query_selector_all('a[class*="c-pageSiteSearch-results-item"]')
        print(f"找到 {len(items)} 个搜索结果")
        if not items:
            print("未找到搜索结果")
            return {"status": RATING_STATUS["NO_FOUND"]}
        
        for item in items:
            try:
                # 获取标题
                title_elem = await item.query_selector('p.g-text-medium-fluid')
                if not title_elem:
                    continue
                    
                title = await title_elem.inner_text()
                title = title.strip()
                
                # 获取年份
                year_elem = await item.query_selector('span.u-text-uppercase')
                year = await year_elem.inner_text() if year_elem else ""
                year = year.strip()
                
                # 获取URL
                href = await item.get_attribute('href')
                if href:
                    url = f"https://www.metacritic.com{href}"
                    
                    # 检查标题和年份是否匹配
                    if (title.lower() == tmdb_info['title'].lower() and 
                        year == tmdb_info['year']):
                        return [{
                            "title": title,
                            "year": year,
                            "url": url,
                            "match_score": 100
                        }]
                    
                    results.append({
                        "title": title,
                        "year": year,
                        "url": url,
                        "match_score": calculate_match_degree(tmdb_info, {"title": title, "year": year})
                    })
            except Exception as e:
                print(f"处理Metacritic搜索结果项时出错: {e}")
                continue

        # 按匹配分数排序        
        results.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        print(f"搜索完成，找到 {len(results)} 个匹配结果")
        return results
        
    except Exception as e:
        print(f"访问Metacritic搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}

async def search_letterboxd(page, tmdb_info):
    """在Letterboxd搜索影视信息"""
    try:
        # 构建搜索URL
        search_url = f"https://letterboxd.com/search/{quote(tmdb_info['title'])}/"
        print(f"访问Letterboxd搜索页面: {search_url}")
        
        await page.goto(search_url, wait_until='domcontentloaded')
        await asyncio.sleep(2)

       # 使用统一的访问限制检查函数
        rate_limit = await check_rate_limit(page, "letterboxd")
        if rate_limit:
            return {"status": RATING_STATUS["RATE_LIMIT"]} 
        
        # 获取搜索结果
        results = []
        items = await page.query_selector_all('.results .film-detail')
        print(f"找到 {len(items)} 个搜索结果")
        if not items:
            print("未找到搜索结果")
            return {"status": RATING_STATUS["NO_FOUND"]}

        for item in items:
            try:
                # 获取标题
                title_elem = await item.query_selector('a')
                if not title_elem:
                    continue
                    
                title = await title_elem.inner_text()
                # 移除 <small> 标签中的内容
                title = title.split(' <small')[0].strip()
                
                # 获取年份
                year_elem = await item.query_selector('a[href*="/films/year/"]')
                year = await year_elem.inner_text() if year_elem else ""
                
                # 获取URL
                href = await title_elem.get_attribute('href')
                if href:
                    url = f"https://letterboxd.com{href}"
                    
                    # 检查标题和年份是否匹配
                    if (title.lower() == tmdb_info['title'].lower() and 
                        year == tmdb_info['year']):
                        # 如果完全匹配，直接返回这个结果
                        return [{
                            "title": title,
                            "year": year,
                            "url": url,
                            "match_score": 100
                        }]
                    
                    results.append({
                        "title": title,
                        "year": year,
                        "url": url,
                        "match_score": calculate_match_degree(tmdb_info, {"title": title, "year": year})
                    })
            except Exception as e:
                print(f"处理Letterboxd搜索结果项时出错: {e}")
                continue
        
        # 按匹配分数排序
        results.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        print(f"搜索完成，找到 {len(results)} 个匹配结果")        
        return results
        
    except Exception as e:
        print(f"访问Letterboxd搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}

def calculate_match_score(result, tmdb_info):
    """计算匹配度分数（总分100分）"""
    score = 0
    
    # 标题匹配（60分）
    tmdb_title = tmdb_info["original_title"].lower()
    result_title = result["title"].lower()
    if tmdb_title == result_title:
        score += 60  # 完全匹配
    elif tmdb_title in result_title or result_title in tmdb_title:
        score += 40  # 部分匹配
        
    # 年份匹配（30分）
    try:
        tmdb_year = int(tmdb_info["year"])
        result_year = int(result["year"])
        if tmdb_year == result_year:
            score += 30  # 完全匹配
        elif abs(tmdb_year - result_year) == 1:
            score += 15  # 相差一年
    except (ValueError, TypeError):
        pass
        
    # IMDB ID匹配（10分）
    if "imdb_id" in result and "imdb_id" in tmdb_info:
        if result["imdb_id"] == tmdb_info["imdb_id"]:
            score += 10
            
    # 导演匹配作为加分项（不计入基础100分）
    if "director" in result and "director" in tmdb_info:
        tmdb_director = tmdb_info["director"].lower()
        result_director = result["director"].lower()
        if tmdb_director == result_director:
            score += 5  # 完全匹配加5分
        elif tmdb_director in result_director or result_director in tmdb_director:
            score += 3  # 部分匹配加3分
            
    return score

def calculate_match_degree(tmdb_info, result, platform=""):
    """计算搜索结果与TMDB信息的匹配度"""
    try:
        score = 0
        
        # 专门针对豆瓣平台的剧集
        if platform == "douban" and tmdb_info.get("type") == "tv":
            print("\n豆瓣剧集特殊匹配逻辑:")
            
            # 1. 提取主标题（去掉季数和原剧名）
            result_title = result.get("title", "").lower()
            main_title = result_title.split('第')[0].strip()
            tmdb_title = tmdb_info.get("zh_title", "").lower()
            
            print(f"比较标题: '{main_title}' vs '{tmdb_title}'")
            
            # 标题必须完全匹配
            if main_title != tmdb_title:
                print("标题不匹配")
                return 0
            
            score += 60  # 标题完全匹配得60分
            print("标题完全匹配，得分: 60")
            
            # 2. 季数和年份匹配
            season_match = re.search(r'第([一二三四五六七八九十百]+)季', result_title)
            if season_match:
                chinese_season_number = season_match.group(1)
                result_season_number = chinese_to_arabic(chinese_season_number)
                result_year = str(result.get("year", ""))
                
                print(f"检查季数 {result_season_number} 和年份 {result_year}")
                
                # 在TMDB季数信息中查找匹配
                for season in tmdb_info.get("seasons", []):
                    season_num = season.get("season_number")
                    season_year = str(season.get("air_date", ""))[:4]
                    print(f"对比TMDB季数 {season_num} 年份 {season_year}")
                    
                    if season_num == result_season_number:
                        if season_year == result_year:
                            score += 30  # 季数和年份完全匹配得30分
                            print(f"季数 {season_num} 和年份 {season_year} 匹配成功，得分: 30")
                            break
                        else:
                            print(f"年份不匹配: {season_year} != {result_year}")
                            return 0
                else:
                    print(f"未找到匹配的季数 {result_season_number}")
                    return 0
            
            # 3. IMDB ID匹配（如果有）
            if tmdb_info.get("imdb_id") and result.get("imdb_id"):
                if tmdb_info["imdb_id"] == result["imdb_id"]:
                    score += 10
                    print("IMDB ID 匹配，得分: 10")
            
        else:
            # 其他平台或非剧集的匹配逻辑
            # 获取所有可能的标题
            tmdb_titles = [
                tmdb_info.get("title", "").lower(),
                tmdb_info.get("original_title", "").lower(),
                tmdb_info.get("zh_title", "").lower() if platform == "douban" else ""
            ]
            result_title = result.get("title", "").lower()
            
            # 打印调试信息
            print(f"\n比较标题信息:")
            print(f"TMDB标题: {tmdb_titles}")
            print(f"结果标题: {result_title}")
            
            # 1. 标题匹配度计算（60分）
            title_scores = [fuzz.ratio(t, result_title) for t in tmdb_titles if t]
            if title_scores:
                title_score = max(title_scores)
                score += title_score * 0.6
                print(f"标题匹配度: {title_score}%, 得分: {title_score * 0.6}")
            
            # 2. 年份匹配（30分）
            try:
                tmdb_year = str(tmdb_info.get("year", ""))
                result_year = str(result.get("year", ""))
                
                if tmdb_year and result_year:
                    year_diff = abs(int(tmdb_year) - int(result_year))
                    if year_diff == 0:
                        score += 30
                        print(f"年份完全匹配 ({tmdb_year}), 得分: 30")
                    elif year_diff == 1:
                        score += 15
                        print(f"年份相差1年 ({tmdb_year} vs {result_year}), 得分: 15")
                    else:
                        print(f"年份差异过大 ({tmdb_year} vs {result_year}), 不得分")
            except (ValueError, TypeError) as e:
                print(f"年份比较出错: {e}")
            
            # 3. IMDB ID匹配（10分）
            if tmdb_info.get("imdb_id") and result.get("imdb_id"):
                if tmdb_info["imdb_id"] == result["imdb_id"]:
                    score += 10
                    print("IMDB ID完全匹配, 得分: 10")
        
        # 根据平台调整匹配阈值
        threshold = {
            "douban": 70,      # 豆瓣需要较高匹配度
            "imdb": 70,        # IMDB可以稍微宽松
            "letterboxd": 70,
            "rottentomatoes": 70,
            "metacritic": 70
        }.get(platform, 70)
        
        print(f"最终匹配分数: {score}, 平台({platform})匹配阈值: {threshold}")
        
        # 返回匹配结果
        if score >= threshold:
            print("匹配成功!")
            return score
        else:
            print("匹配失败: 分数未达到阈值")
            return 0
            
    except Exception as e:
        print(f"计算匹配度时出错: {e}")
        return 0
    
async def search_platform(platform, tmdb_info, request=None):
    """在各平台搜索并返回搜索结果"""
    browser = None
    context = None
    
    try:
        # 检查请求是否已被取消
        if request and await request.is_disconnected():
            return {"status": "cancelled"}
            
        if platform == "douban":
            search_title = tmdb_info["zh_title"] or tmdb_info["original_title"]
        else:
            search_title = tmdb_info["title"] or tmdb_info["original_title"]
        
        media_type = tmdb_info["type"]
        search_url = construct_search_url(search_title, media_type, platform)
        
        async with async_playwright() as p:
            # 1. 优化浏览器启动配置
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
                '--mute-audio'
            ]
            
            browser = await p.chromium.launch(
                headless=True,
                args=browser_args,
                timeout=60000,
                ignore_default_args=['--enable-automation']
            )
            
            # 检查请求是否已被取消
            if request and await request.is_disconnected():
                print("请求已被取消,停止执行")
                return {"status": "cancelled"}
                
            # 2. 优化上下文配置
            context_options = {
                'viewport': {'width': 1920, 'height': 1080},
                'user_agent': random.choice(USER_AGENTS),
                'bypass_csp': True,
                'ignore_https_errors': True,
                'java_script_enabled': True,
                'has_touch': False,
                'is_mobile': False,
                'locale': 'en-US',
                'timezone_id': 'America/New_York'
            }
            
            context = await browser.new_context(**context_options)
            
            # 3. 添加请求拦截，阻止不必要的资源加载
            await context.route("**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2,ttf}", lambda route: route.abort())
            await context.route("**/(analytics|tracking|advertisement)", lambda route: route.abort())
            
            page = await context.new_page()
            page.set_default_timeout(30000)
            
            print(f"正在搜索 {platform}: {search_url}")
            
            try:
                # 在每个关键操作前检查请求状态
                async def check_request():
                    if request and await request.is_disconnected():
                        print("请求已被取消,停止执行")
                        raise RequestCancelledException()

                # 4. 获取搜索结果
                await check_request()
                if platform == "douban":
                    results = await retry_request(handle_douban_search, page, search_url)
                elif platform == "imdb":
                    results = await retry_request(handle_imdb_search, page, search_url)
                elif platform == "letterboxd":
                    results = await retry_request(handle_letterboxd_search, page, search_url)
                elif platform == "rottentomatoes":
                    results = await retry_request(handle_rt_search, page, search_url, tmdb_info)
                elif platform == "metacritic":
                    results = await retry_request(handle_metacritic_search, page, search_url)
                
                # 5. 检查访问限制
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
                    
                # 6. 检查搜索结果
                await check_request()
                if not isinstance(results, list):
                    if isinstance(results, list):
                        print(f"{platform} 搜索无结果")
                        return []
                    else:
                        print(f"{platform} 获取失败")
                        return create_error_rating_data(platform, media_type)
                
                print(f"找到 {len(results)} 个 {platform} 搜索结果")
                
                # 7. 根据匹配度过滤结果
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
                    match_score = calculate_match_degree(tmdb_info, result, platform)
                    if match_score >= threshold:
                        matched_results.append(result)
                        print(f"找到匹配结果: {result.get('title')} ({result.get('year', '')}) - 匹配度: {match_score}")
                    else:
                        print(f"搜索结果不匹配: {result.get('title')} ({result.get('year', '')}) - 匹配度: {match_score}")
                
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
        if context:
            try:
                await context.close()
            except Exception as e:
                print(f"关闭 context 时出错: {e}")
                
        if browser:
            try:
                await browser.close()
            except Exception as e:
                print(f"关闭 browser 时出错: {e}")

# 添加自定义异常类
class RequestCancelledException(Exception):
    pass

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
                'h1:has-text("有异常请求")',  # 添加新的选择器
                'div:has-text("有异常请求从你的IP发出")'  # 添加新的选择器
            ],
            "phrases": [
                "访问太频繁",
                "访问受限",
                "请求过于频繁",
                "操作太频繁",
                "请求次数过多",
                "登录跳转",
                "搜索访问太频繁",
                "有异常请求",  # 添加新的匹配文本
                "异常请求从你的IP发出"  # 添加新的匹配文本
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
    
async def handle_douban_search(page, search_url):
    """处理豆瓣搜索"""
    try:
        print(f"访问豆瓣搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
        
        # 立即检查是否出现访问频率限制
        rate_limit_elem = await page.query_selector('.note-text')
        if rate_limit_elem:
            rate_limit_text = await rate_limit_elem.inner_text()
            if "访问太频繁" in rate_limit_text:
                print(f"豆瓣访问频率限制: {rate_limit_text}")
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

async def handle_imdb_search(page, search_url):
    """处理IMDB搜索"""
    try:
        print(f"访问 IMDB 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
    
        # 立即检查是否出现访问频率限制
        rate_limit_elem = await page.query_selector('.note-text')
        if rate_limit_elem:
            rate_limit_text = await rate_limit_elem.inner_text()
            if "访问太频繁" in rate_limit_text:
                print(f"IMDB访问频率限制: {rate_limit_text}")
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

async def handle_rt_search(page, search_url, tmdb_info):
    """处理Rotten Tomatoes搜索"""
    try:
        print(f"访问 Rotten Tomatoes 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
    
        # 立即检查是否出现访问频率限制
        rate_limit_elem = await page.query_selector('.note-text')
        if rate_limit_elem:
            rate_limit_text = await rate_limit_elem.inner_text()
            if "访问太频繁" in rate_limit_text:
                print(f"Rotten Tomatoes访问频率限制: {rate_limit_text}")
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
                            print(f"找到完全匹配: {title} ({year})")
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
                            "match_score": calculate_match_degree(tmdb_info, {"title": title, "year": year}),
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

async def handle_metacritic_search(page, search_url):
    """处理Metacritic搜索"""
    try:
        print(f"访问 Metacritic 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
    
        # 立即检查是否出现访问频率限制
        rate_limit_elem = await page.query_selector('.note-text')
        if rate_limit_elem:
            rate_limit_text = await rate_limit_elem.inner_text()
            if "访问太频繁" in rate_limit_text:
                print(f"Metacritic访问频率限制: {rate_limit_text}")
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

async def handle_letterboxd_search(page, search_url):
    """处理Letterboxd搜索"""
    try:
        print(f"访问 Letterboxd 搜索页面: {search_url}")
        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(2)
    
        # 立即检查是否出现访问频率限制
        rate_limit_elem = await page.query_selector('.note-text')
        if rate_limit_elem:
            rate_limit_text = await rate_limit_elem.inner_text()
            if "访问太频繁" in rate_limit_text:
                print(f"Letterboxd访问频率限制: {rate_limit_text}")
                return {"status": RATING_STATUS["RATE_LIMIT"]}
        
        try:
            # 检查搜索结果
            items = await page.query_selector_all('.results li')
            results = []
            
            # 如果没有搜索结果
            if not items:
                return {"status": RATING_STATUS["NO_FOUND"]}
            
            for item in items:
                try:
                    # 更新选择器以匹配实际HTML结构
                    title_elem = await item.query_selector('.film-title-wrapper a')
                    year_elem = await item.query_selector('.film-title-wrapper small.metadata a')
                    director_elem = await item.query_selector('.film-metadata a[href^="/director/"]')
                
                    if title_elem:
                        title = await title_elem.inner_text()
                        url = await title_elem.get_attribute('href')
                        year = await year_elem.inner_text() if year_elem else ""
                        director = await director_elem.inner_text() if director_elem else ""
                    
                        # 清理标题中的额外文本
                        title = title.split(' <small')[0].strip()
                    
                        print(f"找到结果: {title} ({year})")
                    
                        results.append({
                            "title": title,
                            "year": year,
                            "director": director,
                            "url": f"https://letterboxd.com{url}"
                        })
                except Exception as e:
                    print(f"处理Letterboxd单个结果时出错: {e}")
                    continue
        
            return results if results else {"status": RATING_STATUS["NO_FOUND"]}
        
        except Exception as e:
            print(f"等待Letterboxd搜索结果超时: {e}")
            if "Timeout" in str(e):
                return {"status": RATING_STATUS["TIMEOUT"]}
            return {"status": RATING_STATUS["FETCH_FAILED"]}
      
    except Exception as e:
        print(f"访问Letterboxd搜索页面失败: {e}")
        if "Timeout" in str(e):
            return {"status": RATING_STATUS["TIMEOUT"]}
        return {"status": RATING_STATUS["FETCH_FAILED"]}

async def extract_douban_rating(page, media_type, matched_results):
    """从豆瓣详情页提取评分数据"""
    try:
        ratings = {"seasons": []}  # 添加这行，确保初始化 seasons 列表
        
        if media_type != "tv":
            # 电影评分处理逻辑保持不变
            rating_elem = await page.query_selector('.rating_self strong.rating_num')
            rating = await rating_elem.inner_text() if rating_elem else "暂无"
            
            rating_people_elem = await page.query_selector('.rating_self a.rating_people span[property="v:votes"]')
            rating_people = await rating_people_elem.inner_text() if rating_people_elem else "暂无"
            
            print("\n豆瓣平台评分信息：")
            print(f"rating: {rating}")
            print(f"rating_people: {rating_people}")
            print("豆瓣平台评分信息获取完成")
            
            return {
                "rating": rating,
                "rating_people": rating_people
            }
        else:
            # 剧集评分处理逻辑
            seasons_data = []
            
            # 先打印所有要访问的URL
            for result in matched_results:
                title = result.get("title", "")
                season_match = re.search(r'第([一二三四五六七八九十百]+)季', title)
                if season_match:
                    chinese_season_number = season_match.group(1)
                    season_number = chinese_to_arabic(chinese_season_number)
                    url = result.get("url")
                    if url:
                        print(f"访问第{season_number}季: {url}")
            
            print("\n豆瓣平台评分信息：")
            # 然后获取评分数据
            for result in matched_results:
                try:
                    # 从标题中提取季数
                    title = result.get("title", "")
                    season_match = re.search(r'第([一二三四五六七八九十百]+)季', title)
                    if not season_match:
                        continue
                        
                    chinese_season_number = season_match.group(1)
                    season_number = chinese_to_arabic(chinese_season_number)
                    
                    url = result.get("url")
                    if not url:
                        continue
                    
                    await page.goto(url, wait_until='domcontentloaded')
                    await asyncio.sleep(2)
                    
                    # 获取该季评分
                    rating_elem = await page.query_selector('.rating_self strong.rating_num')
                    rating = await rating_elem.inner_text() if rating_elem else "暂无"
                    
                    rating_people_elem = await page.query_selector('.rating_self a.rating_people span[property="v:votes"]')
                    rating_people = await rating_people_elem.inner_text() if rating_people_elem else "暂无"
                    
                    ratings["seasons"].append({
                        "season_number": season_number,
                        "rating": rating,
                        "rating_people": rating_people
                    })
                    
                except Exception as e:
                    print(f"获取评分时出错: {e}")
                    continue
            
            print("豆瓣平台评分信息获取完成")
            
            # 按季数排序
            ratings["seasons"].sort(key=lambda x: x["season_number"])
            
            print(f"豆瓣评分数据: {ratings}")
            return ratings
            
    except Exception as e:
        print(f"提取豆瓣评分数据时出错: {e}")
        return {
            "seasons": [],
            "rating": "暂无",
            "rating_people": "暂无"
        }

async def extract_imdb_rating(page):
    """从IMDB详情页提取评分数据"""
    try:
        # 等待评分元素加载
        await page.wait_for_selector('.sc-d541859f-1.imUuxf', timeout=5000)
        
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
            "rating_people": "暂无"
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
        ratings = {
            'series': {},
            'seasons': []
        }
        
        # 1. 获取整部剧集的评分数据
        # 使用 JavaScript 点击评分模块
        await page.evaluate('''() => {
            const button = document.querySelector('rt-text[slot="criticsScoreType"]');
            if (button) button.click();
            
            // 点击 All Critics 和 All Audience
            setTimeout(() => {
                const allCritics = document.querySelector('rt-tab[slot="btnAllCritics"]');
                const allAudience = document.querySelector('rt-tab[slot="btnAllAudience"]');
                if (allCritics) allCritics.click();
                if (allAudience) allAudience.click();
            }, 1000);
        }''')
        await asyncio.sleep(2)
        
        # 获取整部剧集评分，直接作为字典存储
        series_data = await page.evaluate('''() => {
            const getData = (selector) => {
                const elem = document.querySelector(selector);
                return elem ? elem.innerText : "暂无";
            };
            return {
                tomatometer: getData('rt-text[slot="criticsScore"]'),
                audience_score: getData('rt-text[slot="audienceScore"]'),
                critics_avg: getData('rt-text[slot="criticsAverageRating"]'),
                critics_count: getData('rt-link[slot="criticsLink"]'),
                audience_count: getData('rt-link[slot="audienceLink"]'),
                audience_avg: getData('rt-text[slot="audienceAverageRating"]')
            };
        }''')
        ratings['series'] = series_data 
        
        # 2. 获取分季评分
        if media_type == "tv" and tmdb_info.get("number_of_seasons", 0) > 0:
            base_url = page.url.split("/tv/")[1].split("/")[0]
            
            for season in range(1, tmdb_info.get("number_of_seasons", 0) + 1):
                try:
                    season_url = f"https://www.rottentomatoes.com/tv/{base_url}/s{str(season).zfill(2)}"
                    print(f"访问第{season}季: {season_url}")
                    
                    await page.goto(season_url, wait_until='domcontentloaded')
                    await asyncio.sleep(2)
                    
                    await page.evaluate('''() => {
                        const button = document.querySelector('rt-text[slot="criticsScoreType"]');
                        if (button) button.click();
                        
                        setTimeout(() => {
                            const allCritics = document.querySelector('rt-tab[slot="btnAllCritics"]');
                            const allAudience = document.querySelector('rt-tab[slot="btnAllAudience"]');
                            if (allCritics) allCritics.click();
                            if (allAudience) allAudience.click();
                        }, 1000);
                    }''')
                    await asyncio.sleep(2)
                    
                    season_data = await page.evaluate('''() => {
                        const getData = (selector) => {
                            const elem = document.querySelector(selector);
                            return elem ? elem.innerText.replace(/[^0-9.%+]/g, '') : "暂无";
                        };
                        return {
                            tomatometer: getData('rt-text[slot="criticsScore"]'),
                            audience_score: getData('rt-text[slot="audienceScore"]'),
                            critics_avg: getData('rt-text[slot="criticsAverageRating"]'),
                            audience_avg: getData('rt-text[slot="audienceAverageRating"]'),
                            critics_count: getData('rt-link[slot="criticsLink"]'),
                            audience_count: getData('rt-link[slot="audienceLink"]')
                        };
                    }''')
                    
                    season_data['season_number'] = season
                    ratings['seasons'].append(season_data)
                    
                except Exception as e:
                    print(f"获取第{season}季评分数据时出错: {e}")
                    continue
            
        return ratings
        
    except Exception as e:
        print(f"获取 Rotten Tomatoes 评分数据时出错: {e}")
        return None
    
async def extract_rt_scores(page, url, number_of_seasons):
    """获取 Rotten Tomatoes 评分数据"""
    try:
        scores = {
            'series': {},  # 整部剧集评分
            'seasons': {}  # 分季评分
        }
        
        # 1. 获取整部剧集评分
        print(f"访问剧集详情页: {url}")
        await page.goto(url, wait_until='domcontentloaded')
        await asyncio.sleep(2)
        
        # 点击评分模块显示评分数据
        score_button = await page.wait_for_selector('rt-text[slot="criticsScoreType"]')
        if score_button:
            await score_button.click()
            await asyncio.sleep(1)
            
            # 点击 All Critics 和 All Audience
            all_critics = await page.wait_for_selector('rt-tab[slot="btnAllCritics"]')
            all_audience = await page.wait_for_selector('rt-tab[slot="btnAllAudience"]')
            if all_critics:
                await all_critics.click()
                await asyncio.sleep(1)
            if all_audience:
                await all_audience.click()
                await asyncio.sleep(1)
            
            # 获取整部剧集评分数据
            critics_score = await page.query_selector('rt-text[slot="criticsScore"]')
            audience_score = await page.query_selector('rt-text[slot="audienceScore"]')
            critics_avg = await page.query_selector('rt-text[slot="criticsAverageRating"]')
            
            scores['series'] = {
                'tomatometer': await critics_score.inner_text() if critics_score else None,
                'audience_score': await audience_score.inner_text() if audience_score else None,
                'critics_avg': await critics_avg.inner_text() if critics_avg else None
            }
        
        # 2. 获取分季评分
        base_url = url.rstrip('/')
        for season in range(1, number_of_seasons + 1):
            season_url = f"{base_url}/s{season:02d}"
            print(f"访问第{season}季详情页: {season_url}")
            
            await page.goto(season_url, wait_until='domcontentloaded')
            await asyncio.sleep(2)
            
            # 点击评分模块显示评分数据
            score_button = await page.wait_for_selector('rt-text[slot="criticsScoreType"]')
            if score_button:
                await score_button.click()
                await asyncio.sleep(1)
                
                # 点击 All Critics 和 All Audience
                all_critics = await page.wait_for_selector('rt-tab[slot="btnAllCritics"]')
                all_audience = await page.wait_for_selector('rt-tab[slot="btnAllAudience"]')
                if all_critics:
                    await all_critics.click()
                    await asyncio.sleep(1)
                if all_audience:
                    await all_audience.click()
                    await asyncio.sleep(1)
                
                # 获取分季评分数据
                critics_score = await page.query_selector('rt-text[slot="criticsScore"]')
                audience_score = await page.query_selector('rt-text[slot="audienceScore"]')
                critics_count = await page.query_selector('rt-link[slot="criticsLink"]')
                audience_count = await page.query_selector('rt-link[slot="audienceLink"]')
                critics_avg = await page.query_selector('rt-text[slot="criticsAverageRating"]')
                audience_avg = await page.query_selector('rt-text[slot="audienceAverageRating"]')
                
                scores['seasons'][f'season_{season}'] = {
                    'tomatometer': await critics_score.inner_text() if critics_score else None,
                    'audience_score': await audience_score.inner_text() if audience_score else None,
                    'critics_count': await critics_count.inner_text() if critics_count else None,
                    'audience_count': await audience_count.inner_text() if audience_count else None,
                    'critics_avg': await critics_avg.inner_text() if critics_avg else None,
                    'audience_avg': await audience_avg.inner_text() if audience_avg else None
                }
        
        return scores
        
    except Exception as e:
        print(f"获取 Rotten Tomatoes 评分数据时出错: {e}")
        return None
        
class RTScraper:
    def __init__(self):
        self.last_request_time = 0
        self.min_interval = 0.2
    
    async def extract_rating(self, page, media_type, tmdb_info) -> dict:
        try:
            ratings = {
                'series': RTRating(),
                'seasons': []
            }
            
            # 1. 获取整部剧集评分
            await self._click_rating_buttons(page)
            ratings['series'] = await self._extract_series_rating(page)
            
            # 2. 获取分季评分
            if media_type == "tv" and tmdb_info.get("number_of_seasons", 0) > 0:
                base_url = page.url.split("/tv/")[1].split("/")[0]  # 提取剧集ID
                
                for season in range(1, tmdb_info.get("number_of_seasons", 0) + 1):
                    season_url = f"https://www.rottentomatoes.com/tv/{base_url}/s{str(season).zfill(2)}"
                    print(f"访问第{season}季: {season_url}")
                    
                    try:
                        await page.goto(season_url, wait_until='domcontentloaded')
                        await asyncio.sleep(2)
                        
                        await self._click_rating_buttons(page)
                        season_rating = await self._extract_season_rating(page, season)
                        ratings['seasons'].append(season_rating)
                        
                    except Exception as e:
                        print(f"获取第{season}季评分失败: {e}")
                        continue
            
            return ratings
            
        except Exception as e:
            print(f"获取评分数据失败: {e}")
            return None
    
    async def _click_rating_buttons(self, page):
        """点击评分按钮和标签"""
        await page.evaluate('''() => {
            const button = document.querySelector('rt-text[slot="criticsScoreType"]');
            if (button) button.click();
            
            setTimeout(() => {
                const allCritics = document.querySelector('rt-tab[slot="btnAllCritics"]');
                const allAudience = document.querySelector('rt-tab[slot="btnAllAudience"]');
                if (allCritics) allCritics.click();
                if (allAudience) allAudience.click();
            }, 1000);
        }''')
        await asyncio.sleep(2)
    
    async def _extract_series_rating(self, page) -> RTRating:
        """提取整部剧集评分"""
        data = await page.evaluate('''() => {
            const getData = (selector) => {
                const elem = document.querySelector(selector);
                return elem ? elem.innerText : "暂无";
            };
            return {
                tomatometer: getData('rt-text[slot="criticsScore"]'),
                audience_score: getData('rt-text[slot="audienceScore"]'),
                critics_avg: getData('rt-text[slot="criticsAverageRating"]'),
                critics_count: getData('rt-link[slot="criticsLink"]'),
                audience_count: getData('rt-link[slot="audienceLink"]'),
                audience_avg: getData('rt-text[slot="audienceAverageRating"]')
            };
        }''')
        return RTRating(**data)
    
    async def _extract_season_rating(self, page, season_number) -> dict:
        """提取分季评分"""
        data = await page.evaluate('''() => {
            const getData = (selector) => {
                const elem = document.querySelector(selector);
                return elem ? elem.innerText : "暂无";
            };
            return {
                tomatometer: getData('rt-text[slot="criticsScore"]'),
                audience_score: getData('rt-text[slot="audienceScore"]'),
                critics_count: getData('rt-link[slot="criticsLink"]'),
                audience_count: getData('rt-link[slot="audienceLink"]'),
                critics_avg: getData('rt-text[slot="criticsAverageRating"]'),
                audience_avg: getData('rt-text[slot="audienceAverageRating"]')
            };
        }''')
        data['season_number'] = season_number
        return data

async def extract_metacritic_rating(page, media_type, tmdb_info):
    """从Metacritic详情页提取评分数据"""
    try:
        ratings = {}

        # 1. 获取整部剧集的评分数据
        # 专业评分
        metascore_elem = await page.query_selector('div[data-v-e408cafe][title*="Metascore"] span')
        metascore = await metascore_elem.inner_text() if metascore_elem else "暂无"
        
        # 专业评分人数
        critics_count_elem = await page.query_selector('a[data-testid="critic-path"] span')
        critics_count_text = await critics_count_elem.inner_text() if critics_count_elem else ""
        critics_count = re.search(r'Based on (\d+) Critic', critics_count_text).group(1) if critics_count_text else "暂无"
        
        # 观众评分
        userscore_elem = await page.query_selector('div[data-v-e408cafe][title*="User score"] span')
        userscore = await userscore_elem.inner_text() if userscore_elem else "暂无"
        
        # 观众评分人数
        users_count_elem = await page.query_selector('a[data-testid="user-path"] span')
        users_count_text = await users_count_elem.inner_text() if users_count_elem else ""
        users_count = re.search(r'Based on ([\d,]+) User', users_count_text).group(1) if users_count_text else "暂无"
        
        ratings["overall"] = {
            "metascore": metascore,
            "critics_count": critics_count,
            "userscore": userscore,
            "users_count": users_count
        }
        
        # 2. 如果是剧集且有多季，获取每一季的评分数据
        if media_type == "tv" and tmdb_info.get("number_of_seasons", 0) > 0:
            ratings["seasons"] = []
            base_url = page.url.rstrip('/')  # 移除末尾的斜杠

            for season in tmdb_info.get("seasons", []):
                season_number = season.get("season_number")
                try:
                    # 构造并访问分季URL
                    season_url = f"{base_url}/season-{season_number}/"
                    print(f"访问第{season_number}季URL: {season_url}")

                    await page.goto(season_url, wait_until='domcontentloaded')
                    await asyncio.sleep(2)
                    
                    # 获取该季的评分数据
                    # 专业评分
                    season_metascore_elem = await page.query_selector('div[data-v-e408cafe][title*="Metascore"] span')
                    season_metascore = await season_metascore_elem.inner_text() if season_metascore_elem else "暂无"
                    
                    # 专业评分人数
                    season_critics_count_elem = await page.query_selector('a[data-testid="critic-path"] span')
                    season_critics_count_text = await season_critics_count_elem.inner_text() if season_critics_count_elem else ""
                    season_critics_count = re.search(r'Based on (\d+) Critic', season_critics_count_text).group(1) if season_critics_count_text else "暂无"
                    
                    # 观众评分
                    season_userscore_elem = await page.query_selector('div[data-v-e408cafe][title*="User score"] span')
                    season_userscore = await season_userscore_elem.inner_text() if season_userscore_elem else "暂无"
                    
                    # 观众评分人数
                    season_users_count_elem = await page.query_selector('a[data-testid="user-path"] span')
                    season_users_count_text = await season_users_count_elem.inner_text() if season_users_count_elem else ""
                    season_users_count = re.search(r'Based on ([\d,]+) User', season_users_count_text).group(1) if season_users_count_text else "暂无"
                    
                    ratings["seasons"].append({
                        "season_number": season_number,
                        "metascore": season_metascore,
                        "critics_count": season_critics_count,
                        "userscore": season_userscore,
                        "users_count": season_users_count
                    })
                    
                except Exception as e:
                    print(f"获取第{season_number}季评分数据时出错: {e}")
                    continue
        
        print(f"Metacritic评分数据: {ratings}")
        return ratings
        
    except Exception as e:
        print(f"提取Metacritic评分数据时出错: {e}")
        return {
            "overall": {
                "metascore": "暂无",
                "critics_count": "暂无",
                "userscore": "暂无",
                "users_count": "暂无"
            }
        }

async def extract_letterboxd_rating(page):
    """从Letterboxd详情页提取评分数据"""
    try:
        # 获取评分元素
        rating_elem = await page.query_selector('.average-rating .display-rating')
        
        if rating_elem:
            # 获取评分
            rating = await rating_elem.inner_text()
            
            # 获取悬停提示中的评分人数
            tooltip = await rating_elem.get_attribute('data-original-title')
            if tooltip:
                # 使用正则表达式提取评分人数
                match = re.search(r'based on ([\d,]+)', tooltip)
                rating_count = match.group(1) if match else "暂无"
            else:
                rating_count = "暂无"
                
            print(f"Letterboxd评分数据: 评分={rating}, 评分人数={rating_count}")
            
            return {
                "rating": rating,
                "rating_count": rating_count
            }
        else:
            return {
                "rating": "暂无",
                "rating_count": "暂无"
            }
            
    except Exception as e:
        print(f"提取Letterboxd评分数据时出错: {e}")
        return {
            "rating": "暂无",
            "rating_count": "暂无"
        }

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

async def extract_rating_info(media_type, platform, tmdb_info, request=None):
    """从各平台详情页HTML中提取对应评分数据"""
    try:
        # 检查请求是否已被取消
        if request and await request.is_disconnected():
            print("请求已被取消,停止执行")
            return {"status": "cancelled"}
            
        # 搜索并获取结果
        search_results = await search_platform(platform, tmdb_info, request)
        
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
            
        if platform == "douban" and media_type == "tv":
            # 对于豆瓣剧集，保留所有匹配度较高的结果
            matched_results = []
            for result in search_results:
                # 检查请求状态
                if request and await request.is_disconnected():
                    print("请求已被取消,停止执行")
                    return {"status": "cancelled"}
                    
                score = calculate_match_degree(tmdb_info, result, platform="douban")
                if score >= 8:  # 设置一个合适的阈值
                    matched_results.append(result)
            
            if not matched_results:
                print(f"在豆瓣未找到匹配的剧集结果")
                return create_empty_rating_data(platform, media_type, RATING_STATUS["NO_FOUND"])
            
            print(f"找到 {len(matched_results)} 个匹配的剧集结果")
            
            # 获取所有匹配结果的评分
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(headless=True)
                    context = await browser.new_context()
                    page = await context.new_page()
                    
                    # 检查请求状态
                    if request and await request.is_disconnected():
                        print("请求已被取消,停止执行")
                        return {"status": "cancelled"}
                    
                    rating_data = await extract_douban_rating(page, media_type, matched_results)
                    print(f"豆瓣评分数据: {rating_data}")  # 保留调试输出
                    if rating_data:
                        rating_data["status"] = RATING_STATUS["SUCCESSFUL"]
                    else:
                        rating_data = create_empty_rating_data(platform, media_type, RATING_STATUS["NO_RATING"])
                    
                    return rating_data
                    
            except Exception as e:
                print(f"获取豆瓣评分数据时出错: {e}")
                return create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])
        else:   
            # 计算最佳匹配
            best_match = None
            highest_score = 0
            for result in search_results:
                # 检查请求状态
                if request and await request.is_disconnected():
                    print("请求已被取消,停止执行")
                    return {"status": "cancelled"}
                    
                score = calculate_match_degree(tmdb_info, result)
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
                    browser = await p.chromium.launch(
                        headless=True,
                        args=[
                            '--disable-dev-shm-usage',
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-gpu',
                            '--disable-web-security'
                        ]
                    )
                    context = await browser.new_context(
                        viewport={'width': 1920, 'height': 1080},
                        user_agent=random.choice(USER_AGENTS)
                    )
                    page = await context.new_page()
                    page.set_default_timeout(30000)
                
                    # 检查请求状态
                    if request and await request.is_disconnected():
                        print("请求已被取消,停止执行")
                        return {"status": "cancelled"}
                
                    # 访问详情页并等待加载
                    await page.goto(detail_url, wait_until='domcontentloaded')
                    await asyncio.sleep(2)
                
                    try:
                        if platform == "douban":
                            rating_data = await extract_douban_rating(page, media_type, tmdb_info.get('seasons', []))
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
                            # 添加成功状态
                            if platform in ["douban", "imdb", "letterboxd"]:
                                rating_data["status"] = RATING_STATUS["SUCCESSFUL"]
                            elif platform in ["rottentomatoes", "metacritic"]:
                                rating_data["status"] = RATING_STATUS["SUCCESSFUL"]
                                if "series" in rating_data:
                                    rating_data["series"]["status"] = RATING_STATUS["SUCCESSFUL"]
                                if "seasons" in rating_data:
                                    for season in rating_data["seasons"]:
                                        season["status"] = RATING_STATUS["SUCCESSFUL"]
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
        all_series_no_rating = all(series_data.get(key) == "暂无" for key in series_fields)
        
        # 检查每季数据是否都是"暂无"
        all_seasons_no_rating = all(
            all(season.get(key) == "暂无" for key in ["tomatometer", "audience_score", "critics_avg", "audience_avg", "critics_count", "audience_count"])
            for season in seasons_data
        )
        
        if all_series_no_rating and all_seasons_no_rating:
            return RATING_STATUS["NO_RATING"]
            
        # 检查整部剧集数据
        if not all(series_data.get(key) not in [None, "暂无"] for key in series_fields):
            return RATING_STATUS["FETCH_FAILED"]
            
        # 检查每季数据
        for season in seasons_data:
            season_fields = ["tomatometer", "audience_score", "critics_avg", "audience_avg", "critics_count", "audience_count"]
            if not all(season.get(key) not in [None, "暂无"] for key in season_fields):
                return RATING_STATUS["FETCH_FAILED"]
        return RATING_STATUS["SUCCESSFUL"]
        
    elif platform == "metacritic":
        overall_data = platform_data.get("overall", {})
        seasons_data = platform_data.get("seasons", [])
        
        # 检查整体数据是否都是"暂无"
        overall_fields = ["metascore", "critics_count", "userscore", "users_count"]
        all_overall_no_rating = all(overall_data.get(key) == "暂无" for key in overall_fields)
        
        # 检查每季数据是否都是"暂无"
        all_seasons_no_rating = all(
            all(season.get(key) == "暂无" for key in ["metascore", "critics_count", "userscore", "users_count"])
            for season in seasons_data
        )
        
        if all_overall_no_rating and all_seasons_no_rating:
            return RATING_STATUS["NO_RATING"]
            
        # 检查整体数据
        if not all(overall_data.get(key) not in [None, "暂无"] for key in overall_fields):
            return RATING_STATUS["FETCH_FAILED"]
            
        # 检查每季数据
        for season in seasons_data:
            season_fields = ["metascore", "critics_count", "userscore", "users_count"]
            if not all(season.get(key) not in [None, "暂无"] for key in season_fields):
                return RATING_STATUS["FETCH_FAILED"]
        return RATING_STATUS["SUCCESSFUL"]
    
    elif platform == "letterboxd":
        if platform_data.get("rating") == "暂无" and platform_data.get("rating_count") == "暂无":
            return RATING_STATUS["NO_RATING"]
        return RATING_STATUS["SUCCESSFUL"] if (platform_data.get("rating") not in [None, "暂无"] and 
                                            platform_data.get("rating_count") not in [None, "暂无"]) else RATING_STATUS["FETCH_FAILED"]
    
    return RATING_STATUS["FETCH_FAILED"]

def create_error_rating_data(platform, media_type="movie"):
    """为出错的平台创建数据结构
    
    Args:
        platform: 平台名称
        media_type: 媒体类型，'movie' 或 'tv'
    """
    if platform == "douban":
        if media_type == "tv":
            return {
                "seasons": [],  # 剧集需要包含seasons字段
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
                "seasons": [],  # 剧集需要包含seasons字段
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
                "seasons": [],  # 剧集需要包含seasons字段
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
    
    # 豆瓣
    if "douban" in all_ratings and all_ratings["douban"]:  # 确保豆瓣数据存在且非空
        print("豆瓣：")
        douban_data = all_ratings["douban"]
        
        if media_type == "movie":
            print(f"评分：{douban_data.get('rating', '暂无')}")
            print(f"评分人数：{douban_data.get('rating_people', '暂无')}\n")
            if all_ratings["douban"].get("status") == "Fail":
               print("处理时出错\n")
        else:
            seasons = douban_data.get("seasons", [])
            if seasons:  # 只要有季数据就显示
                for season in sorted(seasons, key=lambda x: x["season_number"]):
                    print(f"第{season['season_number']}季：")
                    print(f"评分：{season.get('rating', '暂无')}")
                    print(f"评分人数：{season.get('rating_people', '暂无')}")
                print()
                if all_ratings["douban"].get("status") == "Fail":
                   print("处理时出错\n")
            else:
                print("暂无评分信息\n")
    else:
        print("豆瓣：\n暂无评分信息\n")
    
    # IMDb
    if "imdb" in all_ratings:
        print("IMDb：")
        print(f"评分：{all_ratings['imdb'].get('rating', '暂无')}")
        print(f"评分人数：{all_ratings['imdb'].get('rating_people', '暂无')}\n")
        if all_ratings["imdb"].get("status") == "Fail":
            print("处理时出错\n")
    
    # Letterboxd
    if "letterboxd" in all_ratings:
        print("Letterboxd：")
        print(f"评分：{all_ratings['letterboxd'].get('rating', '暂无')}")
        print(f"评分人数：{all_ratings['letterboxd'].get('rating_count', '暂无')}\n")
        if all_ratings["letterboxd"].get("status") == "Fail":
            print("处理时出错\n")
    
    # Rotten Tomatoes
    if "rottentomatoes" in all_ratings:
        print("Rotten Tomatoes：")
        
        if media_type == "tv":
            rt_data = all_ratings.get('rottentomatoes', {}).get('series', {})
            print(f"整部剧集专业评分：{rt_data.get('tomatometer', '暂无')}")
            print(f"整部剧集观众评分：{rt_data.get('audience_score', '暂无')}")
            print(f"整部剧集专业平均评分：{rt_data.get('critics_avg', '暂无')}")
            print(f"整部剧集观众平均评分：{rt_data.get('audience_avg', '暂无')}")
            print(f"整部剧集专业评分人数：{rt_data.get('critics_count', '暂无')}")
            print(f"整部剧集观众评分人数：{rt_data.get('audience_count', '暂无')}")
            if all_ratings["rottentomatoes"].get("status") == "Fail":
                print("处理时出错\n")
            
            # 各季评分
            for season in all_ratings['rottentomatoes'].get('seasons', []):
                print(f"\n第{season['season_number']}季专业评分：{season.get('tomatometer', '暂无')}")
                print(f"第{season['season_number']}季观众评分：{season.get('audience_score', '暂无')}")
                print(f"第{season['season_number']}季专业平均评分：{season.get('critics_avg', '暂无')}")
                print(f"第{season['season_number']}季观众平均评分：{season.get('audience_avg', '暂无')}")
                print(f"第{season['season_number']}季专业评分人数：{season.get('critics_count', '暂无')}")
                print(f"第{season['season_number']}季观众评分人数：{season.get('audience_count', '暂无')}")
                if all_ratings["rottentomatoes"].get("status") == "Fail":
                    print("处理时出错\n")
        else:
            # 电影评分输出
                overall_data = all_ratings['rottentomatoes'].get('series', {})
                print(f"专业评分：{overall_data.get('tomatometer', '暂无')}")
                print(f"观众评分：{overall_data.get('audience_score', '暂无')}")
                print(f"专业平均评分：{overall_data.get('critics_avg', '暂无')}")
                print(f"观众平均评分：{overall_data.get('audience_avg', '暂无')}")
                print(f"专业评分人数：{overall_data.get('critics_count', '暂无')}")
                print(f"观众评分人数：{overall_data.get('audience_count', '暂无')}")
                if all_ratings["rottentomatoes"].get("status") == "Fail":
                    print("处理时出错\n")
        print()
    
    # Metacritic
    if "metacritic" in all_ratings:
        print("Metacritic：")
        mc_data = all_ratings['metacritic']
        
        # 整部剧集评分
        if media_type == "tv":
            overall = mc_data.get('overall', {})
            print("整部剧集专业评分：" + overall.get('metascore', '暂无'))
            print("整部剧集观众评分：" + overall.get('critics_count', '暂无'))
            print("整部剧集专业评分人数：" + overall.get('userscore', '暂无'))
            print("整部剧集观众评分人数：" + overall.get('users_count', '暂无'))
            if all_ratings["metacritic"].get("status") == "Fail":
                print("处理时出错\n")
            
            # 各季评分
            for season in mc_data.get('seasons', []):
                print(f"\n第{season['season_number']}季专业评分：{season.get('metascore', '暂无')}")
                print(f"第{season['season_number']}季观众评分：{season.get('userscore', '暂无')}")
                print(f"第{season['season_number']}季专业评分人数：{season.get('critics_count', '暂无')}")
                print(f"第{season['season_number']}季观众评分人数：{season.get('users_count', '暂无')}")
                if all_ratings["metacritic"].get("status") == "Fail":
                    print("处理时出错\n")
        else:
                mc_data = all_ratings['metacritic'].get('overall', {})
                print(f"专业评分：{mc_data.get('metascore', '暂无')}")
                print(f"专业评分人数：{mc_data.get('critics_count', '暂无')}")
                print(f"观众评分：{mc_data.get('userscore', '暂无')}")
                print(f"观众评分人数：{mc_data.get('users_count', '暂无')}\n")
                if all_ratings["metacritic"].get("status") == "Fail":
                   print("处理时出错\n")
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
    
    # 打印格式化的 JSON 数据
    print("\n=== JSON 数据 ===")
    print(json.dumps(formatted_data, indent=2, ensure_ascii=False))
    
    return formatted_data

async def main():
    tmdb_id = input("请输入TMDB ID:")
    tmdb_info = get_tmdb_info(tmdb_id)
    if tmdb_info is None:
        print("获取TMDB信息失败，无法继续执行后续流程")
        return
    
    media_type = tmdb_info["type"]
    platforms = ["douban", "imdb", "letterboxd", "rottentomatoes", "metacritic"]
    
    print(f"\n开始并发获取各平台评分信息...")
    
    # 创建所有平台的评分获取任务
    tasks = [
        extract_rating_info(media_type, platform, tmdb_info)
        for platform in platforms
    ]
    
    # 并发执行所有任务
    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 处理结果
        all_ratings = {}
        for platform, result in zip(platforms, results):
            if isinstance(result, Exception):
                print(f"处理 {platform} 平台时出错: {result}")
                all_ratings[platform] = create_empty_rating_data(platform, media_type, RATING_STATUS["FETCH_FAILED"])
                continue
                
            if result:  # 确保结果不为None
                all_ratings[platform] = result
                print(f"{platform} 平台评分信息获取完成")
    
        # 只有在all_ratings不为空时才调用format_rating_output
        if all_ratings:
            format_rating_output(all_ratings, media_type)
        else:
            print("\n=== 评分信息汇总 ===\n未能获取到任何平台的评分信息")
        
        return all_ratings
        
    except Exception as e:
        print(f"并发获取评分信息时出错: {e}")
        return {}

if __name__ == "__main__":
    asyncio.run(main())