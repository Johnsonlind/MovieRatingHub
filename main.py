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
import logging
from logging.handlers import RotatingFileHandler

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
MEMORY_PERCENT = Gauge('system_memory_usage_percent', 'Memory usage in percent')
DISK_PERCENT = Gauge('system_disk_usage_percent', 'Disk usage in percent')
NETWORK_SENT = Gauge('system_network_bytes_sent', 'Network bytes sent')
NETWORK_RECV = Gauge('system_network_bytes_recv', 'Network bytes received')

# 添加到现有的指标定义部分
NETWORK_IN_BYTES = Counter('network_in_bytes_total', 'Total bytes received')
NETWORK_OUT_BYTES = Counter('network_out_bytes_total', 'Total bytes sent')
NETWORK_REQUESTS = Counter('network_requests_total', 'Total HTTP requests')
NETWORK_ERRORS = Counter('network_errors_total', 'Total network errors')
BANDWIDTH_USED = Gauge('network_bandwidth_used_bytes', 'Total bandwidth used in current month')
BANDWIDTH_RATE = Gauge('network_bandwidth_rate_bytes', 'Bandwidth usage rate per second')

# 添加日志相关的指标
LOG_ENTRIES = Counter('log_entries_total', 'Total log entries', ['level', 'module'])
ERROR_LOGS = Counter('error_logs_total', 'Total error logs', ['module', 'error_type'])

# 配置日志处理
logger = logging.getLogger('ratefuse')
logger.setLevel(logging.INFO)

# 创建文件处理器
log_file = '/var/log/ratefuse/app.log'
file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5)
file_handler.setLevel(logging.INFO)

# 创建格式化器
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)

# 添加处理器到记录器
logger.addHandler(file_handler)

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
        # 创建新的事件循环
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # 在事件循环中运行异步函数
        rating_info = loop.run_until_complete(
            extract_rating_info(type, platform, tmdb_info)
        )
        
        # 关闭事件循环
        loop.close()
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

        # 使用 Celery 任务处理评分信息
        task = fetch_rating_task.delay(type, platform, tmdb_info)
        try:
            rating_info = task.get(timeout=60)  # 60秒超时
        except Exception as e:
            print(f"任务执行失败: {e}")
            raise HTTPException(status_code=500, detail="获取评分超时")

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

# 添加中间件来记录流量
@app.middleware("http")
async def monitor_requests(request: Request, call_next):
    try:
        # 记录请求
        logger.info(f"收到请求: {request.method} {request.url.path}")
        LOG_ENTRIES.labels(level='info', module='http').inc()
        
        # 记录请求大小
        content_length = request.headers.get("content-length")
        if content_length:
            NETWORK_IN_BYTES.inc(int(content_length))
        NETWORK_REQUESTS.inc()
        
        response = await call_next(request)
        
        # 记录响应
        resp_size = response.headers.get("content-length", 0)
        NETWORK_OUT_BYTES.inc(int(resp_size))
        
        if response.status_code >= 400:
            logger.error(f"请求失败: {request.url.path} - {response.status_code}")
            LOG_ENTRIES.labels(level='error', module='http').inc()
            NETWORK_ERRORS.inc()
            ERROR_LOGS.labels(module='http', error_type='http_error').inc()
            
        return response
        
    except Exception as e:
        logger.error(f"请求处理错误: {str(e)}")
        ERROR_LOGS.labels(module='http', error_type='exception').inc()
        raise

# 更新系统指标的异步任务
async def update_system_metrics():
    """定期更新系统资源指标"""
    while True:
        try:
            # CPU 使用率
            CPU_USAGE.set(psutil.cpu_percent())
            
            # 内存使用情况
            memory = psutil.virtual_memory()
            MEMORY_USAGE.set(memory.used)
            MEMORY_PERCENT.set(memory.percent)
            
            # 磁盘使用情况
            disk = psutil.disk_usage('/')
            DISK_USAGE.set(disk.used)
            DISK_PERCENT.set(disk.percent)
            
            # 带宽使用情况
            with open('/sys/class/net/eth0/statistics/tx_bytes', 'r') as f:
                tx_bytes = int(f.read())
            with open('/sys/class/net/eth0/statistics/rx_bytes', 'r') as f:
                rx_bytes = int(f.read())
            
            total_bytes = tx_bytes + rx_bytes
            BANDWIDTH_USED.set(total_bytes)
            BANDWIDTH_RATE.set(total_bytes / 60)  # 每分钟的平均速率
            
        except Exception as e:
            print(f"更新系统指标时出错: {e}")
            
        await asyncio.sleep(15)
