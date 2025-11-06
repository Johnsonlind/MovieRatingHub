# ==========================================
# 主程序 - FastAPI后端服务
# 功能: 用户认证、收藏管理、评分代理、榜单管理
# ==========================================
import asyncio
import os
from dotenv import load_dotenv
import time
import ssl
from typing import Optional
import hashlib
import httpx
from fastapi.responses import JSONResponse
import logging

load_dotenv()

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Request, Depends, APIRouter, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from models import SQLALCHEMY_DATABASE_URL, User, Favorite, FavoriteList, SessionLocal, PasswordReset, Follow, ChartEntry, SchedulerStatus
from sqlalchemy.orm import Session
from ratings import extract_rating_info, get_tmdb_info, RATING_STATUS, search_platform
from redis import asyncio as aioredis
import json
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib
import secrets
import aiohttp
from fastapi.security.utils import get_authorization_scheme_param
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from sqlalchemy import func
from sqlalchemy import or_, not_
from sqlalchemy import and_
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.pool import QueuePool
from sqlalchemy import create_engine
from browser_pool import browser_pool
import traceback

# ==========================================
# 1. 配置和初始化部分
# ==========================================

# Redis 配置
REDIS_URL = "redis://:l1994z0912x@localhost:6379/0"
CACHE_EXPIRE_TIME = 24 * 60 * 60
redis = None

# 定义认证相关的配置
SECRET_KEY = "L1994z0912x."
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
REMEMBER_ME_TOKEN_EXPIRE_DAYS = 30

# 添加环境变量配置
FRONTEND_URL = "http://localhost:5173" if os.getenv("ENV") == "development" else "https://ratefuse.cn"

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

# 添加响应压缩
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 数据库连接
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800  # 30分钟回收连接
)

# ==========================================
# 2. 辅助类和函数
# ==========================================

# 定义 OAuth2PasswordBearerOptional 类
class OAuth2PasswordBearerOptional(OAuth2):
    def __init__(
        self,
        tokenUrl: str,
        scheme_name: Optional[str] = None,
        scopes: Optional[dict] = None,
        auto_error: bool = True,
    ):
        if not scopes:
            scopes = {}
        flows = OAuthFlowsModel(password={"tokenUrl": tokenUrl, "scopes": scopes})
        super().__init__(flows=flows, scheme_name=scheme_name, auto_error=auto_error)

    async def __call__(self, request: Request) -> Optional[str]:
        authorization: str = request.headers.get("Authorization")
        if not authorization:
            return None
            
        scheme, param = get_authorization_scheme_param(authorization)
        if not authorization or scheme.lower() != "bearer":
            return None
            
        return param

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
oauth2_scheme_optional = OAuth2PasswordBearerOptional(tokenUrl="token", auto_error=False)

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

async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db)
) -> Optional[User]:
    if not token:
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
            
        # 使用 email 查询用户
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            return None
            
        return user
    except JWTError:
        return None

# 缓存辅助函数
async def get_cache(key: str):
    """从 Redis 获取缓存数据"""
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
        logger.error(f"获取缓存出错: {e}")
        return None

async def set_cache(key: str, data: dict, expire: int = CACHE_EXPIRE_TIME):
    """将数据存入 Redis 缓存"""
    if not redis:
        return
    try:
        if isinstance(data, dict) and data.get("status") == RATING_STATUS["SUCCESSFUL"]:
            await redis.setex(key, expire, json.dumps(data))
    except Exception as e:
        logger.error(f"设置缓存出错: {e}")

# 生成重置密码 token
def generate_reset_token():
    return secrets.token_urlsafe(32)

# 修改后端的 check_following_status 函数
def check_following_status(db: Session, follower_id: Optional[int], following_id: int) -> bool:
    if not follower_id:
        return False
    
    follow = db.query(Follow).filter(
        Follow.follower_id == follower_id,
        Follow.following_id == following_id
    ).first()
    
    return bool(follow)

# ==========================================
# 3. 用户认证相关路由
# ==========================================

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
    try:
        data = await request.json()
        email = data.get("email")
        password = data.get("password")
        remember_me = data.get("remember_me", False)
        
        user = db.query(User).filter(User.email == email).first()
        
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
    except Exception as e:
        print(f"登录过程出错: {str(e)}")
        raise

@app.post("/auth/forgot-password")
async def forgot_password(
    request: Request,
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        email = data.get("email")
        
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
                    return {"message": "重置密码邮件已发送"}
            except Exception as e:
                retry_count += 1
                if retry_count == max_retries:
                    raise HTTPException(
                        status_code=500,
                        detail=f"发送邮件失败: {str(e)}"
                    )
                time.sleep(2)
    except Exception as e:
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

@app.get("/user/me")
async def read_user_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username
    }

