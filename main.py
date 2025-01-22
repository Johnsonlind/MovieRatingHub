from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from ratings import extract_rating_info, get_tmdb_info
import asyncio
from starlette.background import BackgroundTask
from redis import asyncio as aioredis
import json
import time
from prometheus_client import CollectorRegistry, Counter, Histogram, Gauge, start_http_server, REGISTRY
import psutil
import logging
from logging.handlers import RotatingFileHandler
import atexit
import prometheus_client

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

# 添加带宽监控指标
BANDWIDTH_USED = Gauge('network_bandwidth_used_bytes', 'Total bandwidth used in current month')
BANDWIDTH_RATE = Gauge('network_bandwidth_rate_bytes', 'Bandwidth usage rate per second')

# 清除默认注册表中的所有收集器
for collector in list(REGISTRY._collector_to_names.keys()):
    REGISTRY.unregister(collector)

# 创建指标
try:
    CPU_USAGE = Gauge('system_cpu_usage_percent', 'CPU usage percentage')
    MEMORY_USAGE = Gauge('system_memory_usage', 'Memory usage in bytes')
    MEMORY_PERCENT = Gauge('system_memory_usage_percent', 'Memory usage percentage')
    DISK_USAGE = Gauge('system_disk_usage', 'Disk usage in bytes')
    DISK_PERCENT = Gauge('system_disk_usage_percent', 'Disk usage percentage')

    NETWORK_IN_BYTES = Counter('network_in_bytes_total', 'Total bytes received')
    NETWORK_OUT_BYTES = Counter('network_out_bytes_total', 'Total bytes sent')
    NETWORK_REQUESTS = Counter('network_requests_total', 'Total HTTP requests')
    NETWORK_ERRORS = Counter('network_errors_total', 'Total network errors')

except ValueError as e:
    print(f"指标已存在，跳过注册: {e}")

# 配置日志处理
logger = logging.getLogger('ratefuse')
logger.setLevel(logging.INFO)

log_file = '/var/log/ratefuse/app.log'
file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5)
file_handler.setLevel(logging.INFO)

formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)

logger.addHandler(file_handler)

# Prometheus 服务器管理
_prometheus_server = None

def start_prometheus_server():
    global _prometheus_server
    if _prometheus_server is None:
        try:
            start_http_server(8001)
            _prometheus_server = {
                'registry': REGISTRY,
                'log_entries': Counter('log_entries_total', 'Total log entries', 
                                    ['level', 'module'], registry=REGISTRY),
                'error_logs': Counter('error_logs_total', 'Total error logs', 
                                   ['module', 'error_type'], registry=REGISTRY)
            }
            print("Prometheus 服务器启动成功")
        except Exception as e:
            print(f"Prometheus 服务器启动失败: {e}")

# 在应用退出时清理
def cleanup_prometheus():
    global _prometheus_server
    if _prometheus_server:
        _prometheus_server = None
        print("Prometheus 服务器已关闭")

atexit.register(cleanup_prometheus)

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

    start_prometheus_server()
    asyncio.create_task(update_system_metrics())

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时清理资源"""
    global redis
    if redis:
        await redis.close()
        print("Redis 连接已关闭")
    cleanup_prometheus()

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

@app.get("/")
async def root():
    return {"status": "ok", "message": "RateFuse API is running"}

@app.get("/ratings/{platform}/{type}/{id}")
async def get_platform_rating(platform: str, type: str, id: str, request: Request):
    try:
        cache_key = f"rating:{platform}:{type}:{id}"
        cached_data = await get_cache(cache_key)
        if cached_data:
            print(f"从缓存获取 {platform} 评分数据")
            return cached_data

        if await request.is_disconnected():
            print(f"{platform} 请求已在开始时被取消")
            return None

        tmdb_info = await get_tmdb_info(id, request)
        if not tmdb_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在获取TMDB信息时被取消")
                return None
            raise HTTPException(status_code=404, detail="无法获取 TMDB 信息")

        rating_info = await extract_rating_info(type, platform, tmdb_info, request)

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

        await set_cache(cache_key, rating_info)
        return rating_info
            
    except Exception as e:
        if await request.is_disconnected():
            print(f"{platform} 请求在发生错误时被取消")
            return None
        print(f"获取 {platform} 评分时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.middleware("http")
async def monitor_requests(request: Request, call_next):
    try:
        logger.info(f"收到请求: {request.method} {request.url.path}")
        REGISTRY.get_sample_value('log_entries_total', labels=['level', 'module'])
        
        content_length = request.headers.get("content-length")
        if content_length:
            NETWORK_IN_BYTES.inc(int(content_length))
        NETWORK_REQUESTS.inc()
        
        response = await call_next(request)
        
        resp_size = response.headers.get("content-length", 0)
        NETWORK_OUT_BYTES.inc(int(resp_size))
        
        if response.status_code >= 400:
            logger.error(f"请求失败: {request.url.path} - {response.status_code}")
            REGISTRY.get_sample_value('error_logs_total', labels=['level', 'module'])
            NETWORK_ERRORS.inc()
            
        return response
        
    except Exception as e:
        logger.error(f"请求处理错误: {str(e)}")
        raise

async def update_system_metrics():
    """定期更新系统资源指标"""
    while True:
        try:
            CPU_USAGE.set(psutil.cpu_percent())
            memory = psutil.virtual_memory()
            MEMORY_USAGE.set(memory.used)
            MEMORY_PERCENT.set(memory.percent)
            disk = psutil.disk_usage('/')
            DISK_USAGE.set(disk.used)
            DISK_PERCENT.set(disk.percent)

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
