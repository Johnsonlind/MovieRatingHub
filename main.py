from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from ratings import get_tmdb_info, RATING_STATUS
from redis import asyncio as aioredis
import json
from tasks import fetch_platform_rating
import dramatiq

# 2. 配置
REDIS_URL = "redis://:l1994z0912x@localhost:6379/0"
CACHE_EXPIRE_TIME = 24 * 60 * 60
redis = None

# 3. 应用初始化
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

# 4. 健康检查端点
@app.get("/")
async def root():
    return {"status": "ok", "message": "RateFuse API is running"}

# 5. 缓存辅助函数
async def get_cache(key: str):
    if not redis:
        return None
    try:
        data = await redis.get(key)
        if data:
            data = json.loads(data)
            if isinstance(data, dict) and data.get("status") == RATING_STATUS["SUCCESSFUL"]:
                return data
        return None
    except Exception as e:
        print(f"获取缓存出错: {e}")
        return None

async def set_cache(key: str, data: dict):
    if not redis:
        return
    try:
        if isinstance(data, dict) and data.get("status") == RATING_STATUS["SUCCESSFUL"]:
            await redis.setex(
                key,
                CACHE_EXPIRE_TIME,
                json.dumps(data)
            )
    except Exception as e:
        print(f"设置缓存出错: {e}")

# 6. 主要业务端点
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

        # 获取 TMDB 信息
        tmdb_info = await get_tmdb_info(id, request)
        if not tmdb_info:
            raise HTTPException(status_code=404, detail="无法获取 TMDB 信息")

        # 将任务加入队列
        message = fetch_platform_rating.send(type, platform, tmdb_info)
        
        # 返回任务ID，不等待结果
        return {
            "status": "processing",
            "message": "任务已加入队列",
            "task_id": message.message_id
        }

    except Exception as e:
        print(f"获取 {platform} 评分时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/task/{task_id}")
async def get_task_status(task_id: str):
    try:
        message = dramatiq.Message(
            queue_name="default",
            actor_name="fetch_platform_rating",
            args=(),
            kwargs={},
            options={},
            message_id=task_id,
        )
        result = message.get_result(block=False)
        if result:
            return {"status": "completed", "result": result}
        return {"status": "processing"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

# 7. 启动事件
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
