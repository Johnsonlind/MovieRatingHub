from celery import Celery

# 创建 Celery 实例
celery_app = Celery(
    'ratefuse',
    broker='redis://:l1994z0912x@localhost:6379/1',  # 使用 Redis 数据库 1 作为消息队列
    backend='redis://:l1994z0912x@localhost:6379/2'  # 使用 Redis 数据库 2 存储结果
)

# Celery 配置
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Shanghai',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5分钟超时
    worker_max_tasks_per_child=200,
    worker_prefetch_multiplier=4
) 
