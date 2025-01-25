import dramatiq
from dramatiq.brokers.redis import RedisBroker
from ratings import extract_rating_info
from dramatiq.results import Results
from dramatiq.results.backends import RedisBackend
from dramatiq.middleware import AsyncIO

# 配置 Redis results backend
result_backend = RedisBackend(url="redis://:l1994z0912x@localhost:6379/0")

# Redis broker 配置
redis_broker = RedisBroker(url="redis://:l1994z0912x@localhost:6379/0")
redis_broker.add_middleware(Results(backend=result_backend))
redis_broker.add_middleware(AsyncIO())

dramatiq.set_broker(redis_broker)

@dramatiq.actor
async def fetch_platform_rating(media_type: str, platform: str, tmdb_info: dict):
    """异步获取平台评分"""
    try:
        rating_info = await extract_rating_info(media_type, platform, tmdb_info)
        return rating_info
    except Exception as e:
        print(f"获取 {platform} 评分时出错: {e}")
        return None 
