import asyncio
import logging
from typing import Dict, List, Optional, Tuple
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright

logger = logging.getLogger(__name__)

class BrowserPool:
    def __init__(self, max_browsers=3, max_contexts_per_browser=2, max_pages_per_context=3):
        self.max_browsers = max_browsers
        self.max_contexts_per_browser = max_contexts_per_browser
        self.max_pages_per_context = max_pages_per_context
        
        self.playwright: Optional[Playwright] = None
        self.browsers: List[Browser] = []
        self.available_browsers = asyncio.Queue()
        self.lock = asyncio.Lock()
        self.initialized = False
        
        # 监控指标
        self.total_requests = 0
        self.failed_requests = 0
        self.browser_crashes = 0
        
    async def initialize(self):
        """初始化浏览器池"""
        if self.initialized:
            return
            
        async with self.lock:
            if self.initialized:
                return
                
            logger.info("正在初始化浏览器池...")
            self.playwright = await async_playwright().start()
            
            for i in range(self.max_browsers):
                try:
                    browser = await self.playwright.chromium.launch(
                        headless=True,
                        args=[
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-gpu',
                            '--disable-extensions',
                            '--disable-audio-output',
                            '--disable-web-security',
                            '--disable-features=site-per-process',
                            '--disable-site-isolation-trials'
                        ]
                    )
                    self.browsers.append(browser)
                    await self.available_browsers.put(browser)
                    logger.info(f"浏览器 {i+1}/{self.max_browsers} 已启动")
                except Exception as e:
                    logger.error(f"启动浏览器 {i+1} 失败: {str(e)}")
                    
            self.initialized = True
            logger.info(f"浏览器池初始化完成，共 {len(self.browsers)} 个浏览器实例")
            
    async def get_browser(self) -> Browser:
        """从池中获取一个浏览器实例"""
        if not self.initialized:
            await self.initialize()
            
        return await self.available_browsers.get()
        
    async def release_browser(self, browser: Browser):
        """将浏览器实例归还到池中"""
        await self.available_browsers.put(browser)
        
    async def execute_in_browser(self, callback, *args, **kwargs):
        """在浏览器中执行操作并自动处理浏览器的获取和释放"""
        self.total_requests += 1
        browser = await self.get_browser()
        
        try:
            result = await callback(browser, *args, **kwargs)
            return result
        except Exception as e:
            self.failed_requests += 1
            logger.error(f"浏览器操作失败: {str(e)}")
            
            # 检查浏览器是否崩溃
            try:
                # 尝试创建一个上下文来检查浏览器是否仍然可用
                context = await browser.new_context()
                await context.close()
            except Exception:
                # 浏览器已崩溃，替换它
                self.browser_crashes += 1
                logger.warning("检测到浏览器崩溃，正在替换...")
                try:
                    self.browsers.remove(browser)
                    new_browser = await self.playwright.chromium.launch(
                        headless=True,
                        args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    )
                    self.browsers.append(new_browser)
                    browser = new_browser
                except Exception as e2:
                    logger.error(f"替换崩溃的浏览器失败: {str(e2)}")
            
            raise e
        finally:
            await self.release_browser(browser)
            
    async def cleanup(self):
        """清理所有浏览器资源"""
        logger.info("正在清理浏览器池...")
        for browser in self.browsers:
            try:
                await browser.close()
            except Exception as e:
                logger.error(f"关闭浏览器失败: {str(e)}")
                
        if self.playwright:
            await self.playwright.stop()
            
        self.initialized = False
        logger.info("浏览器池已清理")
        
    def get_stats(self):
        """获取浏览器池的统计信息"""
        return {
            "total_requests": self.total_requests,
            "failed_requests": self.failed_requests,
            "browser_crashes": self.browser_crashes,
            "active_browsers": len(self.browsers),
            "available_browsers": self.available_browsers.qsize()
        }

# 全局浏览器池实例
browser_pool = BrowserPool(max_browsers=3)
