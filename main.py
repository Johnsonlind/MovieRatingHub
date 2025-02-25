from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from ratings import extract_rating_info, get_tmdb_info, RATING_STATUS, search_platform
from redis import asyncio as aioredis
import json

# Redis 配置
REDIS_URL = "redis://:l1994z0912x@localhost:6379/0"
CACHE_EXPIRE_TIME = 24 * 60 * 60
redis = None

# 创建应用实例
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://ratefuse.cn",
        "https://ratefuse.cn",
        "http://www.ratefuse.cn",
        "https://www.ratefuse.cn"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 健康检查端点
@app.get("/")
async def root():
    return {"status": "ok", "message": "RateFuse API is running"}

# 缓存辅助函数
async def get_cache(key: str):
    """从 Redis 获取缓存数据"""
    print(f"\n=== Redis缓存检查 ===")
    print(f"缓存键: {key}")
    print(f"Redis连接状态: {'已连接' if redis else '未连接'}")
    
    if not redis:
        print("Redis未连接，跳过缓存")
        return None
        
    try:
        data = await redis.get(key)
        print(f"原始缓存数据: {data}")
        
        if data:
            data = json.loads(data)
            # 只返回成功获取的数据
            print(f"解析后的缓存数据: {json.dumps(data, ensure_ascii=False)}")
            if isinstance(data, dict) and data.get("status") == RATING_STATUS["SUCCESSFUL"]:
                print("返回有效缓存数据")
                return data
            print(f"缓存数据无效，状态: {data.get('status')}")
        return None
    except Exception as e:
        print(f"获取缓存出错: {e}")
        return None

async def set_cache(key: str, data: dict):
    """将数据存入 Redis 缓存"""
    if not redis:
        return
    try:
        # 只缓存成功获取的数据
        if isinstance(data, dict) and data.get("status") == RATING_STATUS["SUCCESSFUL"]:
            await redis.setex(
                key,
                CACHE_EXPIRE_TIME,
                json.dumps(data)
            )
    except Exception as e:
        print(f"设置缓存出错: {e}")

# 主要业务端点
@app.get("/ratings/{platform}/{type}/{id}")
async def get_platform_rating(platform: str, type: str, id: str, request: Request):
    """获取指定平台的评分信息"""
    try:
        if await request.is_disconnected():
            print(f"{platform} 请求已在开始时被取消")
            return None
        cache_key = f"rating:{platform}:{type}:{id}"
        cached_data = await get_cache(cache_key)
        if cached_data:
            print(f"从缓存获取 {platform} 评分数据")
            return cached_data

        tmdb_info = await get_tmdb_info(id, type, request)
        if not tmdb_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在获取TMDB信息时被取消")
                return None
            raise HTTPException(status_code=404, detail="无法获取 TMDB 信息")

        search_results = await search_platform(platform, tmdb_info, request)
        print(f"搜索结果: {search_results}")

        rating_info = await extract_rating_info(type, platform, tmdb_info, search_results, request)
        print(f"评分信息: {rating_info}")

        if await request.is_disconnected():
            print(f"{platform} 请求在获取评分信息后被取消")
            return None

        if not rating_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在处理评分信息时被取消")
                return None

            raise HTTPException(status_code=404, detail=f"未找到 {platform} 的评分信息")

        await set_cache(cache_key, rating_info)
        return rating_info

    except Exception as e:
        if await request.is_disconnected():
            print(f"{platform} 请求在发生错误时被取消")
            return None
        print(f"获取 {platform} 评分时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    global redis
    try:
        redis = await aioredis.from_url(
            REDIS_URL,
            encoding='utf-8',
            decode_responses=True
        )
        print("Redis 连接成功初始化")

    except Exception as e:
        print(f"Redis 连接初始化失败: {e}")
        redis = None