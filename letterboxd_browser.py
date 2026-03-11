"""
Letterboxd 专用：全局常驻 Playwright Chromium + 共享 BrowserContext。

目标：
- FastAPI startup 初始化一次浏览器与共享 context
- 每次请求只创建/关闭 Page（context.new_page → goto → content → close）
- 通过 route 拦截大部分资源，降低加载时间
- Playwright 失败时自动 fallback 到 FlareSolverr（全局 session 复用）
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

import aiohttp
from playwright.async_api import async_playwright, Browser, BrowserContext, Playwright
from playwright.async_api import Error as PlaywrightError

logger = logging.getLogger(__name__)

# FlareSolverr 全局 session（启动时创建，关闭时销毁）
_flaresolverr_session_id: Optional[str] = None
_flaresolverr_url: str = ""
_flaresolverr_lock = asyncio.Lock()


class LetterboxdCloudflareChallenge(RuntimeError):
    pass


@dataclass(frozen=True)
class FetchResult:
    url: str
    final_url: str
    html: str
    elapsed_ms: int


_pw: Optional[Playwright] = None
_browser: Optional[Browser] = None
_context: Optional[BrowserContext] = None
_init_lock = asyncio.Lock()
_page_sema = asyncio.Semaphore(int(os.getenv("LETTERBOXD_MAX_PAGES", "8")))


def _parse_cookie_header(cookie_header: str, domain: str) -> list[dict]:
    cookie_header = (cookie_header or "").strip()
    if not cookie_header:
        return []
    out: list[dict] = []
    for part in cookie_header.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, _, value = part.partition("=")
        name, value = name.strip(), value.strip()
        if not name:
            continue
        out.append({"name": name, "value": value, "domain": domain, "path": "/"})
    return out


async def _route_filter(route):
    req = route.request
    url = (req.url or "").lower()

    if any(
        key in url
        for key in (
            "google-analytics",
            "analytics",
            "tracking",
            "telemetry",
            "doubleclick",
            "adservice",
            "facebook.com/tr",
            "/beacon/",
            "/stats/",
        )
    ):
        return await route.abort()

    # 只保留必要资源类型
    rt = req.resource_type
    if rt in ("document", "xhr", "fetch", "script"):
        return await route.continue_()

    # image / font / media / stylesheet 等全部拦截
    return await route.abort()


async def _is_cloudflare_challenge_html(title: str, html: str) -> bool:
    t = (title or "").lower()
    if "just a moment" in t:
        return True
    h = (html or "").lower()
    if "cf_chl_opt" in h or "challenge-platform" in h or "enable javascript and cookies to continue" in h:
        return True
    return False


def _is_letterboxd_rate_limit_html(html: str) -> bool:
    """
    检测 HTML 是否为 Letterboxd 的访问限制/封禁页面（非 Cloudflare）。
    当 FlareSolverr/Playwright 返回的页面是 Letterboxd 自身的 rate limit 页时，
    应返回 RATE_LIMIT 而非 NO_FOUND。
    """
    if not html or len(html) < 200:
        return False
    h = html.lower()
    # 仅匹配明确为限制页的短语，避免误判（如 "blocked" 在 ad-blocked 中常见）
    phrases = (
        "rate limit exceeded",
        "too many requests",
        "you are being rate limited",
        "please wait and try again",
        "temporarily blocked",
    )
    return any(p in h for p in phrases)


async def init_letterboxd_browser() -> None:
    global _pw, _browser, _context

    if _browser and _context:
        return

    async with _init_lock:
        if _browser and _context:
            return

        logger.info("Letterboxd: 初始化全局 Chromium + shared context ...")
        _pw = await async_playwright().start()

        launch_kwargs = dict(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--window-size=1280,720",
            ],
        )

        try:
            _browser = await _pw.chromium.launch(**launch_kwargs)
        except PlaywrightError as e:
            # macOS 上部分环境下 chromium_headless_shell 可能崩溃；尝试使用系统 Chrome 兜底
            channel = os.getenv("LETTERBOXD_BROWSER_CHANNEL", "chrome").strip() or "chrome"
            logger.warning(f"Letterboxd: Chromium 启动失败，尝试 channel={channel!r} 兜底: {type(e).__name__}: {e}")
            _browser = await _pw.chromium.launch(channel=channel, **launch_kwargs)

        ua = os.getenv(
            "LETTERBOXD_USER_AGENT",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        )
        _context = await _browser.new_context(
            viewport={"width": 1280, "height": 720},
            user_agent=ua,
            locale="en-US",
            timezone_id="America/New_York",
            ignore_https_errors=True,
        )

        # 资源拦截：context 级别，一次设置全局生效
        await _context.route("**/*", _route_filter)

        cookie_header = os.getenv("LETTERBOXD_COOKIE", "").strip()
        if cookie_header:
            cookies = _parse_cookie_header(cookie_header, domain=".letterboxd.com")
            if cookies:
                await _context.add_cookies(cookies)
                logger.info("Letterboxd: 已注入 LETTERBOXD_COOKIE 到 shared context")

        # 预热：建立会话（首次可能较慢，后续可复用 cf 清除状态/缓存）
        try:
            page = await _context.new_page()
            await page.goto("https://letterboxd.com/", wait_until="domcontentloaded", timeout=15000)
            await page.close()
        except Exception as e:
            logger.warning(f"Letterboxd: 预热失败（不阻断启动）: {type(e).__name__}: {e}")

        logger.info("Letterboxd: 全局浏览器初始化完成")


async def shutdown_letterboxd_browser() -> None:
    global _pw, _browser, _context

    async with _init_lock:
        ctx, br, pw = _context, _browser, _pw
        _context = None
        _browser = None
        _pw = None

    try:
        if ctx:
            await ctx.close()
    finally:
        try:
            if br:
                await br.close()
        finally:
            if pw:
                await pw.stop()


# ==========================================
# FlareSolverr 全局 Session（绕过 Cloudflare）
# ==========================================

def _get_flaresolverr_url() -> str:
    url = (os.environ.get("FLARESOLVERR_URL") or "").strip()
    if url and not url.endswith("/v1"):
        url = url.rstrip("/") + "/v1"
    return url


async def init_flaresolverr_session() -> bool:
    """
    应用启动时创建全局 FlareSolverr session，所有后续请求复用。
    未配置 FLARESOLVERR_URL 时跳过。
    """
    global _flaresolverr_session_id, _flaresolverr_url
    url = _get_flaresolverr_url()
    if not url:
        logger.info("Letterboxd: 未配置 FLARESOLVERR_URL，跳过 FlareSolverr session 初始化")
        return False

    async with _flaresolverr_lock:
        if _flaresolverr_session_id:
            return True

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json={"cmd": "sessions.create"},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                data = await resp.json()

        if data.get("status") != "ok":
            msg = data.get("message") or data.get("error") or "unknown"
            logger.warning(f"Letterboxd: FlareSolverr sessions.create 失败: {msg}")
            return False

        sid = data.get("session") or ""
        if not sid:
            logger.warning("Letterboxd: FlareSolverr sessions.create 未返回 session_id")
            return False

        async with _flaresolverr_lock:
            _flaresolverr_session_id = sid
            _flaresolverr_url = url

        logger.info(f"Letterboxd: FlareSolverr 全局 session 已创建: {sid[:8]}...")
        return True
    except Exception as e:
        logger.warning(f"Letterboxd: FlareSolverr session 创建失败: {type(e).__name__}: {e}")
        return False


async def destroy_flaresolverr_session() -> None:
    """应用关闭时销毁 FlareSolverr session"""
    global _flaresolverr_session_id, _flaresolverr_url
    async with _flaresolverr_lock:
        sid, url = _flaresolverr_session_id, _flaresolverr_url
        _flaresolverr_session_id = None
        _flaresolverr_url = ""

    if not sid or not url:
        return

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json={"cmd": "sessions.destroy", "session": sid},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                data = await resp.json()
        if data.get("status") == "ok":
            logger.info("Letterboxd: FlareSolverr session 已销毁")
        else:
            logger.warning(f"Letterboxd: FlareSolverr sessions.destroy 返回: {data}")
    except Exception as e:
        logger.warning(f"Letterboxd: FlareSolverr session 销毁异常: {type(e).__name__}: {e}")


async def fetch_via_flaresolverr(url: str) -> Optional[FetchResult]:
    """
    使用全局 FlareSolverr session 拉取页面。
    maxTimeout=10000（10 秒），复用 session 无需重复创建浏览器。
    若无 session 则尝试懒加载创建（应对 startup 未成功等情况）。
    """
    global _flaresolverr_session_id, _flaresolverr_url
    async with _flaresolverr_lock:
        sid, fs_url = _flaresolverr_session_id, _flaresolverr_url

    if not sid or not fs_url:
        # 懒加载：首次请求时尝试创建 session
        if await init_flaresolverr_session():
            async with _flaresolverr_lock:
                sid, fs_url = _flaresolverr_session_id, _flaresolverr_url
        if not sid or not fs_url:
            return None

    start = time.perf_counter()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                fs_url,
                json={
                    "cmd": "request.get",
                    "session": sid,
                    "url": url,
                    "maxTimeout": 30000,  # Cloudflare 挑战有时需 15-30 秒，10 秒易超时
                },
                timeout=aiohttp.ClientTimeout(total=35),
            ) as resp:
                data = await resp.json()

        if data.get("status") != "ok" or not data.get("solution"):
            msg = data.get("message") or data.get("error") or "unknown"
            logger.warning(f"Letterboxd FlareSolverr request.get 失败: {msg}")
            return None

        sol = data["solution"]
        html = sol.get("response") or sol.get("body") or ""
        final_url = sol.get("url") or url
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        # FlareSolverr 返回 ok 且 "Challenge solved!" 时信任其结果。
        # 勿在此做 HTML 校验：Letterboxd 正常页也含 cf 脚本、"blocked" 等词，易误判。
        return FetchResult(url=url, final_url=final_url, html=html, elapsed_ms=elapsed_ms)
    except Exception as e:
        logger.warning(f"Letterboxd FlareSolverr 请求异常: {type(e).__name__}: {e}")
        return None


async def fetch_letterboxd(url: str, *, timeout_ms: int = 8000, wait_until: str = "domcontentloaded") -> FetchResult:
    """
    拉取 Letterboxd 页面 HTML。
    流程：先 Playwright → 失败则自动 fallback 到 FlareSolverr（全局 session 复用）。
    """
    last_error: Optional[Exception] = None

    # 1. 先尝试 Playwright
    try:
        await init_letterboxd_browser()
        assert _context is not None

        start = time.perf_counter()
        async with _page_sema:
            page = await _context.new_page()
            try:
                page.set_default_timeout(timeout_ms)
                await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
                await asyncio.sleep(0.05)
                title = await page.title()
                html = await page.content()

                if await _is_cloudflare_challenge_html(title, html):
                    await asyncio.sleep(0.8)
                    title2 = await page.title()
                    html2 = await page.content()
                    if await _is_cloudflare_challenge_html(title2, html2):
                        raise LetterboxdCloudflareChallenge("Cloudflare challenge page detected")
                    title, html = title2, html2

                elapsed_ms = int((time.perf_counter() - start) * 1000)
                return FetchResult(url=url, final_url=page.url, html=html, elapsed_ms=elapsed_ms)
            finally:
                await page.close()
    except LetterboxdCloudflareChallenge as e:
        last_error = e
        logger.debug("Letterboxd: Playwright 遭遇 Cloudflare，fallback FlareSolverr")
    except Exception as e:
        last_error = e
        logger.debug(f"Letterboxd: Playwright 失败 ({type(e).__name__})，fallback FlareSolverr")

    # 2. Fallback: FlareSolverr（复用全局 session）
    result = await fetch_via_flaresolverr(url)
    if result:
        logger.debug(f"Letterboxd: FlareSolverr 成功返回 ({result.elapsed_ms}ms)")
        return result

    # 3. 两者均失败，抛出原错误
    if last_error:
        raise last_error
    raise LetterboxdCloudflareChallenge("FlareSolverr 未配置或请求失败")

