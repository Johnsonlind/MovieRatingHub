# ==========================================
# Letterboxd 反检测工具模块
# 一劳永逸解决自动化访问检测问题
# ==========================================
import asyncio
import random
import logging
import os
from typing import Optional, List, Dict
from playwright.async_api import Browser, BrowserContext, Page

logger = logging.getLogger(__name__)

# 从环境变量读取 Letterboxd Cookie
LETTERBOXD_COOKIE = os.getenv("LETTERBOXD_COOKIE", "")


def parse_cookie_string(cookie_string: str) -> List[Dict]:
    """
    解析 Cookie 字符串为 Playwright Cookie 格式
    例如: "name1=value1; name2=value2" -> [{"name": "name1", "value": "value1", ...}, ...]
    """
    if not cookie_string:
        return []
    
    cookies = []
    for item in cookie_string.split(';'):
        item = item.strip()
        if not item or '=' not in item:
            continue
        
        name, value = item.split('=', 1)
        name = name.strip()
        value = value.strip()
        
        # 创建 Cookie 对象
        cookie = {
            "name": name,
            "value": value,
            "domain": ".letterboxd.com",  # 支持子域名
            "path": "/",
            "httpOnly": False,
            "secure": True,
            "sameSite": "Lax"
        }
        
        # 特殊处理 cf_clearance cookie（Cloudflare 验证通过凭证）
        if name == "cf_clearance":
            cookie["httpOnly"] = False
            cookie["secure"] = True
            logger.info("✓ 检测到 cf_clearance cookie，将用于绕过 Cloudflare 验证")
        
        cookies.append(cookie)
    
    return cookies

# 真实的浏览器启动参数（移除所有自动化标志）
STEALTH_BROWSER_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--disable-features=BlockInsecurePrivateNetworkRequests',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps',
    '--mute-audio',
    '--no-default-browser-check',
    '--autoplay-policy=user-gesture-required',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-datasaver-prompt',
    '--disable-domain-reliability',
    '--disable-features=AudioServiceOutOfProcess',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-popup-blocking',
    '--disable-print-preview',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-setuid-sandbox',
    '--disable-speech-api',
    '--disable-sync',
    '--hide-scrollbars',
    '--ignore-gpu-blacklist',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-pings',
    '--no-zygote',
    '--use-gl=swiftshader',
    '--window-size=1920,1080',
]

# 增强的反检测脚本
ENHANCED_STEALTH_SCRIPT = """
    // 移除 webdriver 标志
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
    });
    
    // 添加 Chrome 对象
    window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
    };
    
    // 伪造插件
    Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
    });
    
    // 伪造语言
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
    });
    
    // 伪造权限
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
    );
    
    // 覆盖 WebDriver 相关属性
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
    });
    
    // 伪造 Chrome 版本
    Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.',
    });
    
    // 伪造硬件并发
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
    });
    
    // 伪造设备内存
    Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
    });
    
    // 覆盖 toString 方法
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
    
    // 伪造 Canvas 指纹
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    const getImageData = CanvasRenderingContext2D.prototype.getImageData;
    
    // 移除自动化相关属性
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
"""

# 真实的 User-Agent 列表
REAL_USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]


async def create_stealth_context(browser: Browser, user_agent: Optional[str] = None, cookie_string: Optional[str] = None) -> BrowserContext:
    """
    创建带有完整反检测设置的浏览器上下文
    
    Args:
        browser: Playwright Browser 实例
        user_agent: 可选的 User-Agent 字符串
        cookie_string: 可选的 Cookie 字符串（格式: "name1=value1; name2=value2"）
    """
    if not user_agent:
        user_agent = random.choice(REAL_USER_AGENTS)
    
    # 优先使用传入的 cookie_string，否则使用环境变量
    cookie_str = cookie_string or LETTERBOXD_COOKIE
    
    context = await browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        user_agent=user_agent,
        locale='en-US',
        timezone_id='America/New_York',
        permissions=['geolocation'],
        geolocation={'latitude': 40.7128, 'longitude': -74.0060},  # New York
        color_scheme='light',
        extra_http_headers={
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
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
        }
    )
    
    # 如果有 Cookie，添加到 context
    if cookie_str:
        cookies = parse_cookie_string(cookie_str)
        if cookies:
            await context.add_cookies(cookies)
            cookie_names = [c["name"] for c in cookies]
            logger.info(f"✓ 已添加 {len(cookies)} 个 Cookie: {', '.join(cookie_names)}")
            if any(c["name"] == "cf_clearance" for c in cookies):
                logger.info("✓ 包含 cf_clearance cookie，可绕过 Cloudflare 验证")
    
    # 注入增强的反检测脚本
    await context.add_init_script(ENHANCED_STEALTH_SCRIPT)
    
    return context


