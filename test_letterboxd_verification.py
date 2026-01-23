#!/usr/bin/env python3
# ==========================================
# Letterboxd 验证页面截图测试脚本
# ==========================================
import asyncio
import os
from datetime import datetime
from playwright.async_api import async_playwright
from stealth_helper import create_stealth_context, navigate_with_stealth, check_verification_page
from dotenv import load_dotenv

load_dotenv()

async def test_letterboxd_verification():
    """测试 Letterboxd 访问并截图验证页面"""
    
    # 创建截图目录
    screenshot_dir = "letterboxd_screenshots"
    os.makedirs(screenshot_dir, exist_ok=True)
    
    async with async_playwright() as p:
        # 使用反检测浏览器启动参数
        from stealth_helper import get_stealth_browser_args
        
        browser = await p.chromium.launch(
            headless=True,  # 使用有头模式，方便观察
            args=get_stealth_browser_args()
        )
        
        try:
            # 创建反检测上下文
            context = await create_stealth_context(browser)
            page = await context.new_page()
            
            print("=" * 60)
            print("开始测试 Letterboxd 访问...")
            print("=" * 60)
            
            # 测试 1: 访问主页
            print("\n[测试 1] 访问 Letterboxd 主页...")
            try:
                await page.goto('https://letterboxd.com/', wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(3)  # 等待页面加载
                
                # 检查是否是验证页面
                is_verification = await check_verification_page(page)
                
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                if is_verification:
                    screenshot_path = f"{screenshot_dir}/homepage_verification_{timestamp}.png"
                    await page.screenshot(path=screenshot_path, full_page=True)
                    print(f"⚠️  检测到验证页面！截图已保存: {screenshot_path}")
                    
                    # 保存页面 HTML
                    html_path = f"{screenshot_dir}/homepage_verification_{timestamp}.html"
                    with open(html_path, 'w', encoding='utf-8') as f:
                        f.write(await page.content())
                    print(f"📄 页面 HTML 已保存: {html_path}")
                else:
                    screenshot_path = f"{screenshot_dir}/homepage_normal_{timestamp}.png"
                    await page.screenshot(path=screenshot_path, full_page=True)
                    print(f"✓ 主页正常访问，截图已保存: {screenshot_path}")
                    
            except Exception as e:
                print(f"❌ 访问主页失败: {e}")
            
            # 测试 2: 访问搜索页
            print("\n[测试 2] 访问 Letterboxd 搜索页...")
            search_url = "https://letterboxd.com/search/tmdb:1306368/"
            try:
                await navigate_with_stealth(page, search_url, wait_until='domcontentloaded', timeout=30000, wait_for_verification=False)
                await asyncio.sleep(3)  # 等待页面加载
                
                # 检查是否是验证页面
                is_verification = await check_verification_page(page)
                
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                if is_verification:
                    screenshot_path = f"{screenshot_dir}/search_verification_{timestamp}.png"
                    await page.screenshot(path=screenshot_path, full_page=True)
                    print(f"⚠️  检测到验证页面！截图已保存: {screenshot_path}")
                    
                    # 保存页面 HTML
                    html_path = f"{screenshot_dir}/search_verification_{timestamp}.html"
                    with open(html_path, 'w', encoding='utf-8') as f:
                        f.write(await page.content())
                    print(f"📄 页面 HTML 已保存: {html_path}")
                    
                    # 尝试等待验证完成
                    print("\n等待 Cloudflare 自动验证完成（最多 20 秒）...")
                    from stealth_helper import wait_for_cloudflare_verification
                    verification_passed = await wait_for_cloudflare_verification(page, max_wait=20)
                    
                    if verification_passed:
                        timestamp2 = datetime.now().strftime("%Y%m%d_%H%M%S")
                        screenshot_path2 = f"{screenshot_dir}/search_after_verification_{timestamp2}.png"
                        await page.screenshot(path=screenshot_path2, full_page=True)
                        print(f"✓ 验证完成！截图已保存: {screenshot_path2}")
                    else:
                        print("⚠️  验证等待超时")
                else:
                    screenshot_path = f"{screenshot_dir}/search_normal_{timestamp}.png"
                    await page.screenshot(path=screenshot_path, full_page=True)
                    print(f"✓ 搜索页正常访问，截图已保存: {screenshot_path}")
                    
            except Exception as e:
                print(f"❌ 访问搜索页失败: {e}")
                import traceback
                traceback.print_exc()
            
            # 保持浏览器打开 10 秒，方便观察
            print("\n浏览器将保持打开 10 秒，方便观察...")
            await asyncio.sleep(10)
            
        finally:
            await browser.close()
    
    print("\n" + "=" * 60)
    print("测试完成！所有截图保存在:", screenshot_dir)
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_letterboxd_verification())
