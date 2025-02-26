import os
from dotenv import load_dotenv
import time
import ssl

load_dotenv()

from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from models import User, Favorite, SessionLocal, PasswordReset
from sqlalchemy.orm import Session
from ratings import extract_rating_info, get_tmdb_info, RATING_STATUS, search_platform
from redis import asyncio as aioredis
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib
import secrets

# Redis 配置
REDIS_URL = "redis://:l1994z0912x@localhost:6379/0"
CACHE_EXPIRE_TIME = 24 * 60 * 60
redis = None

# 添加 JWT 配置
SECRET_KEY = "L1994z0912x." # 建议使用更安全的密钥
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # token 有效期7天
REMEMBER_ME_TOKEN_EXPIRE_DAYS = 30  # 记住我的token有效期为30天

# 密码加密工具
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# 数据库依赖
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 用户认证相关函数
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, remember_me: bool = False):
    to_encode = data.copy()
    if remember_me:
        expire = datetime.utcnow() + timedelta(days=REMEMBER_ME_TOKEN_EXPIRE_DAYS)
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

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

# 添加环境变量配置
FRONTEND_URL = "http://localhost:5173" if os.getenv("ENV") == "development" else "https://ratefuse.cn"

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
@app.get("/api/ratings/{platform}/{type}/{id}")
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

# 用户认证路由
@app.post("/auth/register")
async def register(
    request: Request,
    db: Session = Depends(get_db)
):
    data = await request.json()
    email = data.get("email")
    username = data.get("username")
    password = data.get("password")
    # 检查邮箱是否已存在
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=400,
            detail="该邮箱已被注册"
        )
    
    # 检查用户名是否已存在
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(
            status_code=400,
            detail="该用户名已被使用"
        )
    
    # 创建新用户
    hashed_password = get_password_hash(password)
    user = User(
        email=email,
        username=username,
        hashed_password=hashed_password
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # 生成 token
    access_token = create_access_token(
        data={"sub": user.email},
        remember_me=False
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username
        }
    }

@app.post("/auth/login")
async def login(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    email = data.get("email")
    password = data.get("password")
    remember_me = data.get("remember_me", False)
    
    user = db.query(User).filter(User.email == email).first()
    
    # 先检查邮箱是否存在
    if not user:
        raise HTTPException(
            status_code=401,
            detail="此邮箱未注册"
        )
    
    # 再检查密码是否正确
    if not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="邮箱或密码错误"
        )
    
    access_token = create_access_token(
        data={"sub": user.email},
        remember_me=remember_me
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "avatar": user.avatar
        }
    }

# 获取当前用户
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="无效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# 收藏相关路由
@app.post("/api/favorites")
async def add_favorite(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    data = await request.json()
    
    # 检查是否已收藏
    existing_favorite = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.media_id == data["media_id"],
        Favorite.media_type == data["media_type"]
    ).first()
    
    if existing_favorite:
        # 如果已收藏，则取消收藏
        db.delete(existing_favorite)
        db.commit()
        return {"message": "已取消收藏"}
    
    # 添加收藏
    favorite = Favorite(
        user_id=current_user.id,
        media_id=data["media_id"],
        media_type=data["media_type"],
        title=data["title"],
        poster=data["poster"]
    )
    
    db.add(favorite)
    db.commit()
    db.refresh(favorite)
    
    return {"message": "收藏成功"}

@app.get("/user/me")
async def read_user_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username
    }

# 获取当前用户信息
@app.get("/api/user/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "avatar": current_user.avatar
    }

# 获取用户收藏列表
@app.get("/api/favorites")
async def get_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    favorites = db.query(Favorite).filter(
        Favorite.user_id == current_user.id
    ).all()
    return favorites

