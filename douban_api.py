import re
import time
import asyncio
import aiohttp
from bs4 import BeautifulSoup
from typing import List, Optional
from dataclasses import dataclass
from urllib.parse import quote

@dataclass
class DoubanSubject:
    sid: str = ''
    name: str = ''
    year: int = 0
    rating: float = 0.0
    category: str = ''
    season_number: Optional[int] = None
    
class DoubanAPI:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36',
            'Referer': 'https://movie.douban.com/'
        }
        self.last_request_time = 0
        self.min_interval = 0.2
        
    async def _request(self, url: str) -> str:
        now = time.time()
        if now - self.last_request_time < self.min_interval:
            await asyncio.sleep(self.min_interval)
        self.last_request_time = now
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=self.headers) as response:
                return await response.text()
                
    async def search(self, keyword: str, tmdb_info: dict = None) -> List[DoubanSubject]:
        results = []
        url = f'https://www.douban.com/search?cat=1002&q={quote(keyword)}'
        
        html = await self._request(url)
        soup = BeautifulSoup(html, 'html.parser')
        
        for item in soup.select('div.result-list .result'):
            try:
                title_elem = item.select_one('div.title a')
                title_text = title_elem.text.strip()
                
                # 解析季数信息
                season_match = re.search(r'第(\d+)季', title_text)
                season_number = int(season_match.group(1)) if season_match else None
                
                # 解析年份
                year_match = re.search(r'\((\d{4})\)', title_text)
                year = int(year_match.group(1)) if year_match else 0
                
                # 获取基本信息
                rating = item.select_one('div.rating-info>.rating_nums')
                rating = float(rating.text) if rating else 0
                
                sid_match = re.search(r'subject/(\d+)/', title_elem['href'])
                sid = sid_match.group(1) if sid_match else ''
                
                # 清理标题（移除季数和年份信息）
                clean_title = re.sub(r'第\d+季.*?\(\d{4}\)', '', title_text).strip()
                
                # 如果提供了TMDB信息，进行季数匹配
                if tmdb_info and tmdb_info.get('type') == 'tv':
                    for season in tmdb_info.get('seasons', []):
                        if (season.get('season_number') == season_number and 
                            str(season.get('air_date')) == str(year)):
                            
                            subject = DoubanSubject(
                                sid=sid,
                                name=clean_title,
                                rating=rating,
                                category='电视剧',
                                year=year,
                                season_number=season_number
                            )
                            results.append(subject)
                            break
                else:
                    # 非剧集或无TMDB信息时的处理
                    subject = DoubanSubject(
                        sid=sid,
                        name=clean_title,
                        rating=rating,
                        category='电视剧' if season_number else '电影',
                        year=year,
                        season_number=season_number
                    )
                    results.append(subject)
                    
            except Exception as e:
                print(f"解析搜索结果时出错: {e}")
                continue
                
        return results 