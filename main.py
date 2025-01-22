from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from ratings import extract_rating_info, get_tmdb_info
import asyncio
from starlette.background import BackgroundTask
from redis import asyncio as aioredis
import json
import time
from celery_app import celery_app
from prometheus_client import Counter, Histogram, Gauge, start_http_server
import psutil

# Redis 配置
REDIS_URL = "redis://:l1994z0912x@localhost:6379/0"
CACHE_EXPIRE_TIME = 24 * 60 * 60  # 24小时的缓存时间（秒）
redis = None

# 创建应用实例
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

# 定义监控指标
SCRAPE_REQUESTS = Counter(
    'rating_scrape_requests_total', 
    'Total rating scrape requests', 
    ['platform', 'media_type']
)

SCRAPE_ERRORS = Counter(
    'rating_scrape_errors_total', 
    'Total rating scrape errors', 
    ['platform', 'media_type', 'error_type']
)

SCRAPE_DURATION = Histogram(
    'rating_scrape_duration_seconds', 
    'Time spent scraping ratings',
    ['platform', 'media_type']
)

CACHE_HITS = Counter(
    'rating_cache_hits_total', 
    'Total cache hits', 
    ['platform', 'media_type']
)

# 系统资源指标
CPU_USAGE = Gauge('system_cpu_usage_percent', 'CPU usage in percent')
MEMORY_USAGE = Gauge('system_memory_usage_bytes', 'Memory usage in bytes')
DISK_USAGE = Gauge('system_disk_usage_percent', 'Disk usage in percent')

# 生命周期事件
@app.on_event("startup")
async def startup_event():
    """应用启动时初始化 Redis 连接"""
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

    # 启动 Prometheus 客户端
    start_http_server(8001)
    # 启动系统指标收集
    asyncio.create_task(update_system_metrics())

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时关闭 Redis 连接"""
    global redis
    if redis:
        await redis.close()
        print("Redis 连接已关闭")

# 辅助函数
async def get_cache(key: str):
    """从 Redis 获取缓存数据"""
    if not redis:
        return None
    try:
        data = await redis.get(key)
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        print(f"获取缓存出错: {e}")
        return None

async def set_cache(key: str, data: dict):
    """将数据存入 Redis 缓存"""
    if not redis:
        return
    try:
        await redis.setex(
            key,
            CACHE_EXPIRE_TIME,
            json.dumps(data)
        )
    except Exception as e:
        print(f"设置缓存出错: {e}")

# 添加 Celery 任务
@celery_app.task(name='fetch_rating')
def fetch_rating_task(type: str, platform: str, tmdb_info: dict):
    """Celery 任务：获取评分"""
    try:
        # 同步方式调用
        rating_info = extract_rating_info(type, platform, tmdb_info)
        return rating_info
    except Exception as e:
        print(f"获取 {platform} 评分时出错: {str(e)}")
        return None

# 路由处理函数
@app.get("/")
async def root():
    return {"status": "ok", "message": "RateFuse API is running"}

@app.get("/ratings/{platform}/{type}/{id}")
async def get_platform_rating(platform: str, type: str, id: str, request: Request):
    try:
        # 构建缓存键
        cache_key = f"rating:{platform}:{type}:{id}"
        
        # 检查缓存
        cached_data = await get_cache(cache_key)
        if cached_data:
            print(f"从缓存获取 {platform} 评分数据")
            return cached_data

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
        
        # 使用 Celery 任务处理评分信息
        task = fetch_rating_task.delay(type, platform, tmdb_info, request)
        rating_info = task.get(timeout=60)  # 60秒超时
        
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
            
        # 存入缓存
        await set_cache(cache_key, rating_info)
        return rating_info
            
    except Exception as e:
        if await request.is_disconnected():
            print(f"{platform} 请求在发生错误时被取消")
            return None
        print(f"获取 {platform} 评分时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 更新系统指标的异步任务
async def update_system_metrics():
    while True:
        CPU_USAGE.set(psutil.cpu_percent())
        memory = psutil.virtual_memory()
        MEMORY_USAGE.set(memory.used)
        disk = psutil.disk_usage('/')
        DISK_USAGE.set(disk.percent)
        await asyncio.sleep(15)
