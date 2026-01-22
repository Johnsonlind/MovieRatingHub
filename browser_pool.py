# ==========================================
# 浏览器池管理模块
# ==========================================
import asyncio
import logging
import random
from typing import List, Optional, Dict, Any
from playwright.async_api import async_playwright, Browser, Playwright, BrowserContext

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
]

class BrowserPool:
    def __init__(self, max_browsers=5, max_contexts_per_browser=3, max_pages_per_context=5):
        self.max_browsers = max_browsers
        
        self.playwright: Optional[Playwright] = None
        self.browsers: List[Browser] = []
        self.available_browsers = asyncio.Queue()
        self.lock = asyncio.Lock()
        self.initialized = False
        
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
                            '--disable-site-isolation-trials',
                            '--blink-settings=imagesEnabled=false',
                            '--disable-remote-fonts'
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
            
            try:
                context = await browser.new_context()
                await context.close()
            except Exception:
                self.browser_crashes += 1
                logger.warning("检测到浏览器崩溃，正在替换...")
                try:
                    self.browsers.remove(browser)
                    new_browser = await self.playwright.chromium.launch(
                        headless=True,
                        args=[
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--blink-settings=imagesEnabled=false',
                            '--disable-remote-fonts'
                        ]
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
    
    async def create_stealth_context(self, browser: Browser, locale: str = 'en-US', timezone_id: str = 'America/New_York') -> BrowserContext:
        """创建反检测的浏览器上下文，包含真实的 User-Agent、Headers 和 JavaScript 注入"""
        selected_user_agent = random.choice(USER_AGENTS)
        
        context_options: Dict[str, Any] = {
            'viewport': {'width': 1920, 'height': 1080},
            'user_agent': selected_user_agent,
            'bypass_csp': True,
            'ignore_https_errors': True,
            'java_script_enabled': True,
            'has_touch': False,
            'is_mobile': False,
            'locale': locale,
            'timezone_id': timezone_id,
            'extra_http_headers': {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
            }
        }
        
        context = await browser.new_context(**context_options)
        
        await context.add_init_script("""
            // 隐藏 webdriver 属性
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false
            });
            
            // 覆盖 plugins 属性
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // 覆盖 languages 属性
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            
            // 添加 Chrome 对象（Chrome 浏览器特有）
            if (!window.chrome) {
                window.chrome = {
                    runtime: {}
                };
            }
            
            // 覆盖 permissions API
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // 覆盖 getBattery API
            if (navigator.getBattery) {
                navigator.getBattery = () => Promise.resolve({
                    charging: true,
                    chargingTime: 0,
                    dischargingTime: Infinity,
                    level: 1
                });
            }
            
            // 覆盖 WebGL 参数，隐藏自动化特征
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return 'Intel Inc.';
                }
                if (parameter === 37446) {
                    return 'Intel Iris OpenGL Engine';
                }
                return getParameter.call(this, parameter);
            };
            
            // 覆盖 toString 方法，隐藏自动化特征
            const originalToString = Function.prototype.toString;
            Function.prototype.toString = function() {
                if (this === navigator.getBattery || this === window.navigator.permissions.query) {
                    return 'function () { [native code] }';
                }
                return originalToString.call(this);
            };
        """)
        
        return context

browser_pool = BrowserPool(max_browsers=5, max_contexts_per_browser=3, max_pages_per_context=5)