@app.get("/api/user/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "avatar": current_user.avatar,
        "is_admin": current_user.is_admin
    }

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
        logger.error(f"更新个人资料时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 4. 收藏相关路由
# ==========================================

@app.post("/api/favorites")
async def add_favorite(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        
        # 验证必要字段
        required_fields = ["media_id", "media_type", "title", "poster", "list_id"]
        for field in required_fields:
            if field not in data:
                raise HTTPException(
                    status_code=400,
                    detail=f"缺少必要字段: {field}"
                )
        
        # 验证收藏列表存在且属于当前用户
        favorite_list = db.query(FavoriteList).filter(
            FavoriteList.id == data["list_id"],
            FavoriteList.user_id == current_user.id
        ).first()
        
        if not favorite_list:
            raise HTTPException(
                status_code=404,
                detail="收藏列表不存在或无权限访问"
            )
        
        # 获取当前列表中最大的 sort_order
        max_sort_order = db.query(func.max(Favorite.sort_order)).filter(
            Favorite.list_id == data["list_id"]
        ).scalar()
        
        # 创建新收藏
        favorite = Favorite(
            user_id=current_user.id,
            list_id=data["list_id"],
            media_id=data["media_id"],
            media_type=data["media_type"],
            title=data["title"],
            poster=data["poster"],
            year=data.get("year", ""),
            note=data.get("note"),
            overview=data.get("overview", ""),
            sort_order=(max_sort_order + 1) if max_sort_order is not None else 0
        )
        
        db.add(favorite)
        db.commit()
        db.refresh(favorite)
        
        return {
            "message": "收藏成功",
            "favorite": {
                "id": favorite.id,
                "media_id": favorite.media_id,
                "media_type": favorite.media_type,
                "title": favorite.title,
                "poster": favorite.poster,
                "year": favorite.year,
                "note": favorite.note,
                "overview": favorite.overview
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"添加收藏失败: {str(e)}"
        )

@app.get("/api/favorites")
async def get_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        favorites = db.query(Favorite).filter(
            Favorite.user_id == current_user.id
        ).all()
        
        return [{
            "id": fav.id,
            "media_id": fav.media_id,
            "media_type": fav.media_type,
            "title": fav.title,
            "poster": fav.poster,
            "year": fav.year,
            "overview": fav.overview,
            "note": fav.note
        } for fav in favorites]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取收藏失败: {str(e)}"
        )

@app.delete("/api/favorites/{favorite_id}")
async def delete_favorite(
    favorite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        favorite = db.query(Favorite).filter(
            Favorite.id == favorite_id,
            Favorite.user_id == current_user.id
        ).first()
        
        if not favorite:
            raise HTTPException(
                status_code=404,
                detail="收藏不存在或无权限删除"
            )
        
        db.delete(favorite)
        db.commit()
        
        return {"message": "收藏删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"删除收藏失败: {str(e)}"
        )

@app.put("/api/favorites/{favorite_id}")
async def update_favorite(
    favorite_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        
        favorite = db.query(Favorite).filter(
            Favorite.id == favorite_id,
            Favorite.user_id == current_user.id
        ).first()
        
        if not favorite:
            raise HTTPException(
                status_code=404,
                detail="收藏不存在或无权限修改"
            )
        
        if "note" in data:
            favorite.note = data["note"]
        
        db.commit()
        db.refresh(favorite)
        
        return {
            "id": favorite.id,
            "media_id": favorite.media_id,
            "media_type": favorite.media_type,
            "title": favorite.title,
            "poster": favorite.poster,
            "year": favorite.year,
            "overview": favorite.overview,
            "note": favorite.note
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"更新收藏失败: {str(e)}"
        )

@app.get("/api/favorite-lists")
async def get_favorite_lists(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        lists = db.query(FavoriteList).filter(
            FavoriteList.user_id == current_user.id
        ).all()
        
        result = []
        for list in lists:
            # 获取排序后的收藏项
            favorites = db.query(Favorite).filter(
                Favorite.list_id == list.id
            ).order_by(
                Favorite.sort_order.is_(None),
                Favorite.sort_order,
                Favorite.id
            ).all()
            
            # 如果是收藏的列表，获取原创者信息
            original_creator = None
            if list.original_list_id:
                original_list = db.query(FavoriteList).filter(
                    FavoriteList.id == list.original_list_id
                ).first()
                if original_list:
                    original_creator_user = db.query(User).filter(
                        User.id == original_list.user_id
                    ).first()
                    if original_creator_user:
                        original_creator = {
                            "id": original_creator_user.id,
                            "username": original_creator_user.username,
                            "avatar": original_creator_user.avatar
                        }
            
            # 获取创建者信息（当前列表的创建者）
            creator = {
                "id": current_user.id,
                "username": current_user.username,
                "avatar": current_user.avatar
            }

            result.append({
            "id": list.id,
            "name": list.name,
            "description": list.description,
            "is_public": list.is_public,
            "created_at": list.created_at,
                "original_list_id": list.original_list_id,
                "original_creator": original_creator,
                "creator": creator,
            "favorites": [{
                "id": fav.id,
                "media_id": fav.media_id,
                "media_type": fav.media_type,
                "title": fav.title,
                "poster": fav.poster,
                "year": fav.year,
                "overview": fav.overview,
                    "note": fav.note,
                    "sort_order": fav.sort_order
                } for fav in favorites]
            })
        
        return result
    except Exception as e:
        logger.error(f"获取收藏列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取收藏列表失败: {str(e)}")

@app.post("/api/favorite-lists")
async def create_favorite_list(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        
        # 验证必要字段
        if not data.get("name"):
            raise HTTPException(
                status_code=400,
                detail="列表名称不能为空"
            )
            
        # 检查是否已存在同名列表
        existing_list = db.query(FavoriteList).filter(
            FavoriteList.user_id == current_user.id,
            FavoriteList.name == data["name"]
        ).first()
        
        if existing_list:
            raise HTTPException(
                status_code=400,
                detail="已存在同名收藏列表"
            )
        
        # 创建新列表
        new_list = FavoriteList(
            user_id=current_user.id,
            name=data["name"],
            description=data.get("description"),
            is_public=data.get("is_public", False)
        )
        
        db.add(new_list)
        db.commit()
        db.refresh(new_list)
        
        return {
            "id": new_list.id,
            "name": new_list.name,
            "description": new_list.description,
            "is_public": new_list.is_public,
            "created_at": new_list.created_at,
            "favorites": []
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"创建收藏列表失败: {str(e)}"
        )

@app.get("/api/favorite-lists/{list_id}")
async def get_favorite_list(
    list_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    list_data = db.query(FavoriteList).filter(FavoriteList.id == list_id).first()
    if not list_data:
        raise HTTPException(status_code=404, detail="列表不存在")

    # 构建基本响应数据
    response_data = {
        "id": list_data.id,
        "name": list_data.name,
        "description": list_data.description,
        "is_public": list_data.is_public,
        "user_id": list_data.user_id,
        "original_list_id": list_data.original_list_id,
        "favorites": [
            {
                "id": f.id,
                "media_id": f.media_id,
                "media_type": f.media_type,
                "title": f.title,
                "poster": f.poster,
                "year": f.year,
                "overview": f.overview,
                "note": f.note,
                "sort_order": f.sort_order
            }
            for f in list_data.favorites
        ] if list_data.favorites else []
    }

    # 检查创建者的关注状态
    creator = db.query(User).filter(User.id == list_data.user_id).first()
    is_following_creator = False
    
    if current_user:
        follow = db.query(Follow).filter(
            Follow.follower_id == current_user.id,
            Follow.following_id == creator.id
        ).first()
        is_following_creator = follow is not None

    response_data["creator"] = {
        "id": creator.id,
        "username": creator.username,
        "avatar": creator.avatar,
        "is_following": is_following_creator
    }

    # 如果是收藏的列表，检查原创者的关注状态
    if list_data.original_list_id:
        original_list = db.query(FavoriteList).filter(
            FavoriteList.id == list_data.original_list_id
        ).first()
        if original_list:
            original_creator = db.query(User).filter(
                User.id == original_list.user_id
            ).first()
            
            is_following_original = False
            if current_user:
                is_following_original = db.query(Follow).filter(
                    Follow.follower_id == current_user.id,
                    Follow.following_id == original_creator.id
                ).first() is not None
            
            response_data["original_creator"] = {
                "id": original_creator.id,
                "username": original_creator.username,
                "avatar": original_creator.avatar,
                "is_following": is_following_original
            }

    return response_data

@app.put("/api/favorite-lists/{list_id}")
async def update_favorite_list(
    list_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        
        favorite_list = db.query(FavoriteList).filter(
            FavoriteList.id == list_id,
            FavoriteList.user_id == current_user.id
        ).first()
        
        if not favorite_list:
            raise HTTPException(
                status_code=404,
                detail="收藏列表不存在或无权限修改"
            )
        
        # 检查是否有同名列表
        if data.get("name") and data["name"] != favorite_list.name:
            existing_list = db.query(FavoriteList).filter(
                FavoriteList.user_id == current_user.id,
                FavoriteList.name == data["name"],
                FavoriteList.id != list_id
            ).first()
            
            if existing_list:
                raise HTTPException(
                    status_code=400,
                    detail="已存在同名收藏列表"
                )
            
            favorite_list.name = data["name"]
        
        if "description" in data:
            favorite_list.description = data["description"]
        
        if "is_public" in data:
            favorite_list.is_public = data["is_public"]
        
        db.commit()
        db.refresh(favorite_list)
        
        return {
            "id": favorite_list.id,
            "name": favorite_list.name,
            "description": favorite_list.description,
            "is_public": favorite_list.is_public,
            "user_id": favorite_list.user_id,
            "created_at": favorite_list.created_at,
            "favorites": [{
                "id": fav.id,
                "media_id": fav.media_id,
                "media_type": fav.media_type,
                "title": fav.title,
                "poster": fav.poster,
                "year": fav.year,
                "overview":fav.overview,
                "note": fav.note
            } for fav in favorite_list.favorites]
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"更新收藏列表失败: {str(e)}"
        )

@app.delete("/api/favorite-lists/{list_id}")
async def delete_favorite_list(
    list_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        favorite_list = db.query(FavoriteList).filter(
            FavoriteList.id == list_id,
            FavoriteList.user_id == current_user.id
        ).first()
        
        if not favorite_list:
            raise HTTPException(
                status_code=404,
                detail="收藏列表不存在或无权限删除"
            )
        
        # 删除列表及其所有收藏项目
        db.delete(favorite_list)
        db.commit()
        
        return {"message": "收藏列表删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"删除收藏列表失败: {str(e)}"
        )

@app.post("/api/favorite-lists/{list_id}/collect")
async def collect_favorite_list(
    list_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        source_list = db.query(FavoriteList).filter(
            FavoriteList.id == list_id
        ).first()
        
        if not source_list:
            raise HTTPException(
                status_code=404,
                detail="收藏列表不存在"
            )
            
        if not source_list.is_public:
            raise HTTPException(
                status_code=403,
                detail="该列表不是公开列表"
            )
            
        # 创建新的收藏列表
        new_list = FavoriteList(
            user_id=current_user.id,
            name=f"{source_list.name} (收藏)",
            description=source_list.description,
            is_public=False,
            original_list_id=list_id
        )
        
        db.add(new_list)
        db.commit()
        db.refresh(new_list)
        
        # 复制所有收藏项目
        for fav in source_list.favorites:
            new_favorite = Favorite(
                user_id=current_user.id,
                list_id=new_list.id,
                media_id=fav.media_id,
                media_type=fav.media_type,
                title=fav.title,
                poster=fav.poster,
                year=fav.year,
                overview=fav.overview
            )
            db.add(new_favorite)
            
        db.commit()
        
        return {"message": "收藏列表成功", "list_id": new_list.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"收藏列表失败: {str(e)}"
        )

@app.put("/api/favorite-lists/{list_id}/reorder")
async def reorder_favorites(
    list_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        favorite_orders = data.get('favorite_ids', [])
        
        # 验证列表所有权
        favorite_list = db.query(FavoriteList).filter(
            FavoriteList.id == list_id,
            FavoriteList.user_id == current_user.id
        ).first()
        
        if not favorite_list:
            raise HTTPException(status_code=404, detail="收藏列表不存在或无权限")
        
        # 批量更新排序
        for item in favorite_orders:
            favorite = db.query(Favorite).filter(
                Favorite.id == item['id'],
                Favorite.list_id == list_id
            ).first()
            
            if favorite:
                favorite.sort_order = item['sort_order']
        
        db.commit()
        
        # 返回更新后的列表数据，使用 MySQL 兼容的排序语法
        updated_favorites = db.query(Favorite).filter(
            Favorite.list_id == list_id
        ).order_by(
            # 将 NULL 值排在最后
            Favorite.sort_order.is_(None),
            Favorite.sort_order,
            Favorite.id
        ).all()
        
        return {
            "message": "排序更新成功",
            "favorites": [{
                "id": f.id,
                "media_id": f.media_id,
                "media_type": f.media_type,
                "title": f.title,
                "poster": f.poster,
                "year": f.year,
                "overview": f.overview,
                "note": f.note,
                "sort_order": f.sort_order
            } for f in updated_favorites]
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新排序失败: {str(e)}")

@app.delete("/api/favorite-lists/{list_id}/uncollect")
async def uncollect_favorite_list(
    list_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # 查找用户收藏的列表
        collected_list = db.query(FavoriteList).filter(
            FavoriteList.user_id == current_user.id,
            FavoriteList.original_list_id == list_id
        ).first()
        
        if not collected_list:
            raise HTTPException(
                status_code=404,
                detail="未找到已收藏的列表"
            )
        
        # 删除收藏的列表
        db.delete(collected_list)
        db.commit()
        
        return {"message": "取消收藏成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"取消收藏失败: {str(e)}"
        )
    
# ==========================================
# 5. 用户关系相关路由
# ==========================================

@app.get("/api/users/{user_id}")
async def get_user_info(
    user_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    try:
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise HTTPException(
                status_code=404,
                detail="用户不存在"
            )
            
        is_following = False
        if current_user:
            follow = db.query(Follow).filter(
                Follow.follower_id == current_user.id,
                Follow.following_id == user_id
            ).first()
            
            is_following = follow is not None
        
        return {
            "id": user.id,
            "username": user.username,
            "avatar": user.avatar,
            "email": user.email if current_user and current_user.id == user_id else None,
            "is_following": is_following
        }
    except Exception as e:
        print(f"获取用户信息失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"获取用户信息失败: {str(e)}"
        )

@app.get("/api/users/{user_id}/favorite-lists")
async def get_user_favorite_lists(
    user_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    try:
        # 获取用户的收藏列表
        query = db.query(FavoriteList).filter(FavoriteList.user_id == user_id)
        
        # 如果不是本人，只返回公开列表
        if not current_user or current_user.id != user_id:
            query = query.filter(FavoriteList.is_public == True)
            
        lists = query.all()
        
        result = []
        for list in lists:
            # 获取排序后的收藏项
            favorites = db.query(Favorite).filter(
                Favorite.list_id == list.id
            ).order_by(
                Favorite.sort_order.is_(None),
                Favorite.sort_order,
                Favorite.id
            ).all()
            
            # 检查当前用户是否已收藏该列表
            is_collected = False
            if current_user:
                is_collected = db.query(FavoriteList).filter(
                    FavoriteList.user_id == current_user.id,
                    FavoriteList.original_list_id == list.id
                ).first() is not None
            
            result.append({
                "id": list.id,
                "name": list.name,
                "description": list.description,
                "is_public": list.is_public,
                "is_collected": is_collected,
                "created_at": list.created_at,
                "favorites": [{
                    "id": fav.id,
                    "media_id": fav.media_id,
                    "media_type": fav.media_type,
                    "title": fav.title,
                    "poster": fav.poster,
                    "year": fav.year,
                    "overview": fav.overview,
                    "note": fav.note,
                    "sort_order": fav.sort_order
                } for fav in favorites]
            })
            
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取用户收藏列表失败: {str(e)}"
        )

@app.post("/api/users/{user_id}/follow")
async def follow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="不能关注自己")
    
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    follow = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == user_id
    ).first()
    
    if follow:
        raise HTTPException(status_code=400, detail="已经关注该用户")
    
    try:
        new_follow = Follow(
            follower_id=current_user.id,
            following_id=user_id
        )
        
        db.add(new_follow)
        db.commit()
        db.refresh(new_follow)
            
        return {"message": "关注成功", "is_following": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"关注失败: {str(e)}")

@app.delete("/api/users/{user_id}/follow")
async def unfollow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 检查关注关系是否存在
    follow = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == user_id
    ).first()
    
    if not follow:
        raise HTTPException(status_code=404, detail="未关注该用户")
    
    try:
        db.delete(follow)
        db.commit()
        return {"message": "取消关注成功"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="取消关注失败")

@app.get("/api/users/me/following")
async def get_following(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        follows = db.query(Follow).filter(Follow.follower_id == current_user.id).all()
        result = []
        for follow in follows:
            user = db.query(User).filter(User.id == follow.following_id).first()
            if user:
                result.append({
                    "id": user.id,
                    "username": user.username,
                    "avatar": user.avatar,
                    "note": follow.note,
                    "created_at": follow.created_at
                })
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取关注列表失败: {str(e)}"
        )

@app.put("/api/users/{user_id}/follow/note")
async def update_follow_note(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        body = await request.json()
        note = body.get("note")
        
        follow = db.query(Follow).filter(
            and_(
                Follow.follower_id == current_user.id,
                Follow.following_id == user_id
            )
        ).first()
        
        if not follow:
            raise HTTPException(status_code=404, detail="未关注该用户")
        
        follow.note = note
        db.commit()
        db.refresh(follow)
        
        return {"message": "更新备注成功"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"更新备注失败: {str(e)}"
        )

@app.get("/api/users/{user_id}/follow/status")
async def get_follow_status(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_following = check_following_status(db, current_user.id, user_id)
    return {"is_following": is_following}

@app.get("/api/debug/follows")
async def debug_follows(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 获取当前用户的所有关注
    follows = db.query(Follow).filter(
        Follow.follower_id == current_user.id
    ).all()
    
    return [
        {
            "follower_id": f.follower_id,
            "following_id": f.following_id,
            "created_at": f.created_at
        }
        for f in follows
    ]

# ==========================================
# 6. 代理和辅助路由
# ==========================================

@app.get("/")
async def root():
    return {"status": "ok", "message": "RateFuse API is running"}

@app.post("/api/ratings/batch")
async def get_batch_ratings(request: Request, db: Session = Depends(get_db)):
    """批量获取多个影视的评分信息（高性能版）
    
    请求格式：
    {
        "items": [
            {"type": "movie", "id": "550"},
            {"type": "tv", "id": "1396"},
            ...
        ],
        "max_concurrent": 5  // 可选，最大并发数，默认5
    }
    
    响应格式：
    {
        "results": {
            "550": { "ratings": {...}, "status": "success" },
            "1396": { "ratings": {...}, "status": "success" }
        },
        "_performance": {
            "total_time": 12.5,
            "total_items": 10,
            "cached_items": 3,
            "fetched_items": 7,
            "avg_time_per_item": 1.25
        }
    }
    """
    start_time = time.time()
    try:
        body = await request.json()
        items = body.get('items', [])
        max_concurrent = body.get('max_concurrent', 5)
        
        if not items or len(items) == 0:
            raise HTTPException(status_code=400, detail="items不能为空")
        
        if len(items) > 50:
            raise HTTPException(status_code=400, detail="单次最多支持50个影视")
        
        logger.info(f"\n{'='*60}\n  批量获取评分 | 数量: {len(items)} | 并发: {max_concurrent}\n{'='*60}")
        
        # 步骤1：并行检查缓存和获取TMDB信息
        async def get_item_info(item):
            media_id = item['id']
            media_type = item['type']
            
            # 检查缓存
            cache_key = f"ratings:all:{media_type}:{media_id}"
            cached = await get_cache(cache_key)
            if cached:
                return media_id, {'cached': True, 'data': cached}
            
            # 获取TMDB信息
            try:
                tmdb_info = await get_tmdb_info(media_id, media_type, request)
                if not tmdb_info:
                    return media_id, {'error': 'TMDB信息获取失败'}
                
                return media_id, {'tmdb_info': tmdb_info, 'type': media_type}
            except Exception as e:
                return media_id, {'error': str(e)}
        
        # 并行获取所有TMDB信息
        tmdb_tasks = [get_item_info(item) for item in items]
        tmdb_results = await asyncio.gather(*tmdb_tasks, return_exceptions=True)
        
        # 分离缓存命中和需要爬取的
        cached_results = {}
        to_fetch = []
        errors = {}
        
        for result in tmdb_results:
            if isinstance(result, Exception):
                continue
            media_id, data = result
            if data.get('cached'):
                cached_results[media_id] = data['data']
            elif 'tmdb_info' in data:
                to_fetch.append((media_id, data['tmdb_info'], data['type']))
            elif 'error' in data:
                errors[media_id] = data['error']
        
        logger.info(f"📊 缓存: {len(cached_results)} | 爬取: {len(to_fetch)} | 错误: {len(errors)}")
        
        # 步骤2：并行获取所有需要爬取的评分（严格控制并发）
        sem = asyncio.Semaphore(max_concurrent)
        
        async def fetch_one_item(media_id, tmdb_info, media_type):
            async with sem:
                try:
                    item_start = time.time()
                    title = tmdb_info.get('zh_title') or tmdb_info.get('title', media_id)
                    logger.info(f"  → {title[:30]}... (ID: {media_id})")
                    
                    from ratings import parallel_extract_ratings
                    
                    # 单个影视超时控制（20秒）
                    ratings = await asyncio.wait_for(
                        parallel_extract_ratings(tmdb_info, media_type, request),
                        timeout=20.0
                    )
                    
                    # 缓存结果
                    cache_key = f"ratings:all:{media_type}:{media_id}"
                    if ratings:
                        await set_cache(cache_key, ratings, expire=CACHE_EXPIRE_TIME)
                    
                    item_time = time.time() - item_start
                    logger.info(f"  ✓ {media_id}: {item_time:.1f}s")
                    
                    return media_id, {'ratings': ratings, 'status': 'success', 'time': item_time}
                    
                except asyncio.TimeoutError:
                    logger.warning(f"  ⏱ {media_id}: 超时")
                    return media_id, {'status': 'timeout', 'error': '获取超时（>20秒）'}
                except Exception as e:
                    logger.error(f"  ✗ {media_id}: {str(e)[:30]}")
                    return media_id, {'status': 'error', 'error': str(e)}
        
        # 并行爬取（控制并发数）
        if to_fetch:
            fetch_tasks = [
                fetch_one_item(media_id, tmdb_info, media_type)
                for media_id, tmdb_info, media_type in to_fetch
            ]
            fetch_results = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        else:
            fetch_results = []
        
        # 步骤3：合并所有结果
        final_results = {}
        
        # 添加缓存结果
        for media_id, data in cached_results.items():
            final_results[media_id] = {
                'ratings': data,
                'status': 'success',
                'from_cache': True
            }
        
        # 添加爬取结果
        for result in fetch_results:
            if isinstance(result, Exception):
                continue
            media_id, data = result
            final_results[media_id] = data
        
        # 添加错误结果
        for media_id, error in errors.items():
            final_results[media_id] = {
                'status': 'error',
                'error': error
            }
        
        total_time = time.time() - start_time
        success_count = sum(1 for r in final_results.values() if r.get('status') == 'success')
        
        logger.info(f"\n{'='*60}")
        logger.info(f"  ✓ 批量完成: {success_count}/{len(items)} 个 | 总耗时: {total_time:.1f}s | 平均: {total_time/len(items):.1f}s/个")
        logger.info(f"{'='*60}\n")
        
        return {
            'results': final_results,
            '_performance': {
                'total_time': round(total_time, 2),
                'total_items': len(items),
                'cached_items': len(cached_results),
                'fetched_items': len(to_fetch),
                'error_items': len(errors),
                'avg_time_per_item': round(total_time / len(items), 2) if items else 0,
                'max_concurrent': max_concurrent
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"批量获取评分失败: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"批量获取失败: {str(e)}")

@app.get("/api/ratings/all/{type}/{id}")
async def get_all_platform_ratings(type: str, id: str, request: Request):
    """并行获取所有平台的评分信息（性能优化版）"""
    start_time = time.time()
    try:
        # 检查请求是否已被取消
        if await request.is_disconnected():
            print("请求已在开始时被取消")
            return None
        
        # 生成整体缓存键
        cache_key = f"ratings:all:{type}:{id}"
        
        # 尝试从缓存获取所有平台数据
        cached_data = await get_cache(cache_key)
        if cached_data:
            print(f"从缓存获取所有平台评分数据，耗时: {time.time() - start_time:.2f}秒")
            return cached_data
        
        # 获取TMDB信息
        tmdb_info = await get_tmdb_info(id, type, request)
        if not tmdb_info:
            if await request.is_disconnected():
                print("请求在获取TMDB信息时被取消")
                return None
            raise HTTPException(status_code=404, detail="无法获取 TMDB 信息")
        
        # 检查请求是否已被取消
        if await request.is_disconnected():
            print("请求在获取TMDB信息后被取消")
            return None
        
        # 使用 parallel_extract_ratings 并行获取所有平台评分（设置超时）
        from ratings import parallel_extract_ratings
        
        try:
            # 单个影视的超时控制（最多20秒）
            all_ratings = await asyncio.wait_for(
                parallel_extract_ratings(tmdb_info, tmdb_info["type"], request),
                timeout=20.0
            )
        except asyncio.TimeoutError:
            logger.error("获取评分超时（>20秒）")
            raise HTTPException(status_code=504, detail="获取评分超时")
        
        # 检查请求是否已被取消
        if await request.is_disconnected():
            return None
        
        # 记录总耗时（在parallel_extract_ratings中已打印详细信息）
        total_time = time.time() - start_time
        
        # 缓存结果（24小时）
        if all_ratings:
            await set_cache(cache_key, all_ratings, expire=CACHE_EXPIRE_TIME)
        
        # 添加性能指标
        result = {
            "ratings": all_ratings,
            "_performance": {
                "total_time": round(total_time, 2),
                "cached": False,
                "parallel": True
            }
        }
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        if await request.is_disconnected():
            return None
        
        logger.error(f"获取所有平台评分失败: {str(e)[:100]}")
        raise HTTPException(status_code=500, detail=f"获取评分失败: {str(e)}")

@app.get("/api/ratings/{platform}/{type}/{id}")
async def get_platform_rating(platform: str, type: str, id: str, request: Request):
    """获取指定平台的评分信息，优化缓存和错误处理"""
    start_time = time.time()
    try:
        # 检查请求是否已被取消
        if await request.is_disconnected():
            print(f"{platform} 请求已在开始时被取消")
            return None
            
        # 生成缓存键
        cache_key = f"rating:{platform}:{type}:{id}"
        
        # 尝试从缓存获取数据
        cached_data = await get_cache(cache_key)
        if cached_data:
            print(f"从缓存获取 {platform} 评分数据，耗时: {time.time() - start_time:.2f}秒")
            return cached_data

        # 获取TMDB信息
        tmdb_info = await get_tmdb_info(id, type, request)
        if not tmdb_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在获取TMDB信息时被取消")
                return None
            raise HTTPException(status_code=404, detail="无法获取 TMDB 信息")

        # 检查请求是否已被取消
        if await request.is_disconnected():
            print(f"{platform} 请求在获取TMDB信息后被取消")
            return None

        # 搜索平台
        search_start_time = time.time()
        search_results = await search_platform(platform, tmdb_info, request)

        # 检查请求是否已被取消
        if await request.is_disconnected():
            print(f"{platform} 请求在搜索平台后被取消")
            return None

        # 检查搜索结果
        if isinstance(search_results, dict) and search_results.get("status") == "cancelled":
            print(f"{platform} 搜索被取消")
            return None

        # 提取评分信息
        extract_start_time = time.time()
        rating_info = await extract_rating_info(type, platform, tmdb_info, search_results, request)

        # 检查请求是否已被取消
        if await request.is_disconnected():
            print(f"{platform} 请求在获取评分信息后被取消")
            return None

        # 检查评分信息
        if not rating_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在处理评分信息时被取消")
                return None
            raise HTTPException(status_code=404, detail=f"未找到 {platform} 的评分信息")

        # 检查评分状态
        if isinstance(rating_info, dict) and rating_info.get("status") == "cancelled":
            print(f"{platform} 评分提取被取消")
            return None

        # 缓存评分信息
        # 只缓存成功获取的评分信息
        if isinstance(rating_info, dict) and rating_info.get("status") == RATING_STATUS["SUCCESSFUL"]:
            await set_cache(cache_key, rating_info)
            print(f"已缓存 {platform} 评分数据")
        else:
            print(f"不缓存 {platform} 评分数据，状态: {rating_info.get('status')}")

        # 记录总耗时
        total_time = time.time() - start_time
        
        # 添加性能指标到响应
        if isinstance(rating_info, dict):
            rating_info["_performance"] = {
                "total_time": round(total_time, 2),
                "search_time": round(time.time() - search_start_time, 2),
                "extract_time": round(time.time() - extract_start_time, 2),
                "cached": False
            }

        return rating_info

    except HTTPException:
        # 直接重新抛出HTTP异常
        raise
    except Exception as e:
        # 检查请求是否已被取消
        if await request.is_disconnected():
            print(f"{platform} 请求在发生错误时被取消")
            return None
            
        # 记录错误
        print(f"获取 {platform} 评分时出错: {str(e)}")
        print(traceback.format_exc())
        
        # 返回HTTP异常
        raise HTTPException(status_code=500, detail=f"获取评分失败: {str(e)}")
    finally:
        # 记录请求完成
        print(f"{platform} 请求处理完成，总耗时: {time.time() - start_time:.2f}秒")

router = APIRouter()

# 创建全局 httpx 客户端用于 TMDB API（复用连接）
_tmdb_client = None

async def get_tmdb_client():
    """获取或创建 TMDB API 客户端（连接池）"""
    global _tmdb_client
    if _tmdb_client is None or _tmdb_client.is_closed:
        _tmdb_client = httpx.AsyncClient(
            http2=True,  # 启用 HTTP/2
            timeout=httpx.Timeout(10.0),  # 10秒超时
            limits=httpx.Limits(
                max_connections=100,  # 最大连接数
                max_keepalive_connections=20,  # 保持活动的连接数
                keepalive_expiry=30.0  # 连接保持30秒
            ),
            headers={
                "accept": "application/json",
                "accept-encoding": "gzip, deflate",  # 启用压缩
                "Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0ZjY4MWZhN2I1YWI3MzQ2YTRlMTg0YmJmMmQ0MTcxNSIsIm5iZiI6MTUyNjE3NDY5MC4wMjksInN1YiI6IjVhZjc5M2UyOTI1MTQxMmM4MDAwNGE5ZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.maKS7ZH7y6l_H0_dYcXn5QOZHuiYdK_SsiQ5AAk32cI"
            }
        )
    return _tmdb_client

@router.get("/api/tmdb-proxy/{path:path}")
async def tmdb_proxy(path: str, request: Request):
    """代理 TMDB API 请求并缓存结果（优化版：HTTP/2 + 连接池 + Bearer Token）"""
    try:
        # 构建缓存键
        cache_key = f"tmdb:{path}:{request.query_params}"
        
        # 尝试从缓存获取
        cached_data = await get_cache(cache_key)
        if cached_data:
            return cached_data
            
        # 获取原始查询参数（不需要 api_key，使用 Bearer Token）
        params = dict(request.query_params)
        
        # 构建完整的 TMDB URL
        tmdb_url = f"https://api.themoviedb.org/3/{path}"
        
        # 使用连接池客户端
        client = await get_tmdb_client()
        
        try:
            response = await client.get(tmdb_url, params=params)
            
            if response.status_code != 200:
                try:
                    err_json = response.json()
                except Exception:
                    err_json = {"error": response.text}
                raise HTTPException(status_code=response.status_code, detail={
                    "message": "TMDB API 请求失败",
                    "status": response.status_code,
                    "body": err_json
                })
            
            # 解析 JSON
            data = response.json()
            
            # 缓存结果
            await set_cache(cache_key, data)
            
            return data
            
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="TMDB API 请求超时")
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"HTTP 请求错误: {str(e)}")
                
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"代理请求失败: {str(e)}")

@app.get("/api/image-proxy")
async def image_proxy(url: str, response: Response):
    """代理图片请求并添加缓存控制"""
    try:
        # 检查URL格式，如果是相对路径，添加TMDB基础URL
        if url.startswith('/tmdb-images/'):
            url = f"https://image.tmdb.org/t/p{url[12:]}"
        
        # 添加缓存键
        cache_key = f"img:{url}"
        
        # 检查Redis缓存
        if redis:
            try:
                cached_url = await redis.get(cache_key)
                if cached_url:
                    # 重定向到缓存的URL
                    response.headers["Location"] = cached_url.decode('utf-8')
                    response.status_code = 302
                    return
            except Exception as redis_error:
                print(f"Redis缓存错误: {str(redis_error)}")
                # 继续执行，不依赖缓存
        
        # 简易 ETag，基于 URL
        etag = 'W/"' + hashlib.md5(url.encode('utf-8')).hexdigest() + '"'
        inm = None
        try:
            inm = response.headers.get('If-None-Match')  # 注意：Response无请求头；从request无法直接拿，这里简单返回ETag供浏览器缓存
        except Exception:
            pass

        # 尝试从 Redis 缓存图片二进制
        cached_item = None
        if redis:
            try:
                cached_raw = await redis.get(f"imgbin:{url}")
                if cached_raw:
                    cached_item = json.loads(cached_raw)
            except Exception:
                cached_item = None

        if cached_item:
            img_bytes = base64.b64decode(cached_item.get('data', ''))
            content_type = cached_item.get('content_type', 'image/jpeg')
            headers = {
                "Cache-Control": "public, max-age=604800, immutable",
                "ETag": etag,
                "Content-Type": content_type,
            }
            return Response(content=img_bytes, media_type=content_type, headers=headers)

        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as session:
            try:
                async with session.get(url, timeout=10) as img_response:
                    if img_response.status != 200:
                        print(f"图片获取失败，状态码: {img_response.status}, URL: {url}")
                        raise HTTPException(status_code=img_response.status, detail="图片获取失败")
                    
                    # 获取内容类型
                    content_type = img_response.headers.get("Content-Type", "image/jpeg")
                    
                    # 读取图片数据
                    image_data = await img_response.read()
                    
                    # 写入 Redis 二进制缓存
                    if redis:
                        try:
                            await redis.setex(
                                f"imgbin:{url}",
                                7 * 24 * 60 * 60,
                                json.dumps({
                                    'content_type': content_type,
                                    'data': base64.b64encode(image_data).decode('utf-8')
                                })
                            )
                        except Exception:
                            pass

                    # 返回并携带缓存头
                    headers = {
                        "Cache-Control": "public, max-age=604800, immutable",
                        "ETag": etag,
                        "Content-Type": content_type,
                    }
                    return Response(content=image_data, media_type=content_type, headers=headers)
            except aiohttp.ClientError as client_error:
                print(f"AIOHTTP客户端错误: {str(client_error)}, URL: {url}")
                raise HTTPException(status_code=500, detail=f"图片获取失败: {str(client_error)}")
            except asyncio.TimeoutError:
                print(f"请求超时: URL: {url}")
                raise HTTPException(status_code=504, detail="图片请求超时")
                
    except Exception as e:
        print(f"图片代理失败: {str(e)}, URL: {url}")
        raise HTTPException(status_code=500, detail=f"图片代理失败: {str(e)}")

@router.get("/api/trakt-proxy/{path:path}")
async def trakt_proxy(path: str, request: Request):
    """代理 Trakt API 请求并缓存结果"""
    try:
        # 构建缓存键
        cache_key = f"trakt:{path}:{request.query_params}"
        
        # 尝试从缓存获取
        cached_data = await get_cache(cache_key)
        if cached_data:
            return cached_data
            
        # 构建完整的 Trakt URL
        trakt_url = f"https://api.trakt.tv/{path}"
        
        # 获取原始查询参数
        params = dict(request.query_params)
        
        # 准备请求头
        headers = {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': '859d1ad30074136a934c47ba2083cda83620b17b0db8f2d0ec554922116c60a8'
        }
        
        # 发送请求
        async with aiohttp.ClientSession() as session:
            async with session.get(trakt_url, params=params, headers=headers) as response:
                if response.status != 200:
                    return HTTPException(status_code=response.status, detail="Trakt API 请求失败")
                
                # 获取响应数据
                data = await response.json()
                
                # 缓存结果 
                await set_cache(cache_key, data)
                
                return data
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"代理请求失败: {str(e)}")

# 在主应用中添加路由
app.include_router(router)
# ==========================================
# 6.1 手工榜单录入与聚合（管理员）
# ==========================================

def require_admin(user: User):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")

async def tmdb_enrich(tmdb_id: int, media_type: str):
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as session:
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
        params = {"api_key": "4f681fa7b5ab7346a4e184bbf2d41715", "language":"zh-CN"}
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="TMDB 信息获取失败")
            data = await resp.json()
            title = data.get("title") if media_type=="movie" else data.get("name")
            poster_path = data.get("poster_path")
            poster = f"/tmdb-images/w500{poster_path}" if poster_path else ""
            original_language = data.get("original_language")
            return {"title": title or "", "poster": poster or "", "original_language": original_language or ""}

@app.post("/api/charts/entries")
async def add_chart_entry(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_admin(current_user)
    body = await request.json()
    platform = body.get("platform")
    chart_name = body.get("chart_name")
    media_type = body.get("media_type")
    tmdb_id = body.get("tmdb_id")
    rank = body.get("rank")
    title = body.get("title")
    poster = body.get("poster")

    if not (platform and chart_name and media_type in ("movie","tv") and isinstance(tmdb_id, int) and isinstance(rank, int)):
        raise HTTPException(status_code=400, detail="参数不完整")

    enrich = await tmdb_enrich(tmdb_id, media_type)
    title = title or enrich["title"]
    poster = poster or enrich["poster"]
    original_language = enrich["original_language"]

    try:
        # 如果该排名已有条目，则更新为新条目（覆盖）
        existing = db.query(ChartEntry).filter(
            ChartEntry.platform == platform,
            ChartEntry.chart_name == chart_name,
            ChartEntry.media_type == media_type,
            ChartEntry.rank == rank,
        ).first()
        if existing:
            if existing.locked:
                raise HTTPException(status_code=423, detail="该排名已锁定，无法修改")
            existing.tmdb_id = tmdb_id
            existing.title = title
            existing.poster = poster
            existing.original_language = original_language
            existing.created_by = current_user.id
            db.commit()
            db.refresh(existing)
            return {"id": existing.id, "updated": True}

        entry = ChartEntry(
            platform=platform,
            chart_name=chart_name,
            media_type=media_type,
            tmdb_id=tmdb_id,
            title=title,
            poster=poster,
            rank=rank,
            original_language=original_language,
            created_by=current_user.id,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"保存失败或重复: {str(e)}")
    return {"id": entry.id}

@app.post("/api/charts/entries/bulk")
async def add_chart_entries_bulk(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_admin(current_user)
    items = (await request.json()).get("items", [])
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="items 必须是非空数组")

    created = []
    for item in items:
        try:
            platform = item.get("platform")
            chart_name = item.get("chart_name")
            media_type = item.get("media_type")
            tmdb_id = item.get("tmdb_id")
            rank = item.get("rank")
            title = item.get("title")
            poster = item.get("poster")
            if not (platform and chart_name and media_type in ("movie","tv") and isinstance(tmdb_id, int) and isinstance(rank, int)):
                continue
            enrich = await tmdb_enrich(tmdb_id, media_type)
            title = title or enrich["title"]
            poster = poster or enrich["poster"]
            original_language = enrich["original_language"]
            entry = ChartEntry(
                platform=platform,
                chart_name=chart_name,
                media_type=media_type,
                tmdb_id=tmdb_id,
                title=title,
                poster=poster,
                rank=rank,
                original_language=original_language,
                created_by=current_user.id,
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            created.append(entry.id)
        except Exception:
            db.rollback()
            continue
    return {"created": created}

def aggregate_top(
    db: Session,
    media_type: str,
    limit: int = 10,
    chinese_only: bool = False,
    exclude_pairs: list[tuple[str, str]] | None = None,
):
    # 同一平台/榜单/类型下，同一 rank 只取最近一条（允许覆盖历史）
    sub = db.query(
        ChartEntry.platform,
        ChartEntry.chart_name,
        ChartEntry.media_type,
        ChartEntry.rank,
        func.max(ChartEntry.id).label('max_id')
    ).group_by(ChartEntry.platform, ChartEntry.chart_name, ChartEntry.media_type, ChartEntry.rank).subquery()

    # 取最新记录集后再施加筛选条件（语言/排除来源）
    entries = db.query(ChartEntry).join(
        sub,
        (ChartEntry.id == sub.c.max_id)
    ).filter(ChartEntry.media_type == media_type)
    if chinese_only:
        entries = entries.filter(ChartEntry.original_language == "zh")
    if exclude_pairs:
        conditions = []
        for plat, chart in exclude_pairs:
            conditions.append(and_(ChartEntry.platform == plat, ChartEntry.chart_name == chart))
        if conditions:
            entries = entries.filter(not_(or_(*conditions)))
    entries = entries.all()
    # 频次统计：出现次数越多越靠前；同频次按最佳名次（rank 越小越好）
    freq: dict[int, int] = {}
    best_rank: dict[int, int] = {}
    sample: dict[int, ChartEntry] = {}
    
    logger.info(f"aggregate_top: 处理 {len(entries)} 条 {media_type} 条目")
    
    for e in entries:
        try:
            key = int(e.tmdb_id)
            freq[key] = freq.get(key, 0) + 1
            # 记录该作品在所有榜单中的最佳排名（最小的rank值）
            best_rank[key] = min(best_rank.get(key, 9999), int(e.rank) if e.rank is not None else 9999)
            if key not in sample:
                sample[key] = e
        except Exception as ex:
            logger.error(f"处理条目时出错: tmdb_id={e.tmdb_id}, title={e.title}, error={ex}")
            continue
    
    # 排序：频次降序 -> 最佳排名升序 -> tmdb_id升序
    try:
        ranked_keys = sorted(freq.keys(), key=lambda k: (-freq[k], best_rank[k], k))
    except Exception as ex:
        logger.error(f"排序失败: {ex}")
        # 降级处理：只按频次排序
        ranked_keys = sorted(freq.keys(), key=lambda k: -freq[k])
    
    logger.info(f"aggregate_top: 排序后前{min(limit, len(ranked_keys))}名")
    
    result = []
    for tmdb_id in ranked_keys[:limit]:
        try:
            e = sample[int(tmdb_id)]
            poster = e.poster or ""
            if poster and not (poster.startswith("/tmdb-images/") or poster.startswith("/api/") or poster.startswith("http")):
                # 兼容旧数据，自动补成 tmdb 相对路径
                if not poster.startswith("/"):
                    poster = "/" + poster
                poster = f"/tmdb-images{poster}"
            result.append({"id": e.tmdb_id, "type": media_type, "title": e.title, "poster": poster})
            logger.info(f"  {len(result)}. {e.title} - 频次={freq[tmdb_id]}, 最佳排名={best_rank[tmdb_id]}")
        except Exception as ex:
            logger.error(f"构建结果时出错: tmdb_id={tmdb_id}, error={ex}")
            continue
    
    return result

def latest_chart_top_by_rank(
    db: Session,
    platform: str,
    chart_name: str,
    media_type: str,
    limit: int = 10,
):
    # 取该平台+榜单+类型下，各 rank 最新的一条
    sub = db.query(
        ChartEntry.rank,
        func.max(ChartEntry.id).label('max_id')
    ).filter(
        ChartEntry.platform == platform,
        ChartEntry.chart_name == chart_name,
        ChartEntry.media_type == media_type,
    ).group_by(ChartEntry.rank).subquery()

    rows = db.query(ChartEntry).join(sub, ChartEntry.id == sub.c.max_id).order_by(ChartEntry.rank.asc()).limit(limit).all()
    result = []
    for e in rows:
        poster = e.poster or ""
        if poster and not (poster.startswith("/tmdb-images/") or poster.startswith("/api/") or poster.startswith("http")):
            if not poster.startswith("/"):
                poster = "/" + poster
            poster = f"/tmdb-images{poster}"
        result.append({
            "id": e.tmdb_id,
            "type": media_type,
            "title": e.title,
            "poster": poster,
        })
    return result

@app.get("/api/charts/entries")
async def list_chart_entries(
    platform: str,
    chart_name: str,
    media_type: str,
    db: Session = Depends(get_db)
):
    if media_type not in ("movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type 必须为 movie 或 tv")
    items = db.query(ChartEntry).filter(
        ChartEntry.platform == platform,
        ChartEntry.chart_name == chart_name,
        ChartEntry.media_type == media_type,
    ).order_by(ChartEntry.rank.asc()).all()
    return [
        {
            "id": e.id,
            "tmdb_id": e.tmdb_id,
            "rank": e.rank,
            "title": e.title,
            "poster": e.poster,
            "locked": e.locked,
        }
        for e in items
    ]

@app.put("/api/charts/entries/lock")
async def set_entry_lock(
    platform: str,
    chart_name: str,
    media_type: str,
    rank: int,
    locked: bool,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    entry = db.query(ChartEntry).filter(
        ChartEntry.platform == platform,
        ChartEntry.chart_name == chart_name,
        ChartEntry.media_type == media_type,
        ChartEntry.rank == rank,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="条目不存在")
    entry.locked = locked
    db.commit()
    return {"rank": rank, "locked": locked}

@app.delete("/api/charts/entries")
async def delete_chart_entry(
    platform: str,
    chart_name: str,
    media_type: str,
    rank: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    entry = db.query(ChartEntry).filter(
        ChartEntry.platform == platform,
        ChartEntry.chart_name == chart_name,
        ChartEntry.media_type == media_type,
        ChartEntry.rank == rank,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="条目不存在")
    if entry.locked:
        raise HTTPException(status_code=423, detail="该排名已锁定，无法删除")
    db.delete(entry)
    db.commit()
    return {"deleted": True, "rank": rank}

@app.get("/api/charts/aggregate")
async def get_aggregate_charts(db: Session = Depends(get_db)):
    try:
        # 华语剧集：直接使用豆瓣《一周华语剧集口碑榜》
        chinese_tv = latest_chart_top_by_rank(
            db,
            platform="豆瓣",
            chart_name="一周华语剧集口碑榜",
            media_type="tv",
            limit=10,
        )

        # 其他两个板块：排除掉豆瓣《一周华语剧集口碑榜》，且按出现频次/名次聚合
        exclude_pairs = [("豆瓣", "一周华语剧集口碑榜")]
        movies = aggregate_top(db, media_type="movie", limit=10, chinese_only=False)
        tv_candidates = aggregate_top(db, media_type="tv", limit=50, chinese_only=False, exclude_pairs=exclude_pairs)
        # 如果某条目仅出现在被排除榜（即聚合后仍混入），上面的排除逻辑已处理。
        # 为了更稳妥：将候选提升到50后再裁到10，保证频次排序的准确性。
        tv = tv_candidates[:10]
        return {"top_movies": movies, "top_tv": tv, "top_chinese_tv": chinese_tv}
    except Exception as e:
        logger.error(f"榜单聚合失败: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"榜单聚合失败: {str(e)}")


@app.post("/api/charts/auto-update")
async def auto_update_charts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """自动更新所有榜单数据"""
    require_admin(current_user)
    
    try:
        # 导入榜单抓取器
        from chart_scrapers import ChartScraper
        
        # 创建抓取器实例
        scraper = ChartScraper(db)
        
        # 执行所有平台的更新
        results = {}
        results['烂番茄电影'] = await scraper.update_rotten_movies()
        results['烂番茄TV'] = await scraper.update_rotten_tv()
        results['Letterboxd'] = await scraper.update_letterboxd_popular()
        results['Metacritic电影'] = await scraper.update_metacritic_movies()
        results['Metacritic剧集'] = await scraper.update_metacritic_shows()
        results['TMDB趋势'] = await scraper.update_tmdb_trending_all_week()
        results['Trakt电影'] = await scraper.update_trakt_movies_weekly()
        results['Trakt剧集'] = await scraper.update_trakt_shows_weekly()
        results['IMDb'] = await scraper.update_imdb_top10()
        results['豆瓣电影'] = await scraper.update_douban_weekly_movie()
        results['豆瓣华语剧集'] = await scraper.update_douban_weekly_chinese_tv()
        results['豆瓣全球剧集'] = await scraper.update_douban_weekly_global_tv()
        
        return {
            "status": "success",
            "message": "所有榜单数据已成功更新",
            "results": results,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"自动更新榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"自动更新失败: {str(e)}")

@app.post("/api/charts/auto-update/{platform}")
async def auto_update_platform_charts(
    platform: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """自动更新指定平台的榜单数据"""
    require_admin(current_user)
    
    try:
        # 导入榜单抓取器
        from chart_scrapers import ChartScraper
        
        # 创建抓取器实例
        scraper = ChartScraper(db)
        
        # 定义平台更新方法映射
        platform_updaters = {
            "豆瓣": [
                scraper.update_douban_weekly_movie,
                scraper.update_douban_weekly_chinese_tv,
                scraper.update_douban_weekly_global_tv
            ],
            "IMDb": [scraper.update_imdb_top10],
            "Letterboxd": [scraper.update_letterboxd_popular],
            "烂番茄": [scraper.update_rotten_movies, scraper.update_rotten_tv],
            "MTC": [scraper.update_metacritic_movies, scraper.update_metacritic_shows],
            "TMDB": [scraper.update_tmdb_trending_all_week],
            "Trakt": [scraper.update_trakt_movies_weekly, scraper.update_trakt_shows_weekly]
        }
        
        if platform not in platform_updaters:
            raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}")
        
        # 执行该平台的所有更新方法
        results = {}
        for i, updater in enumerate(platform_updaters[platform]):
            count = await updater()
            results[f"{platform}_{i+1}"] = count
        
        return {
            "status": "success",
            "message": f"{platform} 平台榜单数据已成功更新",
            "platform": platform,
            "results": results,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"自动更新 {platform} 榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"自动更新 {platform} 失败: {str(e)}")

@app.post("/api/scheduler/test-notification")
async def test_notification(
    current_user: User = Depends(get_current_user)
):
    """测试Telegram通知"""
    require_admin(current_user)
    
    try:
        from chart_scrapers import telegram_notifier
        success = await telegram_notifier.send_message("🧪 *测试通知*\\n\\n这是一条测试消息，用于验证Telegram通知功能是否正常工作。")
        
        if success:
            return {
                "status": "success",
                "message": "测试通知发送成功"
            }
        else:
            return {
                "status": "error",
                "message": "测试通知发送失败，请检查Telegram配置"
            }
    except Exception as e:
        logger.error(f"测试通知失败: {e}")
        raise HTTPException(status_code=500, detail=f"测试通知失败: {str(e)}")

@app.get("/api/charts/status")
async def get_charts_status(db: Session = Depends(get_db)):
    """获取榜单数据状态"""
    try:
        # 获取各平台最新的榜单数据统计
        platforms = ["豆瓣", "IMDb", "Letterboxd", "烂番茄", "MTC"]
        status = {}
        
        for platform in platforms:
            # 获取该平台下所有榜单的最新更新时间
            latest_entries = db.query(
                ChartEntry.platform,
                ChartEntry.chart_name,
                ChartEntry.media_type,
                func.max(ChartEntry.created_at).label('latest_update')
            ).filter(
                ChartEntry.platform == platform
            ).group_by(
                ChartEntry.platform,
                ChartEntry.chart_name,
                ChartEntry.media_type
            ).all()
            
            platform_status = []
            for entry in latest_entries:
                # 获取该榜单的条目数量
                count = db.query(ChartEntry).filter(
                    ChartEntry.platform == entry.platform,
                    ChartEntry.chart_name == entry.chart_name,
                    ChartEntry.media_type == entry.media_type
                ).count()
                
                platform_status.append({
                    "chart_name": entry.chart_name,
                    "media_type": entry.media_type,
                    "count": count,
                    "last_updated": entry.latest_update.isoformat() if entry.latest_update else None
                })
            
            status[platform] = platform_status
        
        return {
            "status": "success",
            "data": status,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"获取榜单状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取榜单状态失败: {str(e)}")

@app.post("/api/scheduler/start")
async def start_scheduler_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """启动定时任务调度器"""
    require_admin(current_user)
    
    try:
        from chart_scrapers import start_auto_scheduler
        logger.info(f"用户 {current_user.email} 尝试启动调度器")
        
        scheduler = await start_auto_scheduler()
        scheduler_status = scheduler.get_status()
        logger.info(f"调度器启动成功，状态: {scheduler_status}")
        
        # 更新数据库状态
        db_status = SchedulerStatus(
            running=True,
            next_update=datetime.fromisoformat(scheduler_status['next_update'].replace('+08:00', '')),
            last_update=datetime.fromisoformat(scheduler_status['last_update']) if scheduler_status['last_update'] else None
        )
        db.add(db_status)
        db.commit()
        logger.info("数据库状态已更新")
        
        return {
            "status": "success",
            "message": "定时任务调度器已启动",
            "timestamp": datetime.utcnow().isoformat(),
            "scheduler_status": scheduler_status
        }
    except Exception as e:
        logger.error(f"启动调度器失败: {e}")
        import traceback
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"启动调度器失败: {str(e)}")

@app.post("/api/scheduler/stop")
async def stop_scheduler_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """停止定时任务调度器"""
    require_admin(current_user)
    
    try:
        from chart_scrapers import stop_auto_scheduler
        stop_auto_scheduler()
        
        # 更新数据库状态
        db_status = SchedulerStatus(
            running=False,
            next_update=None,
            last_update=None
        )
        db.add(db_status)
        db.commit()
        logger.info("调度器已停止，数据库状态已更新")
        
        return {
            "status": "success",
            "message": "定时任务调度器已停止",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"停止调度器失败: {e}")
        raise HTTPException(status_code=500, detail=f"停止调度器失败: {str(e)}")

@app.get("/api/scheduler/status")
async def get_scheduler_status_endpoint(db: Session = Depends(get_db)):
    """获取调度器状态"""
    try:
        # 首先尝试从数据库获取状态
        db_status = db.query(SchedulerStatus).order_by(SchedulerStatus.updated_at.desc()).first()
        
        if db_status:
            logger.info(f"从数据库获取调度器状态: running={db_status.running}")
            return {
                "status": "success",
                "data": {
                    "running": db_status.running,
                    "next_update": db_status.next_update.isoformat() if db_status.next_update else None,
                    "last_update": db_status.last_update.isoformat() if db_status.last_update else None
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            # 如果数据库中没有状态，使用内存中的状态
            from chart_scrapers import get_scheduler_status
            status = get_scheduler_status()
            logger.info(f"从内存获取调度器状态: {status}")
            return {
                "status": "success",
                "data": status,
                "timestamp": datetime.utcnow().isoformat()
            }
    except Exception as e:
        logger.error(f"获取调度器状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取调度器状态失败: {str(e)}")


@app.get("/api/health")
async def health_check():
    """健康检查端点"""
    # 检查Redis连接
    redis_status = "healthy" if redis else "unhealthy"
    
    # 检查浏览器池
    browser_pool_stats = browser_pool.get_stats()
    browser_pool_status = "healthy" if browser_pool.initialized else "unhealthy"
    
    return {
        "status": "ok",
        "redis": redis_status,
        "browser_pool": browser_pool_status,
        "browser_pool_stats": browser_pool_stats
    }

# ==========================================
# 7. 应用启动和关闭事件
# ==========================================

@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    global redis
    try:
        # 初始化Redis
        redis = await aioredis.from_url(
            REDIS_URL,
            encoding='utf-8',
            decode_responses=True
        )
        logger.info("Redis连接成功")
    except Exception as e:
        logger.error(f"Redis 连接初始化失败: {e}")
        redis = None
        
    # 初始化浏览器池
    try:
        # 使用环境变量配置浏览器池（默认值已优化）
        BROWSER_POOL_SIZE = int(os.getenv("BROWSER_POOL_SIZE", "5"))
        BROWSER_POOL_CONTEXTS = int(os.getenv("BROWSER_POOL_CONTEXTS", "3"))
        BROWSER_POOL_PAGES = int(os.getenv("BROWSER_POOL_PAGES", "5"))
        
        browser_pool.max_browsers = BROWSER_POOL_SIZE
        browser_pool.max_contexts_per_browser = BROWSER_POOL_CONTEXTS
        browser_pool.max_pages_per_context = BROWSER_POOL_PAGES
        
        await browser_pool.initialize()
        logger.info(f"浏览器池初始化成功，共 {BROWSER_POOL_SIZE} 个浏览器实例")
    except Exception as e:
        logger.error(f"浏览器池初始化失败: {e}")
    
    # 生产环境自动启动调度器（可选）
    if os.getenv("ENV") != "development":
        try:
            from chart_scrapers import start_auto_scheduler
            await start_auto_scheduler()
            logger.info("生产环境：定时调度器已自动启动")
        except Exception as e:
            logger.error(f"生产环境：自动启动调度器失败: {e}")

@app.post("/api/charts/clear/{platform}")
async def clear_platform_charts(
    platform: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """清空指定平台的所有榜单"""
    require_admin(current_user)
    
    try:
        # 删除指定平台的所有榜单条目
        deleted_count = db.query(ChartEntry).filter(ChartEntry.platform == platform).delete()
        db.commit()
        
        return {
            "status": "success",
            "message": f"已清空 {platform} 平台的所有榜单，共删除 {deleted_count} 条记录",
            "deleted_count": deleted_count,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"清空 {platform} 平台榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"清空榜单失败: {str(e)}")

@app.post("/api/charts/clear-all")
async def clear_all_charts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """清空所有平台的所有榜单"""
    require_admin(current_user)
    
    try:
        # 删除所有榜单条目
        deleted_count = db.query(ChartEntry).delete()
        db.commit()
        
        return {
            "status": "success",
            "message": f"已清空所有平台的所有榜单，共删除 {deleted_count} 条记录",
            "deleted_count": deleted_count,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"清空所有榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"清空所有榜单失败: {str(e)}")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时清理资源"""
    # 清理浏览器池
    try:
        await browser_pool.cleanup()
        print("浏览器池已清理")
    except Exception as e:
        print(f"浏览器池清理失败: {e}")
    
    # 清理 TMDB 客户端连接池
    global _tmdb_client
    if _tmdb_client and not _tmdb_client.is_closed:
        try:
            await _tmdb_client.aclose()
            print("TMDB 客户端连接池已关闭")
        except Exception as e:
            print(f"TMDB 客户端清理失败: {e}")
