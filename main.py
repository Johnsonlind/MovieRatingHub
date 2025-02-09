from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from ratings import extract_rating_info, get_tmdb_info
import asyncio
from starlette.background import BackgroundTask
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # 本地开发环境
        "http://ratefuse.cn",     # 生产环境
        "https://ratefuse.cn",    # HTTPS
        "http://www.ratefuse.cn", # www 子域名
        "https://www.ratefuse.cn"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
async def root():
    return {"status": "ok", "message": "RateFuse API is running"}
@app.get("/ratings/{platform}/{type}/{id}")
async def get_platform_rating(platform: str, type: str, id: str, request: Request):
    try:
        # 检查请求是否已被取消
        if await request.is_disconnected():
            print(f"{platform} 请求已在开始时被取消")
            return None
            
        # 获取 TMDB 信息
        tmdb_info = await get_tmdb_info(id, request)
        if not tmdb_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在获取TMDB信息时被取消")
                return None
            raise HTTPException(status_code=404, detail="无法获取 TMDB 信息")
            
        # 获取单个平台的评分
        rating_info = await extract_rating_info(type, platform, tmdb_info, request)
        
        # 再次检查请求是否已被取消
        if await request.is_disconnected():
            print(f"{platform} 请求在获取评分信息后被取消")
            return None
            
        if not rating_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在处理评分信息时被取消")
                return None
            raise HTTPException(
                status_code=404, 
                detail=f"未找到 {platform} 的评分信息"
            )
            
        return rating_info
        
    except Exception as e:
        if await request.is_disconnected():
            print(f"{platform} 请求在发生错误时被取消")
            return None
        print(f"获取 {platform} 评分时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
