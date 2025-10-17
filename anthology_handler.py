# ==========================================
# 选集剧处理模块 - 通用解决方案
# ==========================================
import re
import aiohttp
import logging
from typing import Optional, Dict, List, Any
from fuzzywuzzy import fuzz

logger = logging.getLogger(__name__)

# 选集剧识别的标题模式（正则表达式）
ANTHOLOGY_TITLE_PATTERNS = [
    r'^(.+?):\s*(?:The\s+)?(.+?)\s+Story',  # "Monster: The Jeffrey Dahmer Story"
    r'^(.+?):\s*Season\s+\d+',               # "American Horror Story: Season 1"
    r'^(.+?)\s*[-–]\s*(.+?)$',               # "Dahmer - Monster: ..."
    r'^(.+?):\s*(.+?)$',                     # 通用冒号分隔模式
]

class AnthologyHandler:
    """选集剧处理器"""
    
    def __init__(self):
        self.tmdb_api_key = "4f681fa7b5ab7346a4e184bbf2d41715"
        self.trakt_api_key = "859d1ad30074136a934c47ba2083cda83620b17b0db8f2d0ec554922116c60a8"
    
    def is_anthology_series(self, tmdb_info: Dict[str, Any]) -> bool:
        """
        判断是否可能为选集剧
        注意：这是一个启发式判断，不一定100%准确
        主要用于决定是否需要使用多策略搜索
        """
        if tmdb_info.get("type") != "tv":
            return False
        
        title = tmdb_info.get("title", "")
        original_title = tmdb_info.get("original_title", "")
        
        # 1. 检查标题模式
        for pattern in ANTHOLOGY_TITLE_PATTERNS:
            if re.search(pattern, title, re.IGNORECASE):
                logger.info(f"通过标题模式识别为可能的选集剧: {title}")
                return True
            if original_title and re.search(pattern, original_title, re.IGNORECASE):
                logger.info(f"通过原标题模式识别为可能的选集剧: {original_title}")
                return True
        
        # 2. 检查是否为单季剧集（可能是选集剧的一部分）
        number_of_seasons = tmdb_info.get("number_of_seasons", 0)
        if number_of_seasons == 1:
            # 单季剧集中包含特定关键词，可能是选集剧
            keywords = ["story", "tale", "chapter", "anthology"]
            title_lower = title.lower()
            if any(keyword in title_lower for keyword in keywords):
                logger.info(f"单季剧集包含选集剧关键词: {title}")
                return True
        
        return False
    
    def extract_main_series_info(self, tmdb_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        动态提取选集剧的主系列信息
        通过分析标题模式来提取，不依赖硬编码列表
        """
        title = tmdb_info.get("title", "")
        original_title = tmdb_info.get("original_title", "")
        year = tmdb_info.get("year", "")
        
        # 尝试各种模式提取主系列标题
        for pattern in ANTHOLOGY_TITLE_PATTERNS:
            match = re.match(pattern, title, re.IGNORECASE)
            if match:
                main_title = match.group(1).strip()
                logger.info(f"从标题提取主系列: {main_title}")
                return {
                    "main_title": main_title,
                    "first_air_year": year,
                    "detected": True,
                    "source": "title_pattern"
                }
            
            # 也尝试原标题
            if original_title:
                match = re.match(pattern, original_title, re.IGNORECASE)
                if match:
                    main_title = match.group(1).strip()
                    logger.info(f"从原标题提取主系列: {main_title}")
                    return {
                        "main_title": main_title,
                        "first_air_year": year,
                        "detected": True,
                        "source": "original_title_pattern"
                    }
        
        # 如果无法提取，返回None（将使用原标题搜索）
        return None
    
    def extract_subtitle_from_title(self, title: str) -> Optional[str]:
        """
        从标题中提取完整的副标题部分
        例如: "Monster: The Ed Gein Story" -> "The Ed Gein Story"
        
        特别注意：
        - 要提取完整的副标题，不是部分词语
        - "Monster: The Ed Gein Story" -> "The Ed Gein Story" (不是"Ed Gein")
        """
        # 最简单可靠的方法：按冒号分割
        if ': ' in title:
            parts = title.split(': ', 1)  # 只分割第一个冒号
            if len(parts) == 2:
                subtitle = parts[1].strip()
                logger.info(f"提取副标题: '{title}' -> '{subtitle}'")
                return subtitle
        
        # 回退：使用正则模式
        for pattern in ANTHOLOGY_TITLE_PATTERNS:
            match = re.match(pattern, title, re.IGNORECASE)
            if match and len(match.groups()) >= 2:
                subtitle = match.group(2).strip()
                logger.info(f"通过模式提取副标题: '{title}' -> '{subtitle}'")
                return subtitle
        
        return None
    
    async def get_imdb_id_from_multiple_sources(
        self, 
        tmdb_info: Dict[str, Any], 
        series_info: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        从多个来源获取IMDB ID
        尝试顺序：TMDB -> TMDB外部ID API -> 缓存 -> 搜索
        """
        
        # 1. 首先检查TMDB返回的IMDB ID
        if tmdb_info.get("imdb_id"):
            logger.info(f"✓ 从TMDB获取到IMDB ID: {tmdb_info['imdb_id']}")
            return tmdb_info["imdb_id"]
        
        # 2. 尝试通过TMDB外部ID API获取（这是最可靠的方法）
        try:
            tmdb_id = tmdb_info.get("tmdb_id")
            media_type = tmdb_info.get("type", "tv")
            
            if tmdb_id:
                imdb_id = await self._get_imdb_from_tmdb_external_ids(tmdb_id, media_type)
                if imdb_id:
                    logger.info(f"✓ 从TMDB外部ID API获取到IMDB ID: {imdb_id}")
                    return imdb_id
        except Exception as e:
            logger.error(f"✗ 从TMDB外部ID API获取IMDB ID失败: {e}")
        
        # 3. 检查缓存/已知选集剧列表
        # 注意：对于选集剧，这里的IMDB ID是整个系列的，不是单季的
        # 我们不应该直接返回系列ID，而是让搜索流程来找到正确的条目
        # 跳过这一步，继续搜索
        # if series_info:
        #     main_title = series_info.get("main_title")
        #     if main_title and main_title in ANTHOLOGY_SERIES_CACHE:
        #         cached_imdb = ANTHOLOGY_SERIES_CACHE[main_title].get("imdb_id")
        #         # 这是系列ID，不返回，让搜索来处理
        
        # 4. 尝试通过标题搜索（兜底方案，不一定准确）
        # 注意：这个方法可能返回不准确的结果，仅作为最后手段
        try:
            title = tmdb_info.get("title") or tmdb_info.get("original_title")
            year = tmdb_info.get("year")
            media_type = tmdb_info.get("type", "tv")
            
            if title:
                imdb_id = await self._search_imdb_id(title, year, media_type)
                if imdb_id:
                    logger.info(f"⚠ 通过搜索获取到IMDB ID（可能不准确）: {imdb_id}")
                    return imdb_id
        except Exception as e:
            logger.error(f"✗ 通过搜索获取IMDB ID失败: {e}")
        
        logger.warning("✗ 无法从任何来源获取IMDB ID")
        return None
    
    async def _get_imdb_from_tmdb_external_ids(self, tmdb_id: int, media_type: str) -> Optional[str]:
        """从TMDB外部ID API获取IMDB ID"""
        try:
            url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}/external_ids"
            params = {"api_key": self.tmdb_api_key}
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        imdb_id = data.get("imdb_id")
                        if imdb_id:
                            return imdb_id
        except Exception as e:
            logger.error(f"从TMDB外部ID API获取IMDB ID失败: {e}")
        
        return None
    
    async def _search_imdb_id(self, title: str, year: Optional[str], media_type: str) -> Optional[str]:
        """
        通过标题和年份搜索IMDB ID
        使用IMDB的非官方API
        """
        try:
            from urllib.parse import quote
            import json
            
            # 使用IMDB的搜索API
            search_url = f"https://v3.sg.media-imdb.com/suggestion/x/{quote(title)}.json"
            
            async with aiohttp.ClientSession() as session:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
                async with session.get(search_url, headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        suggestions = data.get("d", [])
                        
                        # 查找最佳匹配
                        for item in suggestions:
                            item_title = item.get("l", "")
                            item_year = item.get("y")
                            item_id = item.get("id", "")
                            item_type = item.get("q", "")
                            
                            # 确保是正确的媒体类型
                            if media_type == "tv" and item_type not in ["TV series", "TV mini-series"]:
                                continue
                            elif media_type == "movie" and item_type != "feature":
                                continue
                            
                            # 标题匹配
                            if fuzz.ratio(title.lower(), item_title.lower()) > 80:
                                # 年份匹配（如果提供）
                                if year:
                                    if str(item_year) == str(year):
                                        return item_id
                                else:
                                    return item_id
        
        except Exception as e:
            logger.error(f"通过IMDB API搜索失败: {e}")
        
        return None
    
    async def search_trakt(
        self, 
        tmdb_info: Dict[str, Any],
        series_info: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        在Trakt中搜索并获取评分
        不依赖IMDB ID，使用标题搜索
        """
        try:
            title = tmdb_info.get("title") or tmdb_info.get("original_title")
            year = tmdb_info.get("year")
            media_type = tmdb_info.get("type", "tv")
            
            # 构建搜索参数
            search_type = "show" if media_type == "tv" else "movie"
            
            # 1. 首先尝试使用TMDB ID搜索（最准确）
            tmdb_id = tmdb_info.get("tmdb_id")
            if tmdb_id:
                trakt_data = await self._search_trakt_by_tmdb_id(tmdb_id, search_type, tmdb_info, series_info)
                if trakt_data:
                    logger.info(f"通过TMDB ID在Trakt找到匹配: {trakt_data.get('title')}")
                    return trakt_data
            
            # 2. 如果是选集剧，尝试使用主系列标题搜索
            if series_info:
                main_title = series_info.get("main_title")
                if main_title:
                    trakt_data = await self._search_trakt_by_title(main_title, year, search_type, tmdb_info, series_info)
                    if trakt_data:
                        logger.info(f"通过主系列标题在Trakt找到匹配: {trakt_data.get('title')}")
                        return trakt_data
            
            # 3. 使用原始标题搜索
            trakt_data = await self._search_trakt_by_title(title, year, search_type, tmdb_info, series_info)
            if trakt_data:
                logger.info(f"通过标题在Trakt找到匹配: {trakt_data.get('title')}")
                return trakt_data
            
            logger.warning(f"在Trakt中未找到匹配: {title}")
            return None
            
        except Exception as e:
            logger.error(f"Trakt搜索失败: {e}")
            return None
    
    async def _search_trakt_by_tmdb_id(self, tmdb_id: int, media_type: str, tmdb_info: Dict[str, Any] = None, series_info: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """通过TMDB ID在Trakt搜索"""
        try:
            url = f"https://api.trakt.tv/search/tmdb/{tmdb_id}"
            params = {"type": media_type}
            headers = {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": self.trakt_api_key
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, headers=headers) as response:
                    if response.status == 200:
                        results = await response.json()
                        if results:
                            # 获取第一个结果
                            item = results[0]
                            if media_type == "show":
                                show_data = item.get("show", {})
                                return await self._get_trakt_rating(show_data.get("ids", {}).get("slug"), media_type, tmdb_info, series_info)
                            else:
                                movie_data = item.get("movie", {})
                                return await self._get_trakt_rating(movie_data.get("ids", {}).get("slug"), media_type, tmdb_info, series_info)
        except Exception as e:
            logger.error(f"通过TMDB ID搜索Trakt失败: {e}")
        
        return None
    
    async def _search_trakt_by_title(self, title: str, year: Optional[str], media_type: str, tmdb_info: Dict[str, Any] = None, series_info: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """通过标题在Trakt搜索"""
        try:
            from urllib.parse import quote
            
            url = f"https://api.trakt.tv/search/{media_type}"
            params = {"query": title}
            if year:
                params["years"] = year
            
            headers = {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": self.trakt_api_key
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, headers=headers) as response:
                    if response.status == 200:
                        results = await response.json()
                        if results:
                            # 找到最佳匹配
                            best_match = None
                            best_score = 0
                            
                            for item in results[:5]:  # 只检查前5个结果
                                if media_type == "show":
                                    data = item.get("show", {})
                                else:
                                    data = item.get("movie", {})
                                
                                result_title = data.get("title", "")
                                result_year = data.get("year")
                                
                                # 计算匹配度
                                title_score = fuzz.ratio(title.lower(), result_title.lower())
                                
                                # 年份匹配加分
                                if year and str(year) == str(result_year):
                                    title_score += 20
                                
                                if title_score > best_score:
                                    best_score = title_score
                                    best_match = data
                            
                            if best_match and best_score >= 60:
                                # 获取详细评分信息
                                slug = best_match.get("ids", {}).get("slug")
                                return await self._get_trakt_rating(slug, media_type, tmdb_info, series_info)
        except Exception as e:
            logger.error(f"通过标题搜索Trakt失败: {e}")
        
        return None
    
    async def _get_trakt_rating(self, slug: str, media_type: str, tmdb_info: Dict[str, Any] = None, series_info: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """
        获取Trakt的详细评分信息
        
        API调用：
        1. 整体评分：https://api.trakt.tv/{media_type}s/{slug}/ratings
        2. 分季评分：https://api.trakt.tv/shows/{slug}/seasons/{season_number}/ratings
        
        返回数据结构：
        - rating: 整体评分（所有类型都返回）
        - votes: 整体投票数
        - distribution: 整体评分分布
        - seasons: 分季评分数组
        
        分季评分获取逻辑：
        - 选集剧：整体评分 + 第1季评分
        - 单季剧：整体评分 + 第1季评分
        - 多季剧：整体评分 + 所有季的评分
        """
        try:
            headers = {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": self.trakt_api_key
            }
            
            async with aiohttp.ClientSession() as session:
                # 1. 获取整体评分
                url = f"https://api.trakt.tv/{media_type}s/{slug}/ratings"
                async with session.get(url, headers=headers) as response:
                    if response.status != 200:
                        logger.error(f"获取Trakt整体评分失败: HTTP {response.status}")
                        return None
                    
                    overall_data = await response.json()
                    result = {
                        "rating": overall_data.get("rating", "暂无"),
                        "votes": overall_data.get("votes", "暂无"),
                        "distribution": overall_data.get("distribution", {}),
                        "slug": slug,
                        "url": f"https://trakt.tv/{media_type}s/{slug}"
                    }
                    
                    # 2. 如果是剧集，获取分季评分
                    if media_type == "show":
                        is_anthology = series_info is not None
                        tmdb_seasons = tmdb_info.get("number_of_seasons", 0) if tmdb_info else 0
                        
                        if is_anthology or tmdb_seasons == 1:
                            # 选集剧 或 单季剧：只获取第1季评分
                            show_type = "选集剧" if is_anthology else "单季剧"
                            logger.info(f"[{show_type}] 获取整体评分 + 第1季评分")
                            season_rating = await self._get_single_season_rating(slug, 1, session, headers)
                            if season_rating:
                                result["seasons"] = [season_rating]
                                logger.info(f"[{show_type}] 成功获取第1季评分: {season_rating['rating']}/10")
                            else:
                                # 兜底：获取失败时，将整体评分作为第1季
                                logger.warning(f"[{show_type}] 未能获取第1季评分，使用整体评分作为兜底")
                                result["seasons"] = [{
                                    "season_number": 1,
                                    "rating": result["rating"],
                                    "votes": result["votes"],
                                    "distribution": result["distribution"]
                                }]
                        
                        else:
                            # 多季剧：获取所有季的评分
                            logger.info(f"[多季剧] 获取整体评分 + 所有季评分")
                            seasons_ratings = await self._get_trakt_seasons_ratings(slug, session, headers)
                            if seasons_ratings:
                                result["seasons"] = seasons_ratings
                                logger.info(f"[多季剧] 成功获取 {len(seasons_ratings)} 季的评分")
                            else:
                                logger.warning(f"[多季剧] 未能获取分季评分，尝试只获取第1季")
                                # 兜底：尝试至少获取第1季
                                season_rating = await self._get_single_season_rating(slug, 1, session, headers)
                                if season_rating:
                                    result["seasons"] = [season_rating]
                                    logger.info(f"[多季剧] 兜底成功：获取到第1季评分")
                                else:
                                    logger.warning(f"[多季剧] 完全失败，无法获取任何分季评分")
                    
                    return result
                    
        except Exception as e:
            logger.error(f"获取Trakt评分失败: {e}")
        
        return None
    
    async def _get_single_season_rating(
        self, 
        slug: str, 
        season_number: int,
        session: aiohttp.ClientSession,
        headers: Dict[str, str]
    ) -> Optional[Dict[str, Any]]:
        """获取单个季的评分"""
        try:
            season_rating_url = f"https://api.trakt.tv/shows/{slug}/seasons/{season_number}/ratings"
            logger.info(f"请求第 {season_number} 季评分: {season_rating_url}")
            
            async with session.get(season_rating_url, headers=headers) as response:
                logger.info(f"响应状态码: {response.status}")
                
                if response.status == 200:
                    rating_data = await response.json()
                    logger.info(f"成功获取第 {season_number} 季评分: {rating_data.get('rating')}/10 ({rating_data.get('votes')} 票)")
                    return {
                        "season_number": season_number,
                        "rating": rating_data.get("rating", 0),
                        "votes": rating_data.get("votes", 0),
                        "distribution": rating_data.get("distribution", {})
                    }
                else:
                    logger.warning(f"获取第 {season_number} 季评分失败: HTTP {response.status}")
                    response_text = await response.text()
                    logger.debug(f"响应内容: {response_text[:200]}")
                    
        except Exception as e:
            logger.error(f"获取第 {season_number} 季评分异常: {e}")
            import traceback
            logger.debug(traceback.format_exc())
        
        return None
    
    async def _get_trakt_seasons_ratings(self, slug: str, session: aiohttp.ClientSession, headers: Dict[str, str]) -> Optional[List[Dict[str, Any]]]:
        """获取剧集每一季的评分"""
        try:
            # 首先获取剧集的所有季信息
            seasons_url = f"https://api.trakt.tv/shows/{slug}/seasons?extended=episodes"
            async with session.get(seasons_url, headers=headers) as response:
                if response.status != 200:
                    logger.error(f"获取剧集季信息失败: HTTP {response.status}")
                    return None
                
                seasons_info = await response.json()
                
                # 过滤掉特别篇（season 0）
                regular_seasons = [s for s in seasons_info if s.get("number", 0) > 0]
                
                if not regular_seasons:
                    logger.warning(f"剧集 {slug} 没有常规季")
                    return None
                
                logger.info(f"找到 {len(regular_seasons)} 个常规季")
                
                # 为每一季获取评分
                seasons_ratings = []
                for season in regular_seasons:
                    season_number = season.get("number")
                    if season_number is None or season_number == 0:
                        continue
                    
                    # 获取该季的评分
                    season_rating_url = f"https://api.trakt.tv/shows/{slug}/seasons/{season_number}/ratings"
                    try:
                        async with session.get(season_rating_url, headers=headers) as rating_response:
                            if rating_response.status == 200:
                                rating_data = await rating_response.json()
                                seasons_ratings.append({
                                    "season_number": season_number,
                                    "rating": rating_data.get("rating", 0),
                                    "votes": rating_data.get("votes", 0),
                                    "distribution": rating_data.get("distribution", {})
                                })
                                logger.info(f"  第 {season_number} 季: {rating_data.get('rating', 0)}/10 ({rating_data.get('votes', 0)} 票)")
                            else:
                                logger.warning(f"  第 {season_number} 季评分获取失败: HTTP {rating_response.status}")
                    except Exception as e:
                        logger.error(f"  获取第 {season_number} 季评分失败: {e}")
                        continue
                
                return seasons_ratings if seasons_ratings else None
                
        except Exception as e:
            logger.error(f"获取分季评分失败: {e}")
            return None
    
    def generate_search_variants(self, tmdb_info: Dict[str, Any], series_info: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
        """
        生成用于搜索的标题变体 - 多策略方案
        
        对于每个剧集，我们会生成多种可能的搜索变体：
        1. 完整标题（适用于豆瓣、Letterboxd等将选集剧作为独立剧集的平台）
        2. 主系列标题（适用于IMDB、烂番茄、Metacritic等将选集剧作为整体的平台）
        3. 副标题（如果有）
        
        这样无论平台如何组织内容，我们都能找到匹配
        """
        variants = []
        
        title = tmdb_info.get("title", "")
        original_title = tmdb_info.get("original_title", "")
        year = tmdb_info.get("year", "")
        first_air_date = tmdb_info.get("first_air_date", "")
        
        # 策略1a: 使用副标题（如果有且是选集剧）
        # 烂番茄选集剧优先使用副标题！
        subtitle = self.extract_subtitle_from_title(title)
        if subtitle and series_info:
            variants.append({
                "title": subtitle,
                "year": year,
                "type": "subtitle_for_rt",
                "strategy": "subtitle_only",
                "priority": 1,  # 最高优先级！
                "for_rottentomatoes": True
            })
        
        # 策略1b: 使用完整标题
        # 适用于：豆瓣、TMDB、Letterboxd、Trakt（当作独立剧集）
        if title:
            variants.append({
                "title": title,
                "year": year,
                "type": "full_title",
                "strategy": "standalone",
                "priority": 2 if (subtitle and series_info) else 1  # 如果有副标题，降低优先级
            })
        
        if original_title and original_title != title:
            variants.append({
                "title": original_title,
                "year": year,
                "type": "full_original_title",
                "strategy": "standalone",
                "priority": 2 if (subtitle and series_info) else 1
            })
        
        # 策略2: 使用主系列标题（如果能提取）
        # 适用于：IMDB、烂番茄、Metacritic（当作选集剧整体）
        if series_info:
            main_title = series_info.get("main_title")
            if main_title:
                # 对于Monster这样的选集剧：
                # - Monster (2022) 是整个系列的首播年份
                # - 但我们查询的是2025年的季
                # - IMDB等平台会用首播年份标记整个系列
                
                # 主系列 + 系列首播年份（最重要！）
                # 从first_air_date提取（如果是单季剧，这是该季的播出日期）
                # 我们需要猜测整个选集剧的首播年份
                
                # === 完全动态的年份策略（不依赖缓存）===
                # 
                # 策略：不需要知道准确的首播年份！
                # 1. 先尝试不带年份的搜索（让平台返回所有相关结果）
                # 2. 然后通过副标题和其他信息筛选正确的
                
                # 提取副标题作为匹配提示
                subtitle_hint = self.extract_subtitle_from_title(tmdb_info.get("title", ""))
                
                # 变体1: 主系列标题（不带年份）- 最通用
                # 这会返回整个系列，然后我们通过副标题等筛选
                variants.append({
                    "title": main_title,
                    "year": "",  # 不指定年份！
                    "type": "main_series_no_year",
                    "strategy": "anthology_series",
                    "priority": 2,
                    "subtitle_hint": subtitle_hint,
                    "match_by_subtitle": True  # 标记需要通过副标题匹配
                })
                
                # 变体2: 主系列 + 当前季的年份（可能有用）
                if year:
                    variants.append({
                        "title": main_title,
                        "year": year,
                        "type": "main_series_with_year",
                        "strategy": "anthology_series",
                        "priority": 3,
                        "subtitle_hint": subtitle_hint
                    })
        else:
            # 即使没有series_info，也尝试提取主标题
            for pattern in ANTHOLOGY_TITLE_PATTERNS:
                match = re.match(pattern, title, re.IGNORECASE)
                if match:
                    main_title = match.group(1).strip()
                    variants.append({
                        "title": main_title,
                        "year": year,
                        "type": "extracted_main_title",
                        "strategy": "anthology_series",
                        "priority": 2
                    })
                    break
        
        # 策略4: 移除年份后缀的标题变体
        # 有些标题可能包含 "(2024)" 等年份后缀
        title_without_year = re.sub(r'\s*\(\d{4}\)\s*$', '', title)
        if title_without_year != title:
            variants.append({
                "title": title_without_year,
                "year": year,
                "type": "title_without_year",
                "strategy": "standalone",
                "priority": 1
            })
        
        # 移除重复项
        unique_variants = []
        seen = set()
        for variant in variants:
            key = f"{variant['title'].lower()}_{variant['year']}"
            if key not in seen:
                seen.add(key)
                unique_variants.append(variant)
        
        # 按优先级排序
        unique_variants.sort(key=lambda x: x['priority'])
        
        logger.info(f"生成了 {len(unique_variants)} 个搜索标题变体")
        for i, v in enumerate(unique_variants, 1):
            logger.info(f"  {i}. {v['title']} ({v['year']}) [策略:{v['strategy']}, 类型:{v['type']}]")
        
        return unique_variants


# 全局实例
anthology_handler = AnthologyHandler()