# 添加在现有路由后面
@app.put("/api/user/profile")
async def update_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        
        # 验证头像数据
        if data.get("avatar"):
            if not data["avatar"].startswith('data:image/'):
                raise HTTPException(
                    status_code=400,
                    detail="无效的图片格式"
                )
            # 限制图片大小为 2MB
            avatar_data = data["avatar"].split(',')[1]
            if len(avatar_data) > 2 * 1024 * 1024:  # 2MB
                raise HTTPException(
                    status_code=400,
                    detail="图片大小不能超过 2MB"
                )
            current_user.avatar = data["avatar"]
        
        # 检查用户名是否已被使用
        if data.get("username"):
            existing_user = db.query(User).filter(
                User.username == data["username"],
                User.id != current_user.id
            ).first()
            if existing_user:
                raise HTTPException(
                    status_code=400,
                    detail="该用户名已被使用"
                )
            current_user.username = data["username"]
        
        # 更新密码
        if data.get("password"):
            current_user.hashed_password = get_password_hash(data["password"])
        
        db.commit()
        
        return {
            "message": "个人资料更新成功",
            "user": {
                "id": current_user.id,
                "email": current_user.email,
                "username": current_user.username,
                "avatar": current_user.avatar
            }
        }
    except Exception as e:
        db.rollback()
        print(f"更新个人资料时出错: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

# 生成重置密码 token
def generate_reset_token():
    return secrets.token_urlsafe(32)

@app.post("/auth/forgot-password")
async def forgot_password(
    request: Request,
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        email = data.get("email")
        print(f"收到重置密码请求，邮箱: {email}")
        
        # 查找用户
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=404,
                detail="未找到该邮箱对应的用户"
            )
        
        # 生成重置 token
        token = generate_reset_token()
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        # 保存重置记录
        reset_record = PasswordReset(
            email=email,
            token=token,
            expires_at=expires_at
        )
        db.add(reset_record)
        db.commit()
        
        # 根据环境生成重置链接
        reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
        
        # 发送邮件
        sender_email = "ratefuseteam@gmail.com"
        app_password = "ukhtkvzexnzgeibw"
        
        message = MIMEMultipart()
        message["From"] = f"RateFuse <{sender_email}>"
        message["To"] = email
        message["Subject"] = "RateFuse - 重置密码"
        
        body = f"""
        <html>
          <body>
            <h2>重置您的 RateFuse 密码</h2>
            <p>您好！</p>
            <p>我们收到了重置您 RateFuse 账户密码的请求。请点击下面的链接重置密码：</p>
            <p><a href="{reset_link}">重置密码</a></p>
            <p>如果您没有请求重置密码，请忽略此邮件。</p>
            <p>此链接将在 24 小时后失效。</p>
            <br>
            <p>RateFuse 团队</p>
          </body>
        </html>
        """
        
        message.attach(MIMEText(body, "html"))
        
        max_retries = 3
        retry_count = 0

        while retry_count < max_retries:
            try:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                    server.login(sender_email, app_password)
                    text = message.as_string()
                    server.sendmail(sender_email, email, text)
                    print(f"邮件发送成功: {email}")
                    return {"message": "重置密码邮件已发送"}
            except Exception as e:
                print(f"尝试 {retry_count + 1} 发送邮件失败: {str(e)}")
                retry_count += 1
                if retry_count == max_retries:
                    raise HTTPException(
                        status_code=500,
                        detail=f"发送邮件失败: {str(e)}"
                    )
                time.sleep(2)
    except Exception as e:
        print(f"处理重置密码请求时出错: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"处理请求失败: {str(e)}"
        )

@app.post("/auth/reset-password")
async def reset_password(
    request: Request,
    db: Session = Depends(get_db)
):
    data = await request.json()
    token = data.get("token")
    new_password = data.get("password")
    
    # 验证 token
    reset_record = db.query(PasswordReset).filter(
        PasswordReset.token == token,
        PasswordReset.used == False,
        PasswordReset.expires_at > datetime.utcnow()
    ).first()
    
    if not reset_record:
        raise HTTPException(
            status_code=400,
            detail="无效或已过期的重置链接"
        )
    
    user = db.query(User).filter(User.email == reset_record.email).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="未找到用户"
        )
    
    user.hashed_password = get_password_hash(new_password)
    reset_record.used = True
    db.commit()
    
    return {"message": "密码重置成功"}
