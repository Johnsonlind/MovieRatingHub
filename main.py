from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from ratings import extract_rating_info, get_tmdb_info, RATING_STATUS
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
            try:
                data = json.loads(data)
                print(f"解析后的缓存数据: {json.dumps(data, ensure_ascii=False)}")
                if isinstance(data, dict) and data.get("status") == RATING_STATUS["SUCCESSFUL"]:
                    print("返回有效缓存数据")
                    return data
                print(f"缓存数据无效，状态: {data.get('status')}")
            except json.JSONDecodeError as e:
                print(f"缓存数据JSON解析失败: {e}")
        return None
    except Exception as e:
        print(f"获取缓存出错: {e}")
        return None

async def set_cache(key: str, data: dict):
    """设置 Redis 缓存数据"""
    print(f"\n=== 设置Redis缓存 ===")
    print(f"缓存键: {key}")
    
    if not redis:
        print("Redis未连接，跳过缓存设置")
        return
        
    try:
        # 只缓存成功获取的数据
        if data.get("status") == RATING_STATUS["SUCCESSFUL"]:
            json_data = json.dumps(data, ensure_ascii=False)
            print(f"准备缓存数据: {json_data}")
            await redis.set(key, json_data, ex=CACHE_EXPIRE_TIME)
            print("缓存设置成功")
        else:
            print(f"数据状态不是成功({data.get('status')})，不进行缓存")
    except Exception as e:
        print(f"设置缓存失败: {e}")

# 添加 Redis 连接初始化函数
async def init_redis():
    global redis
    try:
        print("正在连接 Redis...")
        redis = await aioredis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
        print("Redis 连接成功")
    except Exception as e:
        print(f"Redis 连接失败: {e}")
        redis = None

# 在应用启动时初始化 Redis
@app.on_event("startup")
async def startup_event():
    await init_redis()

# 在应用关闭时关闭 Redis 连接
@app.on_event("shutdown")
async def shutdown_event():
    if redis:
        await redis.close()

# 主要业务端点
@app.get("/ratings/{platform}/{type}/{id}")
async def get_platform_rating(platform: str, type: str, id: str, request: Request):
    """获取指定平台的评分信息"""
    try:
        # 构建缓存键
        cache_key = f"rating:{platform}:{type}:{id}"
        
        # 尝试获取缓存
        cached_data = await get_cache(cache_key)
        if cached_data:
            print(f"返回缓存的{platform}评分数据")
            return cached_data
            
        print(f"缓存未命中，开始获取{platform}评分数据")
        
        # 获取新数据
        tmdb_info = await get_tmdb_info(type, id)
        if not tmdb_info:
            raise HTTPException(status_code=404, detail="无法获取TMDB信息")
            
        # 这里需要传入 Request 对象，而不是字符串
        rating_info = await extract_rating_info(
            media_type=type,
            platform=platform,
            tmdb_info=tmdb_info,
            search_results=None,  # 如果需要搜索结果，在这里添加
            request=request  # 确保这里传入的是 FastAPI 的 Request 对象
        )
        
        # 设置缓存
        if rating_info:
            await set_cache(cache_key, rating_info)
            
        return rating_info
        
    except Exception as e:
        print(f"获取{platform}评分失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