async def simulate_human_behavior(page: Page):
    """
    模拟真实用户行为，包括鼠标移动、滚动等
    """
    try:
        # 随机延迟
        await asyncio.sleep(random.uniform(0.5, 1.5))
        
        # 模拟鼠标移动
        viewport_size = page.viewport_size
        if viewport_size:
            for _ in range(random.randint(2, 4)):
                x = random.randint(100, viewport_size['width'] - 100)
                y = random.randint(100, viewport_size['height'] - 100)
                await page.mouse.move(x, y, steps=random.randint(10, 20))
                await asyncio.sleep(random.uniform(0.1, 0.3))
        
        # 模拟滚动
        scroll_amount = random.randint(200, 500)
        await page.evaluate(f"window.scrollBy(0, {scroll_amount})")
        await asyncio.sleep(random.uniform(0.2, 0.5))
        
        # 随机滚动回来一点
        if random.random() > 0.5:
            scroll_back = random.randint(50, 150)
            await page.evaluate(f"window.scrollBy(0, -{scroll_back})")
            await asyncio.sleep(random.uniform(0.1, 0.3))
            
    except Exception as e:
        logger.debug(f"模拟用户行为时出错（可忽略）: {e}")


async def navigate_with_stealth(page: Page, url: str, wait_until: str = 'domcontentloaded', timeout: int = 30000):
    """
    使用反检测技术导航到页面
    """
    try:
        # 先访问主页建立会话（可选，但有助于建立信任）
        if 'letterboxd.com' in url and not url.endswith('/'):
            # 可以访问一次主页建立 cookies
            pass
        
        # 导航到目标页面
        await page.goto(url, wait_until=wait_until, timeout=timeout)
        
        # 等待页面加载
        await asyncio.sleep(random.uniform(0.5, 1.0))
        
        # 模拟用户行为
        await simulate_human_behavior(page)
        
        # 等待网络空闲（但不要太久，避免超时）
        try:
            await page.wait_for_load_state('networkidle', timeout=10000)
        except Exception:
            # 网络空闲超时是正常的，继续执行
            pass
        
        return True
    except Exception as e:
        logger.error(f"导航到 {url} 失败: {e}")
        raise


def get_stealth_browser_args() -> list:
    """
    获取反检测浏览器启动参数
    """
    return STEALTH_BROWSER_ARGS.copy()


async def check_verification_page(page: Page) -> bool:
    """
    检查页面是否是验证页面
    """
    try:
        content = await page.content()
        content_lower = content.lower()
        
        verification_indicators = [
            'verify you are human',
            'please verify you are human',
            'cloudflare',
            'checking your browser',
            'just a moment',
            'ddos protection',
            'access denied',
            'you are being rate limited',
            'captcha',
            'challenge',
        ]
        
        for indicator in verification_indicators:
            if indicator in content_lower:
                logger.warning(f"检测到验证页面，包含关键词: {indicator}")
                return True
        
        # 检查特定选择器
        verification_selectors = [
            '.cf-browser-verification',
            '#challenge-form',
            '.challenge-container',
            '[data-ray]',  # Cloudflare ray ID
        ]
        
        for selector in verification_selectors:
            element = await page.query_selector(selector)
            if element:
                logger.warning(f"检测到验证页面，找到选择器: {selector}")
                return True
        
        return False
    except Exception as e:
        logger.error(f"检查验证页面时出错: {e}")
        return False
