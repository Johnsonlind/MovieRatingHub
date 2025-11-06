# ==========================================
# 榜单抓取器 - 多平台榜单数据抓取和TMDB匹配
# 功能: 抓取各平台榜单、匹配TMDB ID、定时自动更新、Telegram通知
# 支持平台: 豆瓣、IMDB、Letterboxd、烂番茄、Metacritic、TMDB、Trakt
# ==========================================

import asyncio
import re
import time
import logging
import os
import httpx
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timezone, timedelta
from playwright.async_api import Page
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, not_, func

from browser_pool import browser_pool
from models import ChartEntry, engine, SessionLocal

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 尝试导入可选依赖
try:
    import schedule
    SCHEDULE_AVAILABLE = True
except ImportError:
    SCHEDULE_AVAILABLE = False
    logger.warning("schedule库未安装，定时任务功能将不可用")

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    logger.warning("requests库未安装，TMDB API调用功能将不可用")


class ChartScraper:
    def __init__(self, db: Session):
        self.db = db
    
    @staticmethod
    def _safe_get_title(info: Dict, fallback_title: str = '') -> str:
        """安全获取标题：从 TMDB info 中获取标题，去除空格，确保不为空"""
        zh_title = (info.get('zh_title') or '').strip()
        tmdb_title = (info.get('title') or '').strip()
        tmdb_name = (info.get('name') or '').strip()
        return zh_title or tmdb_title or tmdb_name or fallback_title
        
        # 豆瓣榜单抓取
            
    async def scrape_douban_weekly_movie_chart(self) -> List[Dict]:
        """抓取豆瓣一周口碑榜（电影）"""
        async def scrape_with_browser(browser):
            page = await browser.new_page()
            try:
                await page.goto("https://movie.douban.com/", wait_until="domcontentloaded")
                await asyncio.sleep(3)
                
                # 等待页面完全加载
                await page.wait_for_load_state("networkidle")
                
                # 额外等待，确保所有内容都加载完成
                await asyncio.sleep(3)
                
                # 等待特定元素出现
                try:
                    await page.wait_for_selector('#billboard .billboard-bd table tr', timeout=10000)
                except:
                    pass
                
                # 查找一周口碑榜 - 考虑tbody标签
                chart_items = await page.query_selector_all('#billboard .billboard-bd table tbody tr')
                results = []
                
                if not chart_items:
                    # 如果没找到，尝试等待更长时间
                    await asyncio.sleep(2)
                    chart_items = await page.query_selector_all('#billboard .billboard-bd table tr')
                
                # 使用CSS选择器直接获取数据
                logger.info("使用CSS选择器获取豆瓣一周口碑榜数据...")
                logger.info(f"找到 {len(chart_items)} 个表格行")
                for i, item in enumerate(chart_items, 1):  # 不跳过任何行
                    try:
                        title_elem = await item.query_selector('.title a')
                        if title_elem:
                            title = await title_elem.inner_text()
                            url = await title_elem.get_attribute('href')
                            
                            # 提取豆瓣ID
                            douban_id = re.search(r'/subject/(\d+)/', url)
                            if douban_id and title.strip():
                                results.append({
                                    'rank': i,
                                    'title': title.strip(),
                                    'douban_id': douban_id.group(1),
                                    'url': url
                                })
                                logger.info(f"获取到第{i}项: {title.strip()} (ID: {douban_id.group(1)})")
                    except Exception as e:
                        logger.error(f"处理豆瓣电影榜单项时出错: {e}")
                        continue
                
                # 如果CSS选择器没有获取到数据，尝试JavaScript
                if not results:
                    # 使用找到的选择器解析数据
                    for i, item in enumerate(chart_items[1:], 1):  # 跳过表头
                        try:
                            title_elem = await item.query_selector('.title a')
                            if title_elem:
                                title = await title_elem.inner_text()
                                url = await title_elem.get_attribute('href')
                                
                                # 提取豆瓣ID
                                douban_id = re.search(r'/subject/(\d+)/', url)
                                if douban_id and title.strip():
                                    results.append({
                                        'rank': i,
                                        'title': title.strip(),
                                        'douban_id': douban_id.group(1),
                                        'url': url
                                    })
                        except Exception as e:
                            logger.error(f"处理豆瓣电影榜单项时出错: {e}")
                            continue
                
                logger.info(f"豆瓣一周口碑榜获取到 {len(results)} 个项目")
                return results
            finally:
                await page.close()
                
        return await browser_pool.execute_in_browser(scrape_with_browser)
    
    async def scrape_douban_weekly_global_tv_chart(self) -> List[Dict]:
        """抓取豆瓣一周全球剧集口碑榜 - 使用 requests 并统一返回字段"""
        try:
            import requests, urllib3, json
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

            api_url = (
                "https://m.douban.com/rexxar/api/v2/subject_collection/"
                "tv_global_best_weekly/items?start=0&count=10&updated_at=&items_only=1&type_tag=&ck=kpTM&for_mobile=1"
            )
            headers = {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) '
                              'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
                'Referer': 'https://m.douban.com/subject_collection/tv_global_best_weekly'
            }

            resp = requests.get(api_url, headers=headers, timeout=20, verify=False)
            if resp.status_code != 200:
                logger.error(f"豆瓣全球剧集榜 API 调用失败，状态码: {resp.status_code}")
                return []

            try:
                data = resp.json()
            except Exception:
                data = json.loads(resp.text)

            # 取实际列表
            if isinstance(data, dict) and 'subject_collection_items' in data:
                items = data['subject_collection_items']
            elif isinstance(data, list):
                items = data
            else:
                logger.error(f"豆瓣全球剧集榜 API 返回格式异常: {type(data)}")
                return []

            results: List[Dict] = []
            for item in items:
                douban_id = item.get('id') or ''
                if not douban_id:
                    uri = item.get('uri') or ''
                    # 兜底从 uri 提取
                    if '/subject/' in uri:
                        douban_id = uri.split('/subject/')[-1].split('/')[0]
                results.append({
                    'rank': item.get('rank', 0),
                    'title': item.get('title', ''),
                    'douban_id': str(douban_id),
                    'url': f"https://movie.douban.com/subject/{douban_id}/" if douban_id else ''
                })

            logger.info(f"豆瓣全球剧集榜获取到 {len(results)} 个项目")
            if results:
                logger.debug(f"示例: {results[0]}")
            return results
        except Exception as e:
            logger.error(f"抓取豆瓣全球剧集榜失败: {e}")
            return []

    async def get_douban_imdb_id(self, douban_id: str) -> Optional[str]:
        """从豆瓣详情页获取IMDb ID"""
        try:
            import requests
            import urllib3
            from bs4 import BeautifulSoup
            
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            
            url = f"https://movie.douban.com/subject/{douban_id}/"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            response = requests.get(url, headers=headers, verify=False)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # 查找IMDb链接
                imdb_links = soup.find_all('a', href=lambda x: x and 'imdb.com' in x)
                for link in imdb_links:
                    href = link.get('href', '')
                    if '/title/tt' in href:
                        # 提取IMDb ID (tt开头)
                        imdb_id = href.split('/title/')[-1].rstrip('/')
                        if imdb_id.startswith('tt'):
                            logger.info(f"从豆瓣详情页获取到IMDb ID: {imdb_id}")
                            return imdb_id
                
                # 如果没找到链接，尝试从文本中提取
                imdb_spans = soup.find_all('span', class_='pl')
                for span in imdb_spans:
                    if span.get_text().strip() == 'IMDb:':
                        # 1) 尝试紧邻文本兄弟节点（非标签）
                        sibling_text = getattr(span.next_sibling, 'strip', lambda: str(span.next_sibling))()
                        if sibling_text:
                            import re as _re
                            m = _re.search(r'(tt\d+)', sibling_text)
                            if m:
                                imdb_text = m.group(1)
                                logger.info(f"从豆瓣详情页文本兄弟节点获取到IMDb ID: {imdb_text}")
                                return imdb_text

                        # 2) 尝试下一个span兄弟节点
                        next_span = span.find_next_sibling('span')
                        if next_span:
                            imdb_text = next_span.get_text().strip()
                            if imdb_text.startswith('tt'):
                                logger.info(f"从豆瓣详情页相邻span中获取到IMDb ID: {imdb_text}")
                                return imdb_text

                        # 3) 兜底：在整页HTML中用正则提取
                        import re as _re2
                        m2 = _re2.search(r'<span class="pl">IMDb:</span>\s*([tT]{2}\d+)<br>', response.text)
                        if m2:
                            imdb_text = m2.group(1)
                            logger.info(f"从豆瓣详情页HTML中获取到IMDb ID: {imdb_text}")
                            return imdb_text
                
                logger.warning(f"豆瓣详情页 {url} 中未找到IMDb ID")
                return None
            else:
                logger.error(f"访问豆瓣详情页失败，状态码: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"获取豆瓣IMDb ID失败: {e}")
            return None
    
    async def scrape_douban_weekly_chinese_tv_chart(self) -> List[Dict]:
        """抓取豆瓣一周华语剧集口碑榜 - 使用 requests 并统一返回字段"""
        try:
            import requests, urllib3, json
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

            api_url = (
                "https://m.douban.com/rexxar/api/v2/subject_collection/"
                "tv_chinese_best_weekly/items?start=0&count=10&updated_at=&items_only=1&type_tag=&ck=kpTM&for_mobile=1"
            )
            headers = {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) '
                              'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
                'Referer': 'https://m.douban.com/subject_collection/tv_chinese_best_weekly'
            }

            resp = requests.get(api_url, headers=headers, timeout=20, verify=False)
            if resp.status_code != 200:
                logger.error(f"豆瓣华语剧集榜 API 调用失败，状态码: {resp.status_code}")
                return []

            try:
                data = resp.json()
            except Exception:
                data = json.loads(resp.text)

            if isinstance(data, dict) and 'subject_collection_items' in data:
                items = data['subject_collection_items']
            elif isinstance(data, list):
                items = data
            else:
                logger.error(f"豆瓣华语剧集榜 API 返回格式异常: {type(data)}")
                return []

            results: List[Dict] = []
            for item in items:
                douban_id = item.get('id') or ''
                if not douban_id:
                    uri = item.get('uri') or ''
                    if '/subject/' in uri:
                        douban_id = uri.split('/subject/')[-1].split('/')[0]
                results.append({
                    'rank': item.get('rank', 0),
                    'title': item.get('title', ''),
                    'douban_id': str(douban_id),
                    'url': f"https://movie.douban.com/subject/{douban_id}/" if douban_id else ''
                })

            logger.info(f"豆瓣华语剧集榜获取到 {len(results)} 个项目")
            if results:
                logger.debug(f"示例: {results[0]}")
            return results
        except Exception as e:
            logger.error(f"抓取豆瓣华语剧集榜失败: {e}")
            return []

        # IMDb榜单抓取
        
    async def scrape_imdb_top_10(self) -> List[Dict]:
        """抓取IMDB Top 10 this week - 使用GraphQL API"""
        try:
            logger.info("开始爬取IMDB Top 10榜单")
            
            import requests
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            
            # IMDB GraphQL API URL
            api_url = "https://api.graphql.imdb.com/"
            
            # 请求参数 - 使用用户提供的正确参数
            params = {
                "operationName": "BatchPage_HomeMain",
                "variables": '{"fanPicksFirst":30,"first":30,"locale":"en-US","placement":"home","topPicksFirst":30,"topTenFirst":10}',
                "extensions": '{"persistedQuery":{"sha256Hash":"c67332f9e9d91317c63c60dfd1ded1e9cd68c59ead2de57568451b13493812f6","version":1}}'
            }
            
            # 设置请求头
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'Referer': 'https://www.imdb.com/',
                'Origin': 'https://www.imdb.com'
            }
            
            # 使用requests发送请求
            response = requests.get(api_url, params=params, headers=headers, timeout=30, verify=False)
            logger.info(f"IMDb API响应状态: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()

                # 解析Top 10数据（优先 data.topMeterTitles，其次 batch.responseList[*].data.topMeterTitles）
                results = []
                top_edges = (data.get("data", {}).get("topMeterTitles", {}) or {}).get("edges", [])
                if not top_edges:
                    batch_list = data.get("data", {}).get("batch", {}).get("responseList", [])
                    for item in batch_list:
                        inner_data = item.get("data", {})
                        top_edges = inner_data.get("topMeterTitles", {}).get("edges", [])
                        for edge in top_edges:
                            node = edge.get("node", {})
                            imdb_id = node.get("id")
                            rank = (node.get("meterRanking", {}) or {}).get("currentRank")
                            title = ((node.get("titleText") or {}).get("text")) or ""
                            if imdb_id and isinstance(rank, int) and rank >= 1:
                                results.append({
                                    "rank": rank,
                                    "title": title,
                                    "imdb_id": imdb_id,
                                    "url": f"https://www.imdb.com/title/{imdb_id}/"
                                })
                else:
                    for edge in top_edges:
                        node = edge.get("node", {})
                        imdb_id = node.get("id")
                        rank = (node.get("meterRanking", {}) or {}).get("currentRank")
                        title = ((node.get("titleText") or {}).get("text")) or ""
                        if imdb_id and isinstance(rank, int) and rank >= 1:
                            results.append({
                                "rank": rank,
                                "title": title,
                                "imdb_id": imdb_id,
                                "url": f"https://www.imdb.com/title/{imdb_id}/"
                            })

                # 排序并只取前10
                results.sort(key=lambda x: x["rank"])
                results = results[:10]

                logger.info(f"IMDb Top 10 获取到 {len(results)} 条（GraphQL）")
                return results   
            else: 
                logger.error(f"IMDB API请求失败: {response.status_code}")
                error_text = response.text
                logger.error(f"错误响应: {error_text[:500]}")
                return []
                        
        except Exception as e:
            logger.error(f"爬取IMDB Top 10榜单失败: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []
            
        # Letterboxd榜单抓取
        
    async def scrape_letterboxd_popular(self) -> List[Dict]:
        """抓取Letterboxd Popular films this week"""
        async def scrape_with_browser(browser):
            page = await browser.new_page()
            try:
                await page.goto("https://letterboxd.com/films/", wait_until="domcontentloaded")
                await asyncio.sleep(2)
                
                # 查找Popular films this week
                popular_items = await page.query_selector_all('#popular-films .poster-list li')
                results = []
                
                for i, item in enumerate(popular_items[:10], 1):
                    try:
                        # 获取标题和链接
                        title_elem = await item.query_selector('[data-item-name]')
                        if title_elem:
                            title = await title_elem.get_attribute('data-item-name')
                            link = await title_elem.get_attribute('data-item-link')
                            
                            # 获取Letterboxd ID
                            film_id = await title_elem.get_attribute('data-film-id')
                            
                            if title and link and film_id:
                                results.append({
                                    'rank': i,
                                    'title': title,
                                    'letterboxd_id': film_id,
                                    'url': f"https://letterboxd.com{link}"
                                })
                    except Exception as e:
                        logger.error(f"处理Letterboxd榜单项时出错: {e}")
                        continue
                        
                return results
            finally:
                await page.close()
                
        return await browser_pool.execute_in_browser(scrape_with_browser)

        # 烂番茄榜单抓取
        

    async def _rt_extract_itemlist(self, url: str, item_type: str) -> List[Dict]:
        """使用浏览器读取 JSON-LD ItemList，并返回标准化的条目数组
        item_type: 'Movie' | 'TVSeries'
        返回: { position:int|None, name:str, year:int|None, url:str|None }
        """
        async def scrape(browser):
            page = await browser.new_page()
            try:
                # 设置更长的超时时间，特别是针对烂番茄网站
                page.set_default_timeout(120000)  # 2分钟超时
                
                # 使用更宽松的加载策略
                await page.goto(url, wait_until="domcontentloaded", timeout=120000)
                
                # 等待页面完全加载，但设置合理的超时时间
                try:
                    await page.wait_for_load_state("networkidle", timeout=60000)  # 1分钟网络空闲等待
                except Exception:
                    # 如果网络空闲等待超时，继续执行，可能数据已经加载完成
                    logger.warning("网络空闲等待超时，继续执行")
                
                # 额外等待一段时间确保动态内容加载完成
                await asyncio.sleep(3)
                
                handles = await page.query_selector_all('script[type="application/ld+json"]')
                for h in handles:
                    raw = await h.inner_text()
                    if not raw:
                        continue
                    data = None
                    try:
                        data = json.loads(raw)
                    except Exception:
                        m = re.search(r'\{\s*"@context"\s*:\s*"http://schema.org"[\s\S]*?\}', raw)
                        if m:
                            try:
                                data = json.loads(m.group(0))
                            except Exception:
                                data = None
                    if data is None:
                        continue
                    candidates = data if isinstance(data, list) else [data]
                    for obj in candidates:
                        if not isinstance(obj, dict):
                            continue
                        if obj.get('@type') == 'ItemList' and obj.get('itemListElement'):
                            inner = obj.get('itemListElement')
                            if isinstance(inner, dict) and inner.get('@type') == 'ItemList':
                                elements = inner.get('itemListElement') or []
                            else:
                                elements = inner or []
                            parsed = []
                            for it in elements:
                                node = it.get('item') if isinstance(it, dict) and 'item' in it else it
                                if not isinstance(node, dict) or node.get('@type') != item_type:
                                    continue
                                name = node.get('name') or ''
                                year = None
                                dc = node.get('dateCreated')
                                if isinstance(dc, str):
                                    y = dc[:4]
                                    if re.match(r'^\d{4}$', y):
                                        try:
                                            year = int(y)
                                        except Exception:
                                            year = None
                                pos = it.get('position') if isinstance(it, dict) else None
                                if pos is None:
                                    pos = node.get('position')
                                try:
                                    position = int(pos) if pos is not None else None
                                except Exception:
                                    position = None
                                parsed.append({'position': position, 'name': name, 'year': year, 'url': node.get('url')})
                            if parsed:
                                parsed.sort(key=lambda x: x.get('position') or 9999)
                                return parsed
                return []
            finally:
                await page.close()
        # 延迟导入以避免顶部循环依赖
        import json  # noqa
        return await browser_pool.execute_in_browser(scrape)

    async def update_rotten_movies(self) -> int:
        """烂番茄 Popular Streaming Movies：解析 JSON-LD，匹配 TMDB 并入库，返回写入条数"""
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='烂番茄',
            ChartEntry.chart_name=='Popular Streaming Movies'
        ).delete()
        logger.info(f"烂番茄电影榜单: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        url = 'https://www.rottentomatoes.com/browse/movies_at_home/sort:popular'
        
        # 添加重试机制
        max_retries = 3
        for attempt in range(max_retries):
            try:
                logger.info(f"烂番茄电影榜单抓取尝试 {attempt + 1}/{max_retries}")
                items = await self._rt_extract_itemlist(url, 'Movie')
                if not items:
                    raise Exception("未获取到榜单数据")
                break
            except Exception as e:
                logger.warning(f"烂番茄电影榜单抓取失败 (尝试 {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    logger.error("烂番茄电影榜单抓取最终失败")
                    return 0
                await asyncio.sleep(5 * (attempt + 1))  # 递增等待时间
        
        saved = 0
        rank = 1
        for it in items[:10]:
            title = it.get('name') or ''
            year = it.get('year')
            match = None
            for attempt in range(3):
                try:
                    tmdb_id = await matcher.match_by_title_and_year(title, 'movie', str(year) if year else None)
                    if not tmdb_id:
                        raise RuntimeError('no tmdb')
                    info = await matcher.get_tmdb_info(tmdb_id, 'movie')
                    if not info:
                        raise RuntimeError('no info')
                    match = {
                        'tmdb_id': tmdb_id,
                        'title': self._safe_get_title(info, title),
                        'poster': info.get('poster_url', ''),
                        'media_type': 'movie'
                    }
                    break
                except Exception:
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)
            if not match:
                logger.warning(f"烂番茄电影未匹配: {title}")
                rank += 1
                continue
            
            # 直接插入新数据（已清空旧数据）
            final_title = match.get('title') or title or f"TMDB-{match['tmdb_id']}"
            self.db.add(ChartEntry(
                platform='烂番茄',
                chart_name='Popular Streaming Movies',
                media_type=match.get('media_type', 'movie'),
                rank=rank,
                tmdb_id=match['tmdb_id'],
                title=final_title,
                poster=match.get('poster','')
            ))
            saved += 1
            rank += 1
        self.db.commit()
        logger.info(f"烂番茄 Popular Streaming Movies 入库 {saved} 条")
        return saved

    async def update_letterboxd_popular(self) -> int:
        """Letterboxd Popular films this week：进入详情解析 data-tmdb-id，匹配 TMDB 并入库"""
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='Letterboxd',
            ChartEntry.chart_name=='Popular films this week'
        ).delete()
        logger.info(f"Letterboxd榜单: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        items = await self.scrape_letterboxd_popular()
        saved = 0
        rank = 1
        import urllib3, requests
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        }
        for it in items[:10]:
            title = it.get('title') or ''
            url = it.get('url') or ''
            if not url:
                rank += 1
                continue
            tmdb_id = None
            try:
                r = requests.get(url, headers=headers, timeout=20, verify=False)
                m = re.search(r'<body[^>]*data-tmdb-id=\"(\d+)\"', r.text)
                tmdb_id = int(m.group(1)) if m else None
            except Exception:
                tmdb_id = None
            match = None
            actual_media_type = 'movie'
            if tmdb_id:
                # 先尝试作为 movie
                info = await matcher.get_tmdb_info(tmdb_id, 'movie')
                if info:
                    match = {
                        'tmdb_id': tmdb_id,
                        'title': self._safe_get_title(info, title),
                        'poster': info.get('poster_url', ''),
                        'media_type': 'movie'
                    }
                else:
                    # 如果 movie 查询失败，尝试作为 tv
                    info = await matcher.get_tmdb_info(tmdb_id, 'tv')
                    if info:
                        match = {
                            'tmdb_id': tmdb_id,
                            'title': self._safe_get_title(info, title),
                            'poster': info.get('poster_url', ''),
                            'media_type': 'tv'
                        }
                        actual_media_type = 'tv'
            if not match:
                # fallback by title - 先尝试 movie
                for attempt in range(3):
                    try:
                        mid = await matcher.match_by_title_and_year(title, 'movie')
                        if not mid:
                            raise RuntimeError('no id')
                        info = await matcher.get_tmdb_info(mid, 'movie')
                        if not info:
                            raise RuntimeError('no info')
                        match = {
                            'tmdb_id': mid,
                            'title': self._safe_get_title(info, title),
                            'poster': info.get('poster_url', ''),
                            'media_type': 'movie'
                        }
                        break
                    except Exception:
                        if attempt < 2:
                            await asyncio.sleep(2 ** attempt)
                # 如果 movie 匹配失败，尝试 tv
                if not match:
                    for attempt in range(3):
                        try:
                            mid = await matcher.match_by_title_and_year(title, 'tv')
                            if not mid:
                                raise RuntimeError('no id')
                            info = await matcher.get_tmdb_info(mid, 'tv')
                            if not info:
                                raise RuntimeError('no info')
                            match = {
                                'tmdb_id': mid,
                                'title': self._safe_get_title(info, title),
                                'poster': info.get('poster_url', ''),
                                'media_type': 'tv'
                            }
                            actual_media_type = 'tv'
                            break
                        except Exception:
                            if attempt < 2:
                                await asyncio.sleep(2 ** attempt)
            if not match:
                logger.warning(f"Letterboxd未匹配: {title}")
                rank += 1
                continue
            
            # 直接插入新数据（已清空旧数据）
            self.db.add(ChartEntry(
                platform='Letterboxd',
                chart_name='Popular films this week',
                media_type=match.get('media_type', 'movie'),
                rank=rank,
                tmdb_id=match['tmdb_id'],
                title=match['title'],
                poster=match.get('poster','')
            ))
            saved += 1
            rank += 1
        self.db.commit()
        logger.info(f"Letterboxd Popular films this week 入库 {saved} 条")
        return saved

    async def _extract_imdb_from_metacritic(self, url: str) -> Optional[str]:
        try:
            import requests, urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
            }
            resp = requests.get(url, headers=headers, timeout=20, verify=False)
            if resp.status_code != 200:
                return None
            m = re.search(r'imdbId:\\"(tt\\d+)\\"', resp.text)
            if not m:
                m = re.search(r'imdbId:\s*\\"(tt\\d+)\\"', resp.text)
            return m.group(1) if m else None
        except Exception:
            return None

    async def update_metacritic_movies(self) -> int:
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='MTC',
            ChartEntry.chart_name=='Trending Movies This Week'
        ).delete()
        logger.info(f"Metacritic电影榜单: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        items = await self.scrape_metacritic_trending_movies()
        saved = 0
        rank = 1
        for it in items[:10]:
            title = it.get('title') or ''
            url = it.get('url') or ''
            if not url:
                rank += 1
                continue
            imdb_id = await self._extract_imdb_from_metacritic(url)
            match = None
            if imdb_id:
                match = await matcher.match_imdb_with_tmdb(imdb_id, title, 'movie')
            if not match:
                # fallback by title
                mid = await matcher.match_by_title_and_year(title, 'movie')
                if mid:
                    info = await matcher.get_tmdb_info(mid, 'movie')
                    if info:
                        match = {'tmdb_id': mid, 'title': self._safe_get_title(info, title), 'poster': info.get('poster_url',''), 'media_type': 'movie'}
            if not match:
                logger.warning(f"Metacritic电影未匹配: {title}")
                rank += 1
                continue
            
            # 直接插入新数据（已清空旧数据）
            self.db.add(ChartEntry(
                platform='MTC',
                chart_name='Trending Movies This Week',
                media_type=match.get('media_type', 'movie'),
                rank=rank,
                tmdb_id=match['tmdb_id'],
                title=match.get('title', title),
                poster=match.get('poster','')
            ))
            saved += 1
            rank += 1
        self.db.commit()
        logger.info(f"Metacritic Trending Movies This Week 入库 {saved} 条")
        return saved

    async def update_metacritic_shows(self) -> int:
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='MTC',
            ChartEntry.chart_name=='Trending Shows This Week'
        ).delete()
        logger.info(f"Metacritic剧集榜单: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        items = await self.scrape_metacritic_trending_shows()
        saved = 0
        rank = 1
        for it in items[:10]:
            title = it.get('title') or ''
            url = it.get('url') or ''
            if not url:
                rank += 1
                continue
            imdb_id = await self._extract_imdb_from_metacritic(url)
            match = None
            if imdb_id:
                match = await matcher.match_imdb_with_tmdb(imdb_id, title, 'tv')
            if not match:
                # fallback by title
                mid = await matcher.match_by_title_and_year(title, 'tv')
                if mid:
                    info = await matcher.get_tmdb_info(mid, 'tv')
                    if info:
                        match = {'tmdb_id': mid, 'title': self._safe_get_title(info, title), 'poster': info.get('poster_url',''), 'media_type': 'tv'}
            if not match:
                logger.warning(f"Metacritic剧集未匹配: {title}")
                rank += 1
                continue
            
            # 直接插入新数据（已清空旧数据）
            self.db.add(ChartEntry(
                platform='MTC',
                chart_name='Trending Shows This Week',
                media_type=match.get('media_type', 'tv'),
                rank=rank,
                tmdb_id=match['tmdb_id'],
                title=match.get('title', title),
                poster=match.get('poster','')
            ))
            saved += 1
            rank += 1
        self.db.commit()
        logger.info(f"Metacritic Trending Shows This Week 入库 {saved} 条")
        return saved

    async def update_tmdb_trending_all_week(self) -> int:
        """TMDB 趋势本周（页面顺序）。优先抓取网页 remote/panel 顺序，失败回退官方 API。"""
        import urllib3, requests, re
        from bs4 import BeautifulSoup
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        def fetch_from_remote_panel() -> list[dict]:
            try:
                # 与网页一致的数据源（顺序即为展示顺序）
                panel_url = "https://www.themoviedb.org/remote/panel?panel=trending_scroller&group=this-week"
                headers_html = {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                }
                rr = requests.get(panel_url, headers=headers_html, timeout=20, verify=False)
                if rr.status_code != 200:
                    logger.warning(f"TMDB remote panel 调用失败: {rr.status_code}")
                    return []
                html = rr.text
                soup = BeautifulSoup(html, 'html.parser')
                items: list[dict] = []
                seen: set[tuple[str,int]] = set()

                # 链接通常形如 /movie/123 | /tv/456
                for a in soup.select('a[href^="/movie/"] , a[href^="/tv/"]'):
                    href = a.get('href') or ''
                    m = re.match(r'^/(movie|tv)/(\d+)', href)
                    if not m:
                        continue
                    media_type, sid = m.group(1), int(m.group(2))
                    key = (media_type, sid)
                    if key in seen:
                        continue
                    # 标题可从 a 的 title 或文本获取（若无则留空，后续 TMDB 补齐）
                    title = (a.get('title') or a.get_text(strip=True) or '').strip()
                    items.append({'media_type': media_type, 'tmdb_id': sid, 'title': title})
                    seen.add(key)

                return items[:10]
            except Exception as ex:
                logger.error(f"解析 TMDB remote panel 失败: {ex}")
                return []

        def fetch_from_official_api() -> list[dict]:
            # 回退：官方 API（顺序为趋势排序）
            tmdb_token = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0ZjY4MWZhN2I1YWI3MzQ2YTRlMTg0YmJmMmQ0MTcxNSIsIm5iZiI6MTUyNjE3NDY5MC4wMjksInN1YiI6IjVhZjc5M2UyOTI1MTQxMmM4MDAwNGE5ZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.maKS7ZH7y6l_H0_dYcXn5QOZHuiYdK_SsiQ5AAk32cI"
            headers_api = {
                'Authorization': f'Bearer {tmdb_token}',
                'accept': 'application/json'
            }
            url = "https://api.themoviedb.org/3/trending/all/week"
            try:
                r = requests.get(url, headers=headers_api, timeout=20, verify=False)
                if r.status_code != 200:
                    return []
                data = r.json()
                arr = []
                for it in (data.get('results') or [])[:10]:
                    arr.append({
                        'media_type': it.get('media_type'),
                        'tmdb_id': int(it.get('id')),
                        'title': it.get('title') or it.get('name') or ''
                    })
                return arr
            except Exception:
                return []

        # 先用页面顺序数据源
        items = fetch_from_remote_panel()
        if not items:
            # 回退API
            items = fetch_from_official_api()
        if not items:
            logger.error("TMDB 趋势本周：页面与API均无结果")
            return 0

        # 清空现有数据
        self.db.query(ChartEntry).filter(
            ChartEntry.platform == 'TMDB',
            ChartEntry.chart_name == '趋势本周'
        ).delete()

        # 入库（按 items 顺序赋 rank），补齐标题与海报
        saved = 0
        matcher = TMDBMatcher(self.db)
        for idx, item in enumerate(items[:10], 1):
            tmdb_id = int(item.get('tmdb_id'))
            media_type = item.get('media_type') or 'movie'
            title = item.get('title') or ''
            poster = ''
            try:
                info = await matcher.get_tmdb_info(tmdb_id, media_type)
                if info:
                    title = self._safe_get_title(info, title)
                    poster = info.get('poster_url', '')
            except Exception:
                pass
            self.db.add(ChartEntry(
                platform='TMDB',
                chart_name='趋势本周',
                media_type=media_type,
                rank=idx,
                tmdb_id=tmdb_id,
                title=title,
                poster=poster
            ))
            saved += 1

        self.db.commit()
        logger.info(f"TMDB 趋势本周 入库 {saved} 条（来源：{'remote panel' if items else 'api'}）")
        return saved

    async def update_trakt_movies_weekly(self) -> int:
        """Trakt Movies most watched weekly → 'Trakt / Top Movies Last Week'"""
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='Trakt',
            ChartEntry.chart_name=='Top Movies Last Week'
        ).delete()
        logger.info(f"Trakt电影榜单: 清空旧数据 {deleted} 条")
        
        import urllib3, requests
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        headers = {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': '859d1ad30074136a934c47ba2083cda83620b17b0db8f2d0ec554922116c60a8',
            'User-Agent': 'Mozilla/5.0'
        }
        r = requests.get('https://api.trakt.tv/movies/watched/weekly', params={'limit':10}, headers=headers, timeout=25, verify=False)
        if r.status_code != 200:
            return 0
        from chart_scrapers import TMDBMatcher
        matcher = TMDBMatcher(self.db)
        saved = 0
        for idx, it in enumerate(r.json()[:10], 1):
            title = (it.get('movie') or {}).get('title') or ''
            year = (it.get('movie') or {}).get('year')
            match = None
            for attempt in range(3):
                try:
                    tmdb_id = await matcher.match_by_title_and_year(title, 'movie', str(year) if year else None)
                    if not tmdb_id:
                        raise RuntimeError('no id')
                    info = await matcher.get_tmdb_info(tmdb_id, 'movie')
                    if not info:
                        raise RuntimeError('no info')
                    match = {'tmdb_id': tmdb_id, 'title': self._safe_get_title(info, title), 'poster': info.get('poster_url',''), 'media_type': 'movie'}
                    break
                except Exception:
                    if attempt<2:
                        await asyncio.sleep(2**attempt)
            if not match:
                continue
            
            # 直接插入新数据（已清空旧数据）
            final_title = match.get('title') or title or f"TMDB-{match['tmdb_id']}"
            self.db.add(ChartEntry(
                platform='Trakt',
                chart_name='Top Movies Last Week',
                media_type=match.get('media_type', 'movie'),
                rank=idx,
                tmdb_id=match['tmdb_id'],
                title=final_title,
                poster=match.get('poster','')
            ))
            saved += 1
        self.db.commit(); logger.info(f"Trakt Movies weekly 入库 {saved} 条"); return saved

    async def update_trakt_shows_weekly(self) -> int:
        """Trakt Shows most watched weekly → 'Trakt / Top TV Shows Last Week'"""
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='Trakt',
            ChartEntry.chart_name=='Top TV Shows Last Week'
        ).delete()
        logger.info(f"Trakt剧集榜单: 清空旧数据 {deleted} 条")
        
        import urllib3, requests
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        headers = {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': '859d1ad30074136a934c47ba2083cda83620b17b0db8f2d0ec554922116c60a8',
            'User-Agent': 'Mozilla/5.0'
        }
        r = requests.get('https://api.trakt.tv/shows/watched/weekly', params={'limit':10}, headers=headers, timeout=25, verify=False)
        if r.status_code != 200:
            return 0
        from chart_scrapers import TMDBMatcher
        matcher = TMDBMatcher(self.db)
        saved = 0
        for idx, it in enumerate(r.json()[:10], 1):
            title = (it.get('show') or {}).get('title') or ''
            year = (it.get('show') or {}).get('year')
            match = None
            for attempt in range(3):
                try:
                    tmdb_id = await matcher.match_by_title_and_year(title, 'tv', str(year) if year else None)
                    if not tmdb_id:
                        raise RuntimeError('no id')
                    info = await matcher.get_tmdb_info(tmdb_id, 'tv')
                    if not info:
                        raise RuntimeError('no info')
                    match = {'tmdb_id': tmdb_id, 'title': self._safe_get_title(info, title), 'poster': info.get('poster_url',''), 'media_type': 'tv'}
                    break
                except Exception:
                    if attempt<2:
                        await asyncio.sleep(2**attempt)
            if not match:
                continue
            
            # 直接插入新数据（已清空旧数据）
            final_title = match.get('title') or title or f"TMDB-{match['tmdb_id']}"
            self.db.add(ChartEntry(
                platform='Trakt',
                chart_name='Top TV Shows Last Week',
                media_type=match.get('media_type', 'tv'),
                rank=idx,
                tmdb_id=match['tmdb_id'],
                title=final_title,
                poster=match.get('poster','')
            ))
            saved += 1
        self.db.commit(); logger.info(f"Trakt Shows weekly 入库 {saved} 条"); return saved

    async def update_imdb_top10(self) -> int:
        """IMDb Top 10 this week → 'IMDb / Top 10 on IMDb this week'，movie/tv/both 按返回实际类型存储"""
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='IMDb',
            ChartEntry.chart_name=='Top 10 on IMDb this week'
        ).delete()
        logger.info(f"IMDb Top 10: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        items = await self.scrape_imdb_top_10()
        saved = 0
        for idx, it in enumerate(items[:10], 1):
            title = it.get('title') or ''
            imdb_id = it.get('imdb_id') or ''
            match = None
            if imdb_id:
                match = await matcher.match_imdb_with_tmdb(imdb_id, title, 'both')
            if not match:
                continue
            media_type = match.get('media_type') or 'movie'
            # 直接插入新数据（已清空旧数据）
            self.db.add(ChartEntry(
                platform='IMDb',
                chart_name='Top 10 on IMDb this week',
                media_type=media_type,
                rank=idx,
                tmdb_id=match['tmdb_id'],
                title=match.get('title', title),
                poster=match.get('poster','')
            ))
            saved += 1
        self.db.commit(); logger.info(f"IMDb Top 10 入库 {saved} 条"); return saved

    async def update_douban_weekly_movie(self) -> int:
        """豆瓣一周口碑榜（电影）：进入详情页取 IMDb ID 匹配 TMDB 并入库，失败时使用原标题匹配"""
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='豆瓣',
            ChartEntry.chart_name=='一周口碑榜'
        ).delete()
        logger.info(f"豆瓣一周口碑榜: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        items = await self.scrape_douban_weekly_movie_chart()
        saved = 0
        rank = 1
        for it in items[:10]:
            title = it.get('title') or ''
            douban_id = it.get('douban_id') or ''
            match = None
            
            # 1. 优先使用IMDb ID匹配
            imdb_id = await self.get_douban_imdb_id(douban_id)
            if imdb_id:
                logger.info(f"尝试用IMDb ID匹配: {title} (IMDb: {imdb_id})")
                match = await matcher.match_imdb_with_tmdb(imdb_id, title, 'movie')
                if match:
                    logger.info(f"✅ IMDb ID匹配成功: {title}")
            
            # 2. IMDb ID匹配失败时，尝试使用原标题匹配
            if not match:
                original_title = await matcher.extract_douban_original_title(douban_id)
                if original_title:
                    logger.info(f"尝试用原标题匹配: {title} -> {original_title}")
                    tmdb_id = await matcher.match_by_title_and_year(original_title, 'movie')
                    if tmdb_id:
                        info = await matcher.get_tmdb_info(tmdb_id, 'movie')
                        if info:
                            match = {'tmdb_id': tmdb_id, 'title': self._safe_get_title(info, title), 'poster': info.get('poster_url',''), 'media_type': 'movie'}
                            logger.info(f"✅ 原标题匹配成功: {original_title}")
            
            # 3. 最后兜底：使用中文标题匹配
            if not match:
                logger.info(f"尝试用中文标题匹配: {title}")
                mid = await matcher.match_by_title_and_year(title, 'movie')
                if mid:
                    info = await matcher.get_tmdb_info(mid, 'movie')
                    if info:
                        match = {'tmdb_id': mid, 'title': self._safe_get_title(info, title), 'poster': info.get('poster_url',''), 'media_type': 'movie'}
                        logger.info(f"✅ 中文标题匹配成功: {title}")
            
            if not match:
                logger.warning(f"❌ 所有匹配方式都失败: {title}")
                rank += 1; continue
            
            # 直接插入新数据（已清空旧数据）
            self.db.add(ChartEntry(
                platform='豆瓣',
                chart_name='一周口碑榜',
                media_type=match.get('media_type', 'movie'),
                rank=rank,
                tmdb_id=match['tmdb_id'],
                title=match.get('title', title),
                poster=match.get('poster','')
            ))
            saved += 1; rank += 1
        self.db.commit(); logger.info(f"豆瓣 一周口碑榜 入库 {saved} 条"); return saved

    async def update_douban_weekly_chinese_tv(self) -> int:
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='豆瓣',
            ChartEntry.chart_name=='一周华语剧集口碑榜'
        ).delete()
        logger.info(f"豆瓣一周华语剧集口碑榜: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        items = await self.scrape_douban_weekly_chinese_tv_chart()
        saved = 0; rank = 1
        for it in items[:10]:
            title = it.get('title') or ''
            tmdb_id = await matcher.match_by_title_and_year(title, 'tv')
            match = None
            if tmdb_id:
                info = await matcher.get_tmdb_info(tmdb_id, 'tv')
                if info:
                    match = {'tmdb_id': tmdb_id, 'title': self._safe_get_title(info, title), 'poster': info.get('poster_url',''), 'media_type': 'tv'}
            if not match:
                rank += 1; continue
            
            # 直接插入新数据（已清空旧数据）
            self.db.add(ChartEntry(
                platform='豆瓣',
                chart_name='一周华语剧集口碑榜',
                media_type=match.get('media_type', 'tv'),
                rank=rank,
                tmdb_id=match['tmdb_id'],
                title=match.get('title', title),
                poster=match.get('poster','')
            ))
            saved += 1; rank += 1
        self.db.commit(); logger.info(f"豆瓣 一周华语剧集口碑榜 入库 {saved} 条"); return saved

    async def update_douban_weekly_global_tv(self) -> int:
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='豆瓣',
            ChartEntry.chart_name=='一周全球剧集口碑榜'
        ).delete()
        logger.info(f"豆瓣一周全球剧集口碑榜: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        items = await self.scrape_douban_weekly_global_tv_chart()
        saved = 0; rank = 1
        for it in items[:10]:
            title = it.get('title') or ''
            douban_id = it.get('douban_id') or ''  # 修复字段名
            match = None
            original_title = None
            
            logger.debug(f"  处理: {title} (豆瓣ID: {douban_id})")
            
            # 使用通用原名提取函数
            original_title = await matcher.extract_douban_original_title(douban_id)
            if original_title:
                logger.debug(f"    提取到原名: {original_title}")
            
            # 优先用原名匹配 TMDB
            if original_title:
                logger.debug(f"    用原名匹配: {original_title}")
                tmdb_id = await matcher.match_by_title_and_year(original_title, 'tv')
                if tmdb_id:
                    info = await matcher.get_tmdb_info(tmdb_id, 'tv')
                    if info:
                        match = {'tmdb_id': tmdb_id, 'title': self._safe_get_title(info, original_title), 'poster': info.get('poster_url',''), 'media_type': 'tv'}
                        logger.info(f"    ✅ 原名匹配成功: {original_title} -> {match['title']}")
            
            # 回退中文名匹配
            if not match:
                logger.debug(f"    回退中文名匹配: {title}")
                tmdb_id = await matcher.match_by_title_and_year(title, 'tv')
                if tmdb_id:
                    info = await matcher.get_tmdb_info(tmdb_id, 'tv')
                    if info:
                        match = {'tmdb_id': tmdb_id, 'title': self._safe_get_title(info, title), 'poster': info.get('poster_url',''), 'media_type': 'tv'}
                        logger.info(f"    ✅ 中文名匹配成功: {title} -> {match['title']}")
            if not match:
                rank += 1; continue
            # 直接插入新数据（已清空旧数据）
            self.db.add(ChartEntry(
                platform='豆瓣',
                chart_name='一周全球剧集口碑榜',
                media_type=match.get('media_type', 'tv'),
                rank=rank,
                tmdb_id=match['tmdb_id'],
                title=match.get('title', title),
                poster=match.get('poster','')
            ))
            saved += 1; rank += 1
        self.db.commit(); logger.info(f"豆瓣 一周全球剧集口碑榜 入库 {saved} 条"); return saved
    
    async def update_rotten_tv(self) -> int:
        """烂番茄 Popular TV：解析 JSON-LD，匹配 TMDB 并入库，返回写入条数"""
        # 先清空该榜单的旧数据
        deleted = self.db.query(ChartEntry).filter(
            ChartEntry.platform=='烂番茄',
            ChartEntry.chart_name=='Popular TV'
        ).delete()
        logger.info(f"烂番茄TV榜单: 清空旧数据 {deleted} 条")
        
        matcher = TMDBMatcher(self.db)
        url = 'https://www.rottentomatoes.com/browse/tv_series_browse/sort:popular'
        
        # 添加重试机制
        max_retries = 3
        for attempt in range(max_retries):
            try:
                logger.info(f"烂番茄TV榜单抓取尝试 {attempt + 1}/{max_retries}")
                items = await self._rt_extract_itemlist(url, 'TVSeries')
                if not items:
                    raise Exception("未获取到榜单数据")
                break
            except Exception as e:
                logger.warning(f"烂番茄TV榜单抓取失败 (尝试 {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    logger.error("烂番茄TV榜单抓取最终失败")
                    return 0
                await asyncio.sleep(5 * (attempt + 1))  # 递增等待时间
        
        saved = 0
        rank = 1
        for it in items[:10]:
            title = it.get('name') or ''
            year = it.get('year')
            match = None
            for attempt in range(3):
                try:
                    tmdb_id = await matcher.match_by_title_and_year(title, 'tv', str(year) if year else None)
                    if not tmdb_id:
                        raise RuntimeError('no tmdb')
                    info = await matcher.get_tmdb_info(tmdb_id, 'tv')
                    if not info:
                        raise RuntimeError('no info')
                    match = {
                        'tmdb_id': tmdb_id,
                        'title': self._safe_get_title(info, title),
                        'poster': info.get('poster_url', ''),
                        'media_type': 'tv'
                    }
                    break
                except Exception:
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)
            if not match:
                logger.warning(f"烂番茄TV未匹配: {title}")
                rank += 1
                continue
            
            # 直接插入新数据（已清空旧数据）
            final_title = match.get('title') or title or f"TMDB-{match['tmdb_id']}"
            self.db.add(ChartEntry(
                platform='烂番茄',
                chart_name='Popular TV',
                media_type=match.get('media_type', 'tv'),
                rank=rank,
                tmdb_id=match['tmdb_id'],
                title=final_title,
                poster=match.get('poster','')
            ))
            saved += 1
            rank += 1
        self.db.commit()
        logger.info(f"烂番茄 Popular TV 入库 {saved} 条")
        return saved
    
    async def scrape_metacritic_trending_movies(self) -> List[Dict]:
        """抓取Metacritic Trending Movies This Week"""
        async def scrape_with_browser(browser):
            page = await browser.new_page()
            try:
                await page.goto("https://www.metacritic.com/", wait_until="domcontentloaded")
                await asyncio.sleep(3)
                
                # 等待页面完全加载（放宽超时并兜底）
                try:
                    await page.wait_for_load_state("networkidle", timeout=60000)
                except Exception:
                    # 兜底等待，给懒加载一些时间
                    await asyncio.sleep(5)
                
                # 查找Trending Movies This Week区域
                # 根据HTML结构，使用data-cy="movies-*"来定位电影卡片
                movie_cards = await page.query_selector_all('[data-cy^="movies-"]')
                results = []
                
                for i, card in enumerate(movie_cards[:10], 1):  # 只取前10个
                    try:
                        # 获取标题
                        title_elem = await card.query_selector('.c-globalProductCard_title')
                        if not title_elem:
                            continue
                            
                        title = await title_elem.inner_text()
                        
                        # 获取链接
                        link_elem = await card.query_selector('a.c-globalProductCard_container')
                        if not link_elem:
                            continue
                            
                        url = await link_elem.get_attribute('href')
                        if not url:
                            continue
                            
                        # 确保URL是完整的
                        if not url.startswith('http'):
                            url = f"https://www.metacritic.com{url}"
                        
                        # 从URL中提取Metacritic ID
                        metacritic_id = re.search(r'/movie/([^/]+)/', url)
                        if metacritic_id:
                            results.append({
                                'rank': i,
                                'title': title.strip(),
                                'metacritic_id': metacritic_id.group(1),
                                'url': url
                            })
                            
                    except Exception as e:
                        logger.error(f"处理Metacritic电影榜单项时出错: {e}")
                        continue
                
                logger.info(f"Metacritic电影榜单获取到 {len(results)} 个项目")
                return results
            finally:
                await page.close()
                
        return await browser_pool.execute_in_browser(scrape_with_browser)
    
    async def scrape_metacritic_trending_shows(self) -> List[Dict]:
        """抓取Metacritic Trending Shows This Week"""
        async def scrape_with_browser(browser):
            page = await browser.new_page()
            try:
                await page.goto("https://www.metacritic.com/", wait_until="domcontentloaded")
                await asyncio.sleep(3)
                
                # 等待页面完全加载（放宽超时并兜底）
                try:
                    await page.wait_for_load_state("networkidle", timeout=60000)
                except Exception:
                    await asyncio.sleep(5)
                
                # 查找Trending Shows This Week区域
                # 根据HTML结构，使用data-cy="shows-*"来定位电视剧卡片
                show_cards = await page.query_selector_all('[data-cy^="shows-"]')
                results = []
                
                for i, card in enumerate(show_cards[:10], 1):  # 只取前10个
                    try:
                        # 获取标题
                        title_elem = await card.query_selector('.c-globalProductCard_title')
                        if not title_elem:
                            continue
                            
                        title = await title_elem.inner_text()
                        
                        # 获取链接
                        link_elem = await card.query_selector('a.c-globalProductCard_container')
                        if not link_elem:
                            continue
                            
                        url = await link_elem.get_attribute('href')
                        if not url:
                            continue
                            
                        # 确保URL是完整的
                        if not url.startswith('http'):
                            url = f"https://www.metacritic.com{url}"
                        
                        # 从URL中提取Metacritic ID
                        metacritic_id = re.search(r'/tv/([^/]+)/', url)
                        if metacritic_id:
                            results.append({
                                'rank': i,
                                'title': title.strip(),
                                'metacritic_id': metacritic_id.group(1),
                                'url': url
                            })
                            
                    except Exception as e:
                        logger.error(f"处理Metacritic电视剧榜单项时出错: {e}")
                        continue
                
                logger.info(f"Metacritic电视剧榜单获取到 {len(results)} 个项目")
                return results
            finally:
                await page.close()
                
        return await browser_pool.execute_in_browser(scrape_with_browser)


class TMDBMatcher:
    def __init__(self, db: Session):
        self.db = db
    
    @staticmethod
    def _safe_get_title(info: Dict, fallback_title: str = '') -> str:
        """安全获取标题：从 TMDB info 中获取标题，去除空格，确保不为空"""
        zh_title = (info.get('zh_title') or '').strip()
        tmdb_title = (info.get('title') or '').strip()
        tmdb_name = (info.get('name') or '').strip()
        return zh_title or tmdb_title or tmdb_name or fallback_title
        
    async def match_imdb_with_tmdb(self, imdb_id: str, title: str, media_type: str, max_retries: int = 3) -> Optional[Dict]:
        """通过IMDB ID匹配TMDB ID，返回包含海报信息的字典，支持重试机制"""
        for attempt in range(max_retries):
            try:
                logger.info(f"尝试匹配IMDB ID {imdb_id} ({title}) - 第 {attempt + 1} 次尝试")
                
                tmdb_id = None
                
                # 直接使用IMDB ID进行TMDB搜索
                logger.info(f"使用IMDB ID搜索: {imdb_id}")
                match_result = await self.match_by_imdb_id(imdb_id, media_type)
                
                # 处理返回结果
                if match_result:
                    if isinstance(match_result, dict):
                        # 'both'类型返回字典
                        tmdb_id = match_result['tmdb_id']
                        actual_media_type = match_result['media_type']
                    else:
                        # 特定类型返回ID
                        tmdb_id = match_result
                        actual_media_type = media_type
                else:
                    tmdb_id = None
                    actual_media_type = media_type
                
                if tmdb_id:
                    # 获取TMDB详细信息，包括海报
                    tmdb_info = await self.get_tmdb_info(tmdb_id, actual_media_type)
                    if tmdb_info:
                        # 安全获取标题，去除空格
                        final_title = self._safe_get_title(tmdb_info, title)
                        logger.info(f"成功匹配: {title} -> TMDB ID: {tmdb_id}, 中文标题: {final_title}")
                        return {
                            'tmdb_id': tmdb_id,
                            'title': final_title,
                            'poster': tmdb_info.get('poster_url', ''),
                            'media_type': actual_media_type  # 添加media_type字段
                        }
                    else:
                        logger.warning(f"获取TMDB信息失败，但TMDB ID存在: {tmdb_id}")
                        return {
                            'tmdb_id': tmdb_id,
                            'title': title,
                            'poster': "",
                            'media_type': actual_media_type  # 添加media_type字段
                        }
                
                # 如果IMDB ID匹配失败，尝试使用标题搜索
                if not tmdb_id:
                    logger.info(f"IMDB ID匹配失败，尝试标题搜索: {title}")
                    tmdb_id = await self.match_by_title_and_year(title, media_type)
                    if tmdb_id:
                        tmdb_info = await self.get_tmdb_info(tmdb_id, media_type)
                        if tmdb_info:
                            final_title = self._safe_get_title(tmdb_info, title)
                            logger.info(f"通过标题匹配成功: {title} -> TMDB ID: {tmdb_id}, 中文标题: {final_title}")
                            return {
                                'tmdb_id': tmdb_id,
                                'title': final_title,
                                'poster': tmdb_info.get('poster_url', ''),
                                'media_type': media_type  # 添加media_type字段
                            }
                
                # 如果匹配失败，等待后重试
                if attempt < max_retries - 1:
                    logger.warning(f"第 {attempt + 1} 次尝试失败，等待 {2 ** attempt} 秒后重试...")
                    await asyncio.sleep(2 ** attempt)  # 指数退避
                else:
                    logger.error(f"经过 {max_retries} 次尝试后，仍无法匹配: {title}")
                    return None
                    
            except Exception as e:
                logger.error(f"IMDB匹配失败 (第 {attempt + 1} 次尝试): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # 指数退避
                else:
                    return None
            
        return None
        
    async def match_douban_with_tmdb(self, douban_id: str, title: str, media_type: str, max_retries: int = 3) -> Optional[Dict]:
        """通过豆瓣ID和标题匹配TMDB ID，返回包含海报信息的字典，支持重试机制"""
        for attempt in range(max_retries):
            try:
                logger.info(f"尝试匹配豆瓣ID {douban_id} ({title}) - 第 {attempt + 1} 次尝试")
                
                tmdb_id = None
                
                # 使用通用原名提取函数
                original_title = await self.extract_douban_original_title(douban_id)
                
                # 优先用原名匹配
                if original_title:
                    logger.info(f"使用原名搜索: {original_title}")
                    tmdb_id = await self.match_by_title_and_year(original_title, media_type)
                    if tmdb_id:
                        logger.info(f"通过原名匹配成功: {title} -> {original_title} (ID: {tmdb_id})")
                
                # 如果原名匹配失败，使用中文标题搜索
                if not tmdb_id:
                    logger.info(f"使用中文标题搜索: {title}")
                    tmdb_id = await self.match_by_title_and_year(title, media_type)
                
                # 如果剧集找不到，尝试匹配到第一季
                if not tmdb_id and media_type == "tv" and ("第二季" in title or "Season 2" in title):
                    first_season_title = title.replace("第二季", "").replace("Season 2", "").strip()
                    logger.info(f"尝试第一季标题搜索: {first_season_title}")
                    tmdb_id = await self.match_by_title_and_year(first_season_title, media_type)
                    if tmdb_id:
                        logger.info(f"通过第一季标题匹配成功: {title} -> {first_season_title} (ID: {tmdb_id})")
                
                if tmdb_id:
                    # 获取TMDB详细信息，包括海报
                    tmdb_info = await self.get_tmdb_info(tmdb_id, media_type)
                    if tmdb_info:
                        # 优先使用中文标题，如果没有则使用原始标题
                        final_title = tmdb_info.get('zh_title') or tmdb_info.get('title') or tmdb_info.get('name', title)
                        logger.info(f"成功匹配: {title} -> TMDB ID: {tmdb_id}, 中文标题: {final_title}")
                        return {
                            'tmdb_id': tmdb_id,
                            'title': final_title,
                            'poster': tmdb_info.get('poster_url', '')
                        }
                    else:
                        logger.warning(f"获取TMDB信息失败，但TMDB ID存在: {tmdb_id}")
                        return {
                            'tmdb_id': tmdb_id,
                            'title': title,
                            'poster': ""
                        }
                
                # 如果匹配失败，等待后重试
                if attempt < max_retries - 1:
                    logger.warning(f"第 {attempt + 1} 次尝试失败，等待 {2 ** attempt} 秒后重试...")
                    await asyncio.sleep(2 ** attempt)  # 指数退避
                else:
                    logger.error(f"经过 {max_retries} 次尝试后，仍无法匹配: {title}")
                    return None
                    
            except Exception as e:
                logger.error(f"豆瓣匹配失败 (第 {attempt + 1} 次尝试): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # 指数退避
                else:
                    return None
        
        return None
    
    
    
    async def extract_douban_original_title(self, douban_id: str) -> Optional[str]:
        """通用的豆瓣原名提取函数：从详情页 JSON-LD 和 HTML 中提取原名"""
        try:
            import requests, urllib3, json
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
            }
            resp = requests.get(f"https://movie.douban.com/subject/{douban_id}/", headers=headers, timeout=20, verify=False)
            
            if resp.status_code != 200:
                return None
                
            html = resp.text
            original_title = None
            
            # 从 JSON-LD 的 name 字段提取原名
            ld_blocks = re.findall(r'<script[^>]*type=\"application/ld\+json\"[^>]*>([\s\S]*?)</script>', html)
            
            for blk in ld_blocks:
                try:
                    data = json.loads(blk.strip())
                    if isinstance(data, dict):
                        name_field = data.get('name')
                        if isinstance(name_field, str) and name_field.strip():
                            # 智能提取完整原名
                            patterns = [
                                # "星期三 第二季 Wednesday Season 2" -> "Wednesday"
                                r'^[^\s]+\s+[^\s]*\s+([A-Za-z][A-Za-z\s]+?)\s+Season\s+\d+',
                                # "暴风圈 북극성" -> "북극성"  
                                r'^[^\s]+\s+([A-Za-z\uAC00-\uD7A3][A-Za-z\uAC00-\uD7A3\s]*?)$',
                                # "终极名单：黑狼 The Terminal List: Dark Wolf" -> "The Terminal List: Dark Wolf"
                                r'^[^\s]+[^\s]*\s+([A-Za-z][A-Za-z\s:]+?)$'
                            ]
                            
                            for pattern in patterns:
                                match = re.search(pattern, name_field.strip())
                                if match:
                                    candidate = match.group(1).strip()
                                    if candidate.lower() not in ('season', 'part', 'the', 'a', 'an'):
                                        original_title = candidate
                                        break
                                                    
                            # 如果上述模式都没匹配到，尝试简单分割
                            if not original_title:
                                tokens = re.split(r'[\s/|，,、:]+', name_field.strip())
                                non_chinese_tokens = []
                                for token in tokens:
                                    token = token.strip()
                                    if re.search(r'[\u4e00-\u9fff]', token):
                                        continue
                                    if token.lower() in ('season', 'part', '第二季', '第三季'):
                                        continue
                                    if re.match(r'^\d+$', token):
                                        continue
                                    if re.search(r'[A-Za-z\uAC00-\uD7A3]', token) and len(token) > 1:
                                        non_chinese_tokens.append(token)
                                
                                if non_chinese_tokens:
                                    original_title = ' '.join(non_chinese_tokens)
                                    if original_title:
                                        break
                except Exception:
                    continue
            
            # 如果 JSON-LD 没找到，尝试传统的 HTML 解析
            if not original_title:
                # 原名:
                m = re.search(r'<span class="pl">原名:</span>\s*([^<]+)<br\s*/?>', html)
                if m:
                    cand = m.group(1).strip()
                    if re.search(r'[A-Za-z\uAC00-\uD7A3]', cand):
                        original_title = cand
                
                # 又名: 取第一个包含非中文字符的名称
                if not original_title:
                    m2 = re.search(r'<span class="pl">又名:</span>\s*([^<]+)<br\s*/?>', html)
                    if m2:
                        aka_raw = m2.group(1)
                        for part in re.split(r'[，,/]+', aka_raw):
                            part = part.strip()
                            if re.search(r'[A-Za-z\uAC00-\uD7A3]', part):
                                original_title = part
                                break
            
            return original_title
        except Exception:
            return None
    
    def clean_title_for_search(self, title: str) -> str:
        """清理标题，移除季数、集数等后缀，用于TMDB搜索"""
        import re
        
        # 移除常见的季数后缀
        season_patterns = [
            r'\s+第[一二三四五六七八九十\d]+季\s*$',
            r'\s+Season\s+\d+\s*$',
            r'\s+S\d+\s*$',
            r'\s+第[一二三四五六七八九十\d]+部\s*$',
            r'\s+Part\s+\d+\s*$',
            r'\s+第[一二三四五六七八九十\d]+集\s*$',
            r'\s+Episode\s+\d+\s*$',
            r'\s+E\d+\s*$',
        ]
        
        cleaned_title = title
        for pattern in season_patterns:
            cleaned_title = re.sub(pattern, '', cleaned_title, flags=re.IGNORECASE)
        
        # 移除首尾空格
        cleaned_title = cleaned_title.strip()
        
        logger.info(f"标题清理: '{title}' -> '{cleaned_title}'")
        return cleaned_title

    async def match_by_imdb_id(self, imdb_id: str, media_type: str) -> Optional[int]:
        """通过IMDB ID匹配TMDB ID"""
        try:
            import requests
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            
            # 使用TMDB的find API通过IMDB ID查找
            api_key = "4f681fa7b5ab7346a4e184bbf2d41715"  # 使用与get_tmdb_info相同的API key
            find_url = f"https://api.themoviedb.org/3/find/{imdb_id}?api_key={api_key}&external_source=imdb_id"
                
            logger.info(f"TMDB API URL: {find_url}")
            response = requests.get(find_url, verify=False)
            logger.info(f"TMDB API响应状态: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                # 如果媒体类型是'both'，尝试查找movie和tv
                if media_type == 'both':
                    # 先尝试movie
                    movie_results = data.get('movie_results', [])
                    if movie_results:
                        tmdb_id = movie_results[0].get('id')
                        logger.info(f"通过IMDB ID {imdb_id} 找到TMDB电影ID: {tmdb_id}")
                        return {'tmdb_id': tmdb_id, 'media_type': 'movie'}
                    
                    # 再尝试tv
                    tv_results = data.get('tv_results', [])
                    if tv_results:
                        tmdb_id = tv_results[0].get('id')
                        logger.info(f"通过IMDB ID {imdb_id} 找到TMDB电视剧ID: {tmdb_id}")
                        return {'tmdb_id': tmdb_id, 'media_type': 'tv'}
                    
                    logger.warning(f"IMDB ID {imdb_id} 在TMDB中未找到任何匹配")
                    return None
                else:
                    # 根据指定的媒体类型获取结果
                    results = data.get(f'{media_type}_results', [])
                    if results:
                        tmdb_id = results[0].get('id')
                        logger.info(f"通过IMDB ID {imdb_id} 找到TMDB ID: {tmdb_id}")
                        return tmdb_id
                    else:
                        logger.warning(f"IMDB ID {imdb_id} 在TMDB中未找到匹配的{media_type}")
                        return None
            else:
                logger.error(f"TMDB find API请求失败: {response.status_code}")
                if response.status_code == 404:
                    error_data = response.text
                    logger.error(f"404错误详情: {error_data}")
                return None
                        
        except Exception as e:
            logger.error(f"通过IMDB ID匹配失败: {e}")
            return None

    async def match_by_title_and_year(self, title: str, media_type: str, year: str = None) -> Optional[int]:
        """通过标题和年份匹配TMDB ID，使用模糊匹配找到最佳结果，支持原名匹配。改用 Bearer Token 并增加多语言与无语言兜底。"""
        try:
            import requests
            import urllib3
            from fuzzywuzzy import fuzz
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

            # 清理标题用于搜索
            search_title = self.clean_title_for_search(title)

            # 使用 Bearer Token
            tmdb_token = (
                "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0ZjY4MWZhN2I1YWI3MzQ2YTRlMTg0YmJmMmQ0MTcxNSIsIm5iZiI6MTUyNjE3NDY5MC4wMjksInN1YiI6IjVhZjc5M2UyOTI1MTQxMmM4MDAwNGE5ZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.maKS7ZH7y6l_H0_dYcXn5QOZHuiYdK_SsiQ5AAk32cI"
            )
            headers = {"Authorization": f"Bearer {tmdb_token}", "accept": "application/json"}

            def do_search(lang: str | None):
                base = f"https://api.themoviedb.org/3/search/{media_type}?query={requests.utils.quote(search_title)}"
                if lang:
                    base += f"&language={lang}"
                if year:
                    base += f"&year={year}"
                resp = requests.get(base, headers=headers, verify=False, timeout=20)
                if resp.status_code != 200:
                    return []
                data = resp.json()
                return data.get("results", [])

            # 中文 → 英文 → 无语言 三级搜索
            results_zh = do_search("zh-CN")
            results_en = [] if results_zh else do_search("en-US")
            results_any = [] if (results_zh or results_en) else do_search(None)
            results = results_zh or results_en or results_any

            if not results:
                return None

            best_match = None
            best_score = 0
            for result in results:
                result_title = result.get("name" if media_type == "tv" else "title", "")
                original_title = result.get("original_name" if media_type == "tv" else "original_title", "")
                result_year = (result.get("first_air_date" if media_type == "tv" else "release_date", "") or "")[:4]

                title_score = fuzz.ratio(search_title.lower(), result_title.lower()) if result_title else 0
                original_score = fuzz.ratio(search_title.lower(), original_title.lower()) if original_title else 0
                max_title_score = max(title_score, original_score)

                year_bonus = 0
                if year and result_year:
                    if result_year == year:
                        year_bonus = 10
                    elif result_year.isdigit() and abs(int(result_year) - int(year)) <= 2:
                        year_bonus = 5

                recency_bonus = 0
                if result_year.isdigit() and int(result_year) >= 2020:
                    recency_bonus = 3

                total_score = (max_title_score * (1.4 if media_type == "tv" else 1.0)) + year_bonus + recency_bonus
                if total_score > best_score:
                    best_score = total_score
                    best_match = result

            # 放宽阈值，避免全量 miss
            if best_match and best_score >= 60:
                return int(best_match.get("id"))

            # 仍不满足时，尝试不带年份的无语言再次搜索（更宽松）
            if year:
                results_relaxed = do_search(None)
                for result in results_relaxed:
                    result_title = result.get("name" if media_type == "tv" else "title", "")
                    if fuzz.partial_ratio(search_title.lower(), (result_title or "").lower()) >= 60:
                        return int(result.get("id"))

            return None
        except Exception as e:
            logger.error(f"通过标题匹配失败: {e}")
            return None
    
    async def get_tmdb_info(self, tmdb_id: int, media_type: str, max_retries: int = 3) -> Optional[Dict]:
        """获取TMDB详细信息，参考ratings.py的实现，支持重试机制"""
        for attempt in range(max_retries):
            try:
                import requests
                import urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                
                # 获取英文数据
                endpoint = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?api_key=4f681fa7b5ab7346a4e184bbf2d41715&language=en-US&append_to_response=credits,external_ids"
                response = requests.get(endpoint, verify=False)
                
                if response.status_code == 200:
                    en_data = response.json()
                else:
                    logger.error(f"获取{media_type}信息失败，状态码: {response.status_code}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2 ** attempt)  # 指数退避
                        continue
                    return None

                if not en_data:
                    logger.error("API返回的数据为空")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2 ** attempt)  # 指数退避
                        continue
                    return None
                    
                # 获取中文数据
                zh_endpoint = endpoint.replace("language=en-US", "language=zh-CN")
                zh_response = requests.get(zh_endpoint, verify=False)
                zh_data = zh_response.json() if zh_response.status_code == 200 else en_data
                
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
                
                # 获取海报路径
                poster_path = en_data.get("poster_path", "")
                poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else ""
                
                result = {
                    "type": media_type,
                    "title": title,
                    "original_title": original_title,
                    "zh_title": zh_title,
                    "year": year,
                    "tmdb_id": str(tmdb_id),
                    "imdb_id": en_data.get("imdb_id") or en_data.get("external_ids", {}).get("imdb_id", ""),
                    "poster_path": poster_path,
                    "poster_url": poster_url
                }
                
                logger.info(f"成功获取TMDB信息: {title} (ID: {tmdb_id})")
                return result
                
            except ImportError:
                logger.warning("aiohttp库未安装，无法进行TMDB API调用")
                return None
            except Exception as e:
                logger.error(f"获取TMDB信息失败 (第 {attempt + 1} 次尝试): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # 指数退避
                else:
                    return None
        
        return None


class TelegramNotifier:
    def __init__(self):
        # 硬编码Telegram配置
        self.bot_token = "8467848454:AAEaNsEPqfGd28y786KLYDy6JuwXQ-rxJJk"
        self.chat_id = "6467626360"
        self.enabled = bool(self.bot_token and self.chat_id)
        
        if self.enabled:
            logger.info("Telegram通知已启用")
        else:
            logger.warning("Telegram通知未配置")
    
    async def send_message(self, message: str, parse_mode: str = "Markdown") -> bool:
        """发送Telegram消息"""
        if not self.enabled:
            logger.debug("Telegram通知未启用，跳过发送消息")
            return False
            
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            data = {
                "chat_id": self.chat_id,
                "text": message,
                "parse_mode": parse_mode
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=data)
                response.raise_for_status()
                
            logger.info("Telegram消息发送成功")
            return True
            
        except Exception as e:
            logger.error(f"发送Telegram消息失败: {e}")
            return False
    
    async def send_update_success(self, results: Dict[str, int], duration: float):
        """发送更新成功通知"""
        beijing_tz = timezone(timedelta(hours=8))
        now_beijing = datetime.now(beijing_tz)
        
        message = f"🎉 *榜单更新成功*\\n\\n"
        message += f"⏰ 更新时间: {now_beijing.strftime('%Y-%m-%d %H:%M:%S')} (北京时间)\\n"
        message += f"⏱️ 耗时: {duration:.1f}秒\\n\\n"
        message += f"📊 *更新结果:*\\n"
        
        for platform, count in results.items():
            message += f"• {platform}: {count}条记录\\n"
        
        await self.send_message(message)
    
    async def send_update_error(self, error: str, platform: str = None):
        """发送更新失败通知"""
        beijing_tz = timezone(timedelta(hours=8))
        now_beijing = datetime.now(beijing_tz)
        
        message = f"❌ *榜单更新失败*\\n\\n"
        message += f"⏰ 失败时间: {now_beijing.strftime('%Y-%m-%d %H:%M:%S')} (北京时间)\\n"
        if platform:
            message += f"🔧 失败平台: {platform}\\n"
        message += f"💥 错误信息: {error}\\n"
        
        await self.send_message(message)
    
    async def send_scheduler_status(self, status: Dict):
        """发送调度器状态通知"""
        beijing_tz = timezone(timedelta(hours=8))
        now_beijing = datetime.now(beijing_tz)
        
        message = f"📋 *调度器状态报告*\\n\\n"
        message += f"⏰ 报告时间: {now_beijing.strftime('%Y-%m-%d %H:%M:%S')} (北京时间)\\n"
        message += f"🔄 运行状态: {'✅ 运行中' if status.get('running') else '❌ 已停止'}\\n"
        
        if status.get('next_update'):
            next_update = datetime.fromisoformat(status['next_update'].replace('Z', '+00:00'))
            next_update_beijing = next_update.astimezone(beijing_tz)
            message += f"⏰ 下次更新: {next_update_beijing.strftime('%Y-%m-%d %H:%M:%S')} (北京时间)\\n"
        
        if status.get('last_update'):
            last_update = datetime.fromisoformat(status['last_update'].replace('Z', '+00:00'))
            last_update_beijing = last_update.astimezone(beijing_tz)
            message += f"🕐 上次更新: {last_update_beijing.strftime('%Y-%m-%d %H:%M:%S')} (北京时间)\\n"
        
        await self.send_message(message)

# 全局通知器实例
telegram_notifier = TelegramNotifier()


class AutoUpdateScheduler:
    def __init__(self):
        self.running = False
        self.update_interval = 3600  # 默认1小时
        self.last_update = None
        self.task = None
        
    async def start(self):
        """启动定时任务调度器"""
        if self.running:
            logger.info("调度器已在运行中")
            return
        self.running = True
        logger.info("定时任务调度器已启动")
        
        # 发送启动通知
        await telegram_notifier.send_message("🔄 *定时调度器已启动*\\n\\n⏰ 启动时间: " + 
                                           datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M:%S') + " (北京时间)\\n\\n📅 每天21:30自动更新所有榜单")
        
        try:
            # 创建后台任务
            self.task = asyncio.create_task(self._update_loop())
            logger.info(f"后台任务已创建: {self.task}")
        except Exception as e:
            logger.error(f"创建后台任务失败: {e}")
            self.running = False
            await telegram_notifier.send_update_error(f"调度器启动失败: {str(e)}")
            raise
    
    async def stop(self):
        """停止定时任务调度器"""
        self.running = False
        if self.task:
            self.task.cancel()
            self.task = None
        logger.info("定时任务调度器已停止")
        
        # 发送停止通知
        await telegram_notifier.send_message("⏹️ *定时调度器已停止*\\n\\n⏰ 停止时间: " + 
                                           datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M:%S') + " (北京时间)")
    
    
    def get_status(self) -> dict:
        """获取调度器状态"""
        from datetime import datetime, timezone, timedelta
        
        # 计算下次更新时间（明天21:30）
        beijing_tz = timezone(timedelta(hours=8))
        now_beijing = datetime.now(beijing_tz)
        today_2130 = now_beijing.replace(hour=21, minute=30, second=0, microsecond=0)
        
        if now_beijing >= today_2130:
            # 如果已经过了今天的21:30，下次更新是明天21:30
            next_update = today_2130 + timedelta(days=1)
        else:
            # 如果还没到今天的21:30，下次更新是今天21:30
            next_update = today_2130
        
        return {
            'running': self.running,
            'next_update': next_update.isoformat(),
            'last_update': self.last_update.isoformat() if self.last_update else None
        }
    
    def should_update(self) -> bool:
        """检查是否应该执行更新 - 每天北京21:30执行"""
        from datetime import datetime, timezone, timedelta
        
        # 获取当前北京时间
        beijing_tz = timezone(timedelta(hours=8))
        now_beijing = datetime.now(beijing_tz)
        
        # 检查是否已经过了今天的21:30
        today_2130 = now_beijing.replace(hour=21, minute=30, second=0, microsecond=0)
        
        # 如果当前时间已经过了今天的21:30，且上次更新不是今天
        if now_beijing >= today_2130:
            if not self.last_update:
                return True
            
            # 检查上次更新是否是今天 - 需要正确转换时区
            # 如果last_update已经是aware datetime，直接转换；否则认为是naive UTC
            if self.last_update.tzinfo:
                last_update_beijing = self.last_update.astimezone(beijing_tz)
            else:
                # naive datetime认为是UTC时间，先添加UTC时区再转换
                last_update_utc = self.last_update.replace(tzinfo=timezone.utc)
                last_update_beijing = last_update_utc.astimezone(beijing_tz)
            
            if last_update_beijing.date() < now_beijing.date():
                return True
        
        return False
    
    async def update_all_charts(self):
        """更新所有榜单数据"""
        start_time = time.time()
        logger.info("开始执行定时更新任务...")
        
        # 发送开始更新通知
        await telegram_notifier.send_message("🚀 *开始执行定时更新任务*\\n\\n⏰ 开始时间: " + 
                                           datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M:%S') + " (北京时间)")
        
        db = SessionLocal()
        results = {}
        error_occurred = False
        
        try:
            scraper = ChartScraper(db)
            
            # 执行所有平台的更新
            update_tasks = [
                ("烂番茄电影", scraper.update_rotten_movies),
                ("烂番茄TV", scraper.update_rotten_tv),
                ("Letterboxd", scraper.update_letterboxd_popular),
                ("Metacritic电影", scraper.update_metacritic_movies),
                ("Metacritic剧集", scraper.update_metacritic_shows),
                ("TMDB趋势", scraper.update_tmdb_trending_all_week),
                ("Trakt电影", scraper.update_trakt_movies_weekly),
                ("Trakt剧集", scraper.update_trakt_shows_weekly),
                ("IMDb", scraper.update_imdb_top10),
                ("豆瓣电影", scraper.update_douban_weekly_movie),
                ("豆瓣华语剧集", scraper.update_douban_weekly_chinese_tv),
                ("豆瓣全球剧集", scraper.update_douban_weekly_global_tv)
            ]
            
            for platform_name, update_func in update_tasks:
                try:
                    logger.info(f"开始更新 {platform_name}...")
                    count = await update_func()
                    results[platform_name] = count
                    logger.info(f"{platform_name} 更新完成，获得 {count} 条记录")
                except Exception as e:
                    logger.error(f"{platform_name} 更新失败: {e}")
                    results[platform_name] = 0
                    error_occurred = True
                    # 发送单个平台失败通知
                    await telegram_notifier.send_update_error(str(e), platform_name)
            
            # 使用UTC时间保存last_update
            self.last_update = datetime.now(timezone.utc)
            duration = time.time() - start_time
            
            if error_occurred:
                logger.warning("定时更新任务完成，但部分平台更新失败")
                await telegram_notifier.send_message(f"⚠️ *定时更新任务完成*\\n\\n⏱️ 耗时: {duration:.1f}秒\\n\\n部分平台更新失败，请查看详细日志")
            else:
                logger.info("定时更新任务完成")
                await telegram_notifier.send_update_success(results, duration)
                
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"定时更新任务失败: {e}")
            await telegram_notifier.send_update_error(str(e))
        finally:
            db.close()

    async def _update_loop(self):
        """更新循环 - 每分钟检查一次是否到了21:30"""
        while self.running:
            try:
                if self.should_update():
                    await self.update_all_charts()
                
                # 每分钟检查一次
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"更新循环出错: {e}")
                await asyncio.sleep(60)

# 全局调度器实例
scheduler_instance: Optional[AutoUpdateScheduler] = None

async def start_auto_scheduler():
    """启动全局调度器"""
    global scheduler_instance
    
    logger.info(f"启动调度器 - 当前scheduler_instance: {scheduler_instance}")
    
    if not scheduler_instance:
        scheduler_instance = AutoUpdateScheduler()
        logger.info("创建新的调度器实例")
    
    if not scheduler_instance.running:
        await scheduler_instance.start()
        logger.info(f"调度器启动完成，状态: {scheduler_instance.get_status()}")
    else:
        logger.info("调度器已在运行中")
    
    logger.info(f"返回调度器实例: {scheduler_instance}")
    return scheduler_instance

async def stop_auto_scheduler():
    """停止全局调度器"""
    global scheduler_instance
    if scheduler_instance:
        await scheduler_instance.stop()

def get_scheduler_status() -> dict:
    """获取调度器状态"""
    global scheduler_instance
    
    # 添加调试日志
    logger.info(f"获取调度器状态 - scheduler_instance: {scheduler_instance}")
    logger.info(f"scheduler_instance.running: {scheduler_instance.running if scheduler_instance else 'None'}")
    
    if scheduler_instance and scheduler_instance.running:
        status = scheduler_instance.get_status()
        logger.info(f"返回调度器状态: {status}")
        return status
    else:
        from datetime import datetime, timezone, timedelta
        
        # 计算下次更新时间（明天21:30）
        beijing_tz = timezone(timedelta(hours=8))
        now_beijing = datetime.now(beijing_tz)
        today_2130 = now_beijing.replace(hour=21, minute=30, second=0, microsecond=0)
        
        if now_beijing >= today_2130:
            next_update = today_2130 + timedelta(days=1)
        else:
            next_update = today_2130
        
        status = {
            'running': False,
            'next_update': next_update.isoformat(),
            'last_update': None
        }
        logger.info(f"返回默认状态: {status}")
        return status

