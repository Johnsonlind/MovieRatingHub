# ==========================================
# 主程序
# ==========================================
import asyncio
import os
from dotenv import load_dotenv
import time
import ssl
from typing import Optional
import hashlib
import httpx
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Request, Depends, APIRouter, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from models import SQLALCHEMY_DATABASE_URL, User, Favorite, FavoriteList, SessionLocal, PasswordReset, Follow, ChartEntry, PublicChartEntry, SchedulerStatus
from sqlalchemy.orm import Session, selectinload
from ratings import extract_rating_info, get_tmdb_info, RATING_STATUS, search_platform, create_rating_data
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
from sqlalchemy import func, or_, not_, and_, create_engine
from sqlalchemy.pool import QueuePool
from fastapi.middleware.gzip import GZipMiddleware
from browser_pool import browser_pool
import traceback

# ==========================================
# 1. 配置和初始化部分
# ==========================================

REDIS_URL = "redis://:l1994z0912x@localhost:6379/0"
CACHE_EXPIRE_TIME = 24 * 60 * 60
CHARTS_CACHE_EXPIRE = 2 * 60
redis = None

SECRET_KEY = "L1994z0912x."
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
REMEMBER_ME_TOKEN_EXPIRE_DAYS = 30

FRONTEND_URL = "http://localhost:5173" if os.getenv("ENV") == "development" else "https://ratefuse.cn"

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

app.add_middleware(GZipMiddleware, minimum_size=1000)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800
)

# ==========================================
# 2. 辅助类和函数
# ==========================================

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

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
oauth2_scheme_optional = OAuth2PasswordBearerOptional(tokenUrl="token", auto_error=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
            
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            return None
            
        return user
    except JWTError:
        return None

async def get_cache(key: str):
    """从 Redis 获取缓存数据"""
    if not redis:
        return None
        
    try:
        data = await redis.get(key)
        
        if data:
            data = json.loads(data)
            if isinstance(data, dict) and "status" in data:
                if data.get("status") == RATING_STATUS["SUCCESSFUL"]:
                    return data
                return None
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
        if isinstance(data, dict) and "status" in data:
            if data.get("status") == RATING_STATUS["SUCCESSFUL"]:
                await redis.setex(key, expire, json.dumps(data))
        else:
            await redis.setex(key, expire, json.dumps(data))
    except Exception as e:
        logger.error(f"设置缓存出错: {e}")


async def get_tmdb_info_cached(id: str, type: str, request: Request):
    """带 Redis 缓存的 TMDB 基础信息获取"""
    cache_key = f"tmdb:info:{type}:{id}"
    cached = await get_cache(cache_key)
    if cached:
        return cached
    tmdb_info = await get_tmdb_info(id, type, request)
    if tmdb_info:
        await set_cache(cache_key, tmdb_info, expire=CACHE_EXPIRE_TIME)
    return tmdb_info

def generate_reset_token():
    return secrets.token_urlsafe(32)

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
    
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=400,
            detail="该邮箱已被注册"
        )
    
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(
            status_code=400,
            detail="该用户名已被使用"
        )
    
    hashed_password = get_password_hash(password)
    user = User(
        email=email,
        username=username,
        hashed_password=hashed_password
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
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
                "avatar": user.avatar,
                "is_admin": getattr(user, "is_admin", False),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"登录过程出错: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"登录失败: {str(e)}"
        )

@app.post("/auth/forgot-password")
async def forgot_password(
    request: Request,
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        email = data.get("email")
        
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=404,
                detail="未找到该邮箱对应的用户"
            )
        
        token = generate_reset_token()
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        reset_record = PasswordReset(
            email=email,
            token=token,
            expires_at=expires_at
        )
        db.add(reset_record)
        db.commit()
        
        reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
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

@app.put("/api/user/douban-cookie")
async def update_douban_cookie(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新用户的豆瓣Cookie"""
    try:
        data = await request.json()
        cookie = data.get("cookie", "").strip()
        
        if cookie:
            current_user.douban_cookie = cookie
        else:
            current_user.douban_cookie = None
        
        db.commit()
        
        return {
            "message": "豆瓣Cookie更新成功" if cookie else "豆瓣Cookie已清除",
            "has_cookie": bool(cookie)
        }
    except Exception as e:
        db.rollback()
        logger.error(f"更新豆瓣Cookie时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user/douban-cookie")
async def get_douban_cookie(
    current_user: User = Depends(get_current_user)
):
    """获取用户的豆瓣Cookie状态"""
    return {
        "has_cookie": bool(current_user.douban_cookie)
    }

@app.put("/api/user/profile")
async def update_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        data = await request.json()
        
        if data.get("avatar"):
            if not data["avatar"].startswith('data:image/'):
                raise HTTPException(
                    status_code=400,
                    detail="无效的图片格式"
                )
            avatar_data = data["avatar"].split(',')[1]
            if len(avatar_data) > 2 * 1024 * 1024:
                raise HTTPException(
                    status_code=400,
                    detail="图片大小不能超过 2MB"
                )
            current_user.avatar = data["avatar"]
        
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
        
        required_fields = ["media_id", "media_type", "title", "poster", "list_id"]
        for field in required_fields:
            if field not in data:
                raise HTTPException(
                    status_code=400,
                    detail=f"缺少必要字段: {field}"
                )
        
        favorite_list = db.query(FavoriteList).filter(
            FavoriteList.id == data["list_id"],
            FavoriteList.user_id == current_user.id
        ).first()
        
        if not favorite_list:
            raise HTTPException(
                status_code=404,
                detail="收藏列表不存在或无权限访问"
            )
        
        max_sort_order = db.query(func.max(Favorite.sort_order)).filter(
            Favorite.list_id == data["list_id"]
        ).scalar()
        
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
        lists = (
            db.query(FavoriteList)
            .options(selectinload(FavoriteList.favorites))
            .filter(FavoriteList.user_id == current_user.id)
            .all()
        )

        original_list_ids = {lst.original_list_id for lst in lists if lst.original_list_id}
        original_lists_map = {}
        original_creators_map = {}

        if original_list_ids:
            original_lists = (
                db.query(FavoriteList)
                .options(selectinload(FavoriteList.user))
                .filter(FavoriteList.id.in_(original_list_ids))
                .all()
            )
            for ol in original_lists:
                original_lists_map[ol.id] = ol
                if ol.user:
                    original_creators_map[ol.id] = {
                        "id": ol.user.id,
                        "username": ol.user.username,
                        "avatar": ol.user.avatar,
                    }

        creator = {
            "id": current_user.id,
            "username": current_user.username,
            "avatar": current_user.avatar,
        }

        result = []
        for lst in lists:
            original_creator = original_creators_map.get(lst.original_list_id)

            favorites = sorted(
                lst.favorites or [],
                key=lambda fav: (
                    fav.sort_order is None,
                    fav.sort_order if fav.sort_order is not None else 0,
                    fav.id,
                ),
            )

            result.append(
                {
                    "id": lst.id,
                    "name": lst.name,
                    "description": lst.description,
                    "is_public": lst.is_public,
                    "created_at": lst.created_at,
                    "original_list_id": lst.original_list_id,
                    "original_creator": original_creator,
                    "creator": creator,
                    "favorites": [
                        {
                            "id": fav.id,
                            "media_id": fav.media_id,
                            "media_type": fav.media_type,
                            "title": fav.title,
                            "poster": fav.poster,
                            "year": fav.year,
                            "overview": fav.overview,
                            "note": fav.note,
                            "sort_order": fav.sort_order,
                        }
                        for fav in favorites
                    ],
                }
            )

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
        
        if not data.get("name"):
            raise HTTPException(
                status_code=400,
                detail="列表名称不能为空"
            )
        
        existing_list = db.query(FavoriteList).filter(
            FavoriteList.user_id == current_user.id,
            FavoriteList.name == data["name"]
        ).first()
        
        if existing_list:
            raise HTTPException(
                status_code=400,
                detail="已存在同名收藏列表"
            )
        
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
        
        favorite_list = db.query(FavoriteList).filter(
            FavoriteList.id == list_id,
            FavoriteList.user_id == current_user.id
        ).first()
        
        if not favorite_list:
            raise HTTPException(status_code=404, detail="收藏列表不存在或无权限")
        
        for item in favorite_orders:
            favorite = db.query(Favorite).filter(
                Favorite.id == item['id'],
                Favorite.list_id == list_id
            ).first()
            
            if favorite:
                favorite.sort_order = item['sort_order']
        
        db.commit()
        
        updated_favorites = db.query(Favorite).filter(
            Favorite.list_id == list_id
        ).order_by(
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
        collected_list = db.query(FavoriteList).filter(
            FavoriteList.user_id == current_user.id,
            FavoriteList.original_list_id == list_id
        ).first()
        
        if not collected_list:
            raise HTTPException(
                status_code=404,
                detail="未找到已收藏的列表"
            )

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
        query = db.query(FavoriteList).filter(FavoriteList.user_id == user_id)
        
        if not current_user or current_user.id != user_id:
            query = query.filter(FavoriteList.is_public == True)
            
        lists = query.all()
        
        result = []
        for list in lists:
            favorites = db.query(Favorite).filter(
                Favorite.list_id == list.id
            ).order_by(
                Favorite.sort_order.is_(None),
                Favorite.sort_order,
                Favorite.id
            ).all()
            
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
        follows = (
            db.query(Follow)
            .options(selectinload(Follow.following))
            .filter(Follow.follower_id == current_user.id)
            .all()
        )

        return [
            {
                "id": follow.following.id,
                "username": follow.following.username,
                "avatar": follow.following.avatar,
                "note": follow.note,
                "created_at": follow.created_at,
            }
            for follow in follows
            if follow.following is not None
        ]
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
async def get_batch_ratings(
    request: Request, 
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """批量获取多个影视的评分信息"""
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
        
        douban_cookie = None
        if current_user:
            if current_user.douban_cookie:
                douban_cookie = current_user.douban_cookie
                print(f"✅ 已获取用户 {current_user.id} 的豆瓣Cookie（长度: {len(douban_cookie)}）")
            else:
                print(f"⚠️ 用户 {current_user.id} 未设置豆瓣Cookie")
        else:
            print("⚠️ 未登录用户，无法使用豆瓣Cookie")
        
        async def get_item_info(item):
            media_id = item['id']
            media_type = item['type']
            
            cache_key = f"ratings:all:{media_type}:{media_id}"
            cached = await get_cache(cache_key)
            if cached:
                return media_id, {'cached': True, 'data': cached}
            
            try:
                tmdb_info = await get_tmdb_info_cached(media_id, media_type, request)
                if not tmdb_info:
                    return media_id, {'error': 'TMDB信息获取失败'}
                
                return media_id, {'tmdb_info': tmdb_info, 'type': media_type}
            except Exception as e:
                return media_id, {'error': str(e)}
        
        tmdb_tasks = [get_item_info(item) for item in items]
        tmdb_results = await asyncio.gather(*tmdb_tasks, return_exceptions=True)
        
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
        
        sem = asyncio.Semaphore(max_concurrent)
        
        async def fetch_one_item(media_id, tmdb_info, media_type):
            async with sem:
                try:
                    item_start = time.time()
                    title = tmdb_info.get('zh_title') or tmdb_info.get('title', media_id)
                    logger.info(f"  → {title[:30]}... (ID: {media_id})")
                    
                    from ratings import parallel_extract_ratings
                    
                    ratings = await asyncio.wait_for(
                        parallel_extract_ratings(tmdb_info, media_type, request, douban_cookie),
                        timeout=20.0
                    )
                    
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
        
        if to_fetch:
            fetch_tasks = [
                fetch_one_item(media_id, tmdb_info, media_type)
                for media_id, tmdb_info, media_type in to_fetch
            ]
            fetch_results = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        else:
            fetch_results = []
        
        final_results = {}
        
        for media_id, data in cached_results.items():
            final_results[media_id] = {
                'ratings': data,
                'status': 'success',
                'from_cache': True
            }
        
        for result in fetch_results:
            if isinstance(result, Exception):
                continue
            media_id, data = result
            final_results[media_id] = data
        
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
async def get_all_platform_ratings(
    type: str, 
    id: str, 
    request: Request,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """并行获取所有平台的评分信息"""
    start_time = time.time()
    try:
        if await request.is_disconnected():
            print("请求已在开始时被取消")
            return None

        douban_cookie = None
        if current_user:
            if current_user.douban_cookie:
                douban_cookie = current_user.douban_cookie
                print(f"✅ 已获取用户 {current_user.id} 的豆瓣Cookie（长度: {len(douban_cookie)}）")
            else:
                print(f"⚠️ 用户 {current_user.id} 未设置豆瓣Cookie")
        else:
            print("⚠️ 未登录用户，无法使用豆瓣Cookie")
        
        cache_key = f"ratings:all:{type}:{id}"
        cached_data = await get_cache(cache_key)
        if cached_data:
            print(f"从缓存获取所有平台评分数据，耗时: {time.time() - start_time:.2f}秒")
            return cached_data
        
        tmdb_info = await get_tmdb_info_cached(id, type, request)
        if not tmdb_info:
            if await request.is_disconnected():
                print("请求在获取TMDB信息时被取消")
                return None
            raise HTTPException(status_code=404, detail="无法获取 TMDB 信息")
        
        if await request.is_disconnected():
            print("请求在获取TMDB信息后被取消")
            return None
        
        from ratings import parallel_extract_ratings
        
        try:
            all_ratings = await asyncio.wait_for(
                parallel_extract_ratings(tmdb_info, tmdb_info["type"], request, douban_cookie),
                timeout=20.0
            )
        except asyncio.TimeoutError:
            logger.error("获取评分超时（>20秒）")
            raise HTTPException(status_code=504, detail="获取评分超时")
        
        if await request.is_disconnected():
            return None
        
        total_time = time.time() - start_time
        
        if all_ratings:
            await set_cache(cache_key, all_ratings, expire=CACHE_EXPIRE_TIME)
        
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
async def get_platform_rating(
    platform: str, 
    type: str, 
    id: str, 
    request: Request,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """获取指定平台的评分信息，优化缓存和错误处理"""
    start_time = time.time()
    try:
        if await request.is_disconnected():
            print(f"{platform} 请求已在开始时被取消")
            return None
        
        douban_cookie = None
        if platform == "douban":
            if current_user:
                if current_user.douban_cookie:
                    douban_cookie = current_user.douban_cookie
                    print(f"✅ 已获取用户 {current_user.id} 的豆瓣Cookie（长度: {len(douban_cookie)}）")
                else:
                    print(f"⚠️ 用户 {current_user.id} 未设置豆瓣Cookie")
            else:
                print("⚠️ 未登录用户，无法使用豆瓣Cookie")
        
        cache_key = f"rating:{platform}:{type}:{id}"
        cached_data = await get_cache(cache_key)
        if cached_data:
            print(f"从缓存获取 {platform} 评分数据，耗时: {time.time() - start_time:.2f}秒")
            return cached_data

        tmdb_info = await get_tmdb_info_cached(id, type, request)
        if not tmdb_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在获取TMDB信息时被取消")
                return None
            raise HTTPException(status_code=404, detail="无法获取 TMDB 信息")

        if await request.is_disconnected():
            print(f"{platform} 请求在获取TMDB信息后被取消")
            return None

        search_start_time = time.time()
        search_results = await search_platform(platform, tmdb_info, request, douban_cookie)

        if isinstance(search_results, dict) and search_results.get("status") in (
            RATING_STATUS["NO_FOUND"],
            RATING_STATUS["RATE_LIMIT"],
            RATING_STATUS["TIMEOUT"],
            RATING_STATUS["FETCH_FAILED"],
        ):
            reason = search_results.get("status_reason") or search_results.get("status")
            rating_info = create_rating_data(search_results["status"], reason)
            rating_info["_performance"] = {
                "total_time": round(time.time() - start_time, 2),
                "search_time": round(time.time() - search_start_time, 2),
                "extract_time": 0,
                "cached": False,
            }
            return rating_info

        if await request.is_disconnected():
            print(f"{platform} 请求在搜索平台后被取消")
            return None

        if isinstance(search_results, dict) and search_results.get("status") == "cancelled":
            print(f"{platform} 搜索被取消")
            return None

        extract_start_time = time.time()
        rating_info = await extract_rating_info(type, platform, tmdb_info, search_results, request, douban_cookie)

        if await request.is_disconnected():
            print(f"{platform} 请求在获取评分信息后被取消")
            return None

        if not rating_info:
            if await request.is_disconnected():
                print(f"{platform} 请求在处理评分信息时被取消")
                return None
            raise HTTPException(status_code=404, detail=f"未找到 {platform} 的评分信息")

        if isinstance(rating_info, dict) and rating_info.get("status") == "cancelled":
            print(f"{platform} 评分提取被取消")
            return None

        if isinstance(rating_info, dict) and rating_info.get("status") == RATING_STATUS["SUCCESSFUL"]:
            await set_cache(cache_key, rating_info)
            print(f"已缓存 {platform} 评分数据")
        else:
            print(f"不缓存 {platform} 评分数据，状态: {rating_info.get('status')}")

        total_time = time.time() - start_time
        
        if isinstance(rating_info, dict):
            rating_info["_performance"] = {
                "total_time": round(total_time, 2),
                "search_time": round(time.time() - search_start_time, 2),
                "extract_time": round(time.time() - extract_start_time, 2),
                "cached": False
            }

        return rating_info

    except HTTPException:
        raise
    except Exception as e:
        if await request.is_disconnected():
            print(f"{platform} 请求在发生错误时被取消")
            return None
        
        print(f"获取 {platform} 评分时出错: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"获取评分失败: {str(e)}")
    finally:
        print(f"{platform} 请求处理完成，总耗时: {time.time() - start_time:.2f}秒")

router = APIRouter()

_tmdb_client = None

async def get_tmdb_client():
    """获取或创建 TMDB API 客户端"""
    global _tmdb_client
    if _tmdb_client is None or _tmdb_client.is_closed:
        _tmdb_client = httpx.AsyncClient(
            http2=True,
            timeout=httpx.Timeout(10.0),
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
                keepalive_expiry=30.0
            ),
            headers={
                "accept": "application/json",
                "accept-encoding": "gzip, deflate",
                "Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0ZjY4MWZhN2I1YWI3MzQ2YTRlMTg0YmJmMmQ0MTcxNSIsIm5iZiI6MTUyNjE3NDY5MC4wMjksInN1YiI6IjVhZjc5M2UyOTI1MTQxMmM4MDAwNGE5ZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.maKS7ZH7y6l_H0_dYcXn5QOZHuiYdK_SsiQ5AAk32cI"
            }
        )
    return _tmdb_client

def _normalized_query_for_cache(query_params) -> str:
    """将 query 参数按 key 排序后拼接"""
    if not query_params:
        return ""
    sorted_items = sorted(query_params.items(), key=lambda x: x[0])
    return "&".join(f"{k}={v}" for k, v in sorted_items)

_tmdb_search_times: dict[str, list[float]] = {}
_tmdb_rate_lock = asyncio.Lock()
TMDB_SEARCH_LIMIT = 10
TMDB_SEARCH_WINDOW = 10.0


async def _check_tmdb_search_rate_limit(client_ip: str) -> None:
    """仅对 search 路径限流，超限抛 429"""
    if not client_ip:
        return
    now = time.time()
    async with _tmdb_rate_lock:
        if client_ip not in _tmdb_search_times:
            _tmdb_search_times[client_ip] = []
        times = _tmdb_search_times[client_ip]
        times[:] = [t for t in times if now - t < TMDB_SEARCH_WINDOW]
        if len(times) >= TMDB_SEARCH_LIMIT:
            raise HTTPException(status_code=429, detail="TMDB 搜索请求过于频繁，请稍后再试")
        times.append(now)


@router.get("/api/tmdb-proxy/{path:path}")
async def tmdb_proxy(path: str, request: Request):
    """代理 TMDB API 请求并缓存结果"""
    try:
        qs = _normalized_query_for_cache(dict(request.query_params))
        cache_key = f"tmdb:{path}:{qs}"
        cached_data = await get_cache(cache_key)
        if cached_data:
            return cached_data
        if path.strip("/").startswith("search"):
            client_ip = request.client.host if request.client else ""
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                client_ip = forwarded.split(",")[0].strip()
            await _check_tmdb_search_rate_limit(client_ip)
        
        params = dict(request.query_params)
        tmdb_url = f"https://api.themoviedb.org/3/{path}"
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
            
            data = response.json()
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
        if url.startswith('/tmdb-images/'):
            url = f"https://image.tmdb.org/t/p{url[12:]}"
        
        cache_key = f"img:{url}"
        
        if redis:
            try:
                cached_url = await redis.get(cache_key)
                if cached_url:
                    response.headers["Location"] = cached_url.decode('utf-8')
                    response.status_code = 302
                    return
            except Exception as redis_error:
                print(f"Redis缓存错误: {str(redis_error)}")
        
        etag = 'W/"' + hashlib.md5(url.encode('utf-8')).hexdigest() + '"'
        inm = None
        try:
            inm = response.headers.get('If-None-Match')
        except Exception:
            pass

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
                    
                    content_type = img_response.headers.get("Content-Type", "image/jpeg")
                    image_data = await img_response.read()
                    
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
        cache_key = f"trakt:{path}:{request.query_params}"
        cached_data = await get_cache(cache_key)
        if cached_data:
            return cached_data
        
        trakt_url = f"https://api.trakt.tv/{path}"
        params = dict(request.query_params)
        headers = {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': 'db74b025288459dc36589f6207fb96aabd83be8ea5d502810a049c29ffd9bff0'
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(trakt_url, params=params, headers=headers) as response:
                if response.status != 200:
                    return HTTPException(status_code=response.status, detail="Trakt API 请求失败")
                
                data = await response.json()
                await set_cache(cache_key, data)
                
                return data
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"代理请求失败: {str(e)}")

app.include_router(router)
# ==========================================
# 6.1 手工榜单录入与聚合（管理员）
# ==========================================

def require_admin(user: User):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")

async def tmdb_enrich(tmdb_id: int, media_type: str):
    """使用多语言回退获取TMDB信息"""
    from ratings import _fetch_tmdb_with_language_fallback, get_tmdb_http_client
    
    try:
        client = get_tmdb_http_client()
        endpoint = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}"
        
        data = await _fetch_tmdb_with_language_fallback(client, endpoint)
        
        if not data:
            raise HTTPException(status_code=400, detail="TMDB 信息获取失败")
        
        title = data.get("title") if media_type == "movie" else data.get("name")
        poster_path = data.get("poster_path")
        poster = f"/tmdb-images/w500{poster_path}" if poster_path else ""
        original_language = data.get("original_language", "")
        
        return {
            "title": title or "", 
            "poster": poster or "", 
            "original_language": original_language or ""
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"TMDB 信息获取失败: {str(e)}")

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
    """批量录入榜单"""
    require_admin(current_user)
    items = (await request.json()).get("items", [])
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="items 必须是非空数组")

    valid = []
    for item in items:
        platform = item.get("platform")
        chart_name = item.get("chart_name")
        media_type = item.get("media_type")
        tmdb_id = item.get("tmdb_id")
        rank = item.get("rank")
        title = item.get("title")
        poster = item.get("poster")
        if not (platform and chart_name and media_type in ("movie", "tv") and isinstance(tmdb_id, int) and isinstance(rank, int)):
            continue
        try:
            enrich = await tmdb_enrich(tmdb_id, media_type)
            title = title or enrich["title"]
            poster = poster or enrich["poster"]
            original_language = enrich.get("original_language", "")
            valid.append(ChartEntry(
                platform=platform,
                chart_name=chart_name,
                media_type=media_type,
                tmdb_id=tmdb_id,
                title=title,
                poster=poster,
                rank=rank,
                original_language=original_language,
                created_by=current_user.id,
            ))
        except Exception:
            continue
    if not valid:
        return {"created": []}
    try:
        db.add_all(valid)
        db.commit()
        for e in valid:
            db.refresh(e)
        created = [e.id for e in valid]
        if redis:
            try:
                await redis.delete("charts:aggregate", "charts:public")
            except Exception:
                pass
        return {"created": created}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"批量保存失败: {str(e)}")

def aggregate_top(
    db: Session,
    media_type: str,
    limit: int = 10,
    chinese_only: bool = False,
    include_pairs: list[tuple[str, str]] | None = None,
):
    sub = db.query(
        ChartEntry.platform,
        ChartEntry.chart_name,
        ChartEntry.media_type,
        ChartEntry.rank,
        func.max(ChartEntry.id).label('max_id')
    ).group_by(ChartEntry.platform, ChartEntry.chart_name, ChartEntry.media_type, ChartEntry.rank).subquery()

    entries = db.query(ChartEntry).join(
        sub,
        (ChartEntry.id == sub.c.max_id)
    ).filter(ChartEntry.media_type == media_type)
    if chinese_only:
        entries = entries.filter(ChartEntry.original_language == "zh")
    if include_pairs:
        conditions = []
        for plat, chart in include_pairs:
            conditions.append(and_(ChartEntry.platform == plat, ChartEntry.chart_name == chart))
        if conditions:
            entries = entries.filter(or_(*conditions))
    entries = entries.all()
    freq: dict[int, int] = {}
    best_rank: dict[int, int] = {}
    latest_id: dict[int, int] = {}
    sample: dict[int, ChartEntry] = {}
    for e in entries:
        key = int(e.tmdb_id)
        freq[key] = freq.get(key, 0) + 1
        best_rank[key] = min(best_rank.get(key, 9999), int(e.rank) if e.rank is not None else 9999)
        latest_id[key] = max(latest_id.get(key, 0), int(e.id))
        if key not in sample:
            sample[key] = e
    ranked_keys = sorted(freq.keys(), key=lambda k: (-freq[k], best_rank[k], -latest_id[k], k))
    result = []
    for tmdb_id in ranked_keys[:limit]:
        e = sample[int(tmdb_id)]
        poster = e.poster or ""
        if poster and not (poster.startswith("/tmdb-images/") or poster.startswith("/api/") or poster.startswith("http")):
            if not poster.startswith("/"):
                poster = "/" + poster
            poster = f"/tmdb-images{poster}"
        result.append({"id": e.tmdb_id, "type": media_type, "title": e.title, "poster": poster})
    return result

def latest_chart_top_by_rank(
    db: Session,
    platform: str,
    chart_name: str,
    media_type: str,
    limit: int = 10,
):
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
    items = (
        db.query(ChartEntry)
        .filter(
            ChartEntry.platform == platform,
            ChartEntry.chart_name == chart_name,
            ChartEntry.media_type == media_type,
        )
        .order_by(ChartEntry.rank.asc())
        .limit(500)
        .all()
    )
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
    cache_key = "charts:aggregate"
    cached = await get_cache(cache_key)
    if cached:
        return cached

    chinese_tv = latest_chart_top_by_rank(
        db,
        platform="豆瓣",
        chart_name="一周华语剧集口碑榜",
        media_type="tv",
        limit=10,
    )

    movie_include_pairs = [
        ("豆瓣", "一周口碑榜"),
        ("IMDb", "Top 10 on IMDb this week"),
        ("烂番茄", "Popular Streaming Movies"),
        ("MTC", "Trending Movies This Week"),
        ("Letterboxd", "Popular films this week"),
        ("TMDB", "趋势本周"),
        ("Trakt", "Top Movies Last Week"),
    ]
    
    tv_include_pairs = [
        ("豆瓣", "一周全球剧集口碑榜"),
        ("烂番茄", "Popular TV"),
        ("MTC", "Trending Shows This Week"),
        ("Letterboxd", "Popular films this week"),
        ("TMDB", "趋势本周"),
        ("Trakt", "Top TV Shows Last Week"),
    ]
    
    movies = aggregate_top(db, media_type="movie", limit=10, chinese_only=False, include_pairs=movie_include_pairs)
    tv_candidates = aggregate_top(db, media_type="tv", limit=50, chinese_only=False, include_pairs=tv_include_pairs)
    tv = tv_candidates[:10]
    result = {"top_movies": movies, "top_tv": tv, "top_chinese_tv": chinese_tv}
    await set_cache(cache_key, result, expire=CHARTS_CACHE_EXPIRE)
    return result

@app.post("/api/charts/sync")
async def sync_charts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """同步榜单数据到公开页面（将ChartEntry数据复制到PublicChartEntry）"""
    require_admin(current_user)
    
    try:
        db.query(PublicChartEntry).delete()
        db.commit()
        
        distinct_charts = db.query(
            ChartEntry.platform,
            ChartEntry.chart_name,
            ChartEntry.media_type
        ).distinct().all()
        
        synced_count = 0
        synced_at = datetime.utcnow()
        
        for platform, chart_name, media_type in distinct_charts:
            sub = db.query(
                ChartEntry.rank,
                func.max(ChartEntry.id).label('max_id')
            ).filter(
                ChartEntry.platform == platform,
                ChartEntry.chart_name == chart_name,
                ChartEntry.media_type == media_type,
            ).group_by(ChartEntry.rank).subquery()
            
            entries = db.query(ChartEntry).join(
                sub, ChartEntry.id == sub.c.max_id
            ).order_by(ChartEntry.rank.asc()).all()
            
            for entry in entries:
                public_entry = PublicChartEntry(
                    platform=entry.platform,
                    chart_name=entry.chart_name,
                    media_type=entry.media_type,
                    tmdb_id=entry.tmdb_id,
                    title=entry.title,
                    poster=entry.poster,
                    rank=entry.rank,
                    synced_at=synced_at
                )
                db.add(public_entry)
                synced_count += 1
        
        db.commit()
        if redis:
            try:
                await redis.delete("charts:aggregate", "charts:public")
            except Exception:
                pass
        return {
            "status": "success",
            "message": f"榜单数据已同步，共 {synced_count} 条记录",
            "total_count": synced_count,
            "timestamp": synced_at.isoformat()
        }
    except Exception as e:
        db.rollback()
        logger.error(f"同步榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"同步榜单失败: {str(e)}")

@app.get("/api/charts/public")
async def get_public_charts(db: Session = Depends(get_db)):
    """获取所有公开榜单数据"""
    cache_key = "charts:public"
    cached = await get_cache(cache_key)
    if cached is not None:
        return cached
    try:
        metacritic_top250_charts = [
            'Metacritic Best Movies of All Time',
            'Metacritic Best TV Shows of All Time',
        ]
        
        distinct_charts = db.query(
            PublicChartEntry.platform,
            PublicChartEntry.chart_name
        ).distinct().all()
        
        result = []
        processed_charts = set()
        
        for platform, chart_name in distinct_charts:
            if chart_name in metacritic_top250_charts:
                chart_key = (platform, chart_name)
                if chart_key in processed_charts:
                    continue
                processed_charts.add(chart_key)
                
                entries = db.query(PublicChartEntry).filter(
                    PublicChartEntry.platform == platform,
                    PublicChartEntry.chart_name == chart_name,
                ).order_by(PublicChartEntry.rank.asc()).all()
                
                if entries:
                    chart_entries = []
                    for e in entries:
                        poster = e.poster or ""
                        if poster and not (poster.startswith("/tmdb-images/") or poster.startswith("/api/") or poster.startswith("http")):
                            if not poster.startswith("/"):
                                poster = "/" + poster
                            poster = f"/tmdb-images{poster}"
                        
                        chart_entries.append({
                            "tmdb_id": e.tmdb_id,
                            "rank": e.rank,
                            "title": e.title,
                            "poster": poster,
                            "media_type": e.media_type,
                        })
                    
                    result.append({
                        "platform": platform,
                        "chart_name": chart_name,
                        "media_type": "both",
                        "entries": chart_entries
                    })
            else:
                distinct_media_types = db.query(PublicChartEntry.media_type).filter(
                    PublicChartEntry.platform == platform,
                    PublicChartEntry.chart_name == chart_name,
                ).distinct().all()
                
                for (media_type,) in distinct_media_types:
                    entries = db.query(PublicChartEntry).filter(
                        PublicChartEntry.platform == platform,
                        PublicChartEntry.chart_name == chart_name,
                        PublicChartEntry.media_type == media_type,
                    ).order_by(PublicChartEntry.rank.asc()).all()
                    
                    if entries:
                        chart_entries = []
                        for e in entries:
                            poster = e.poster or ""
                            if poster and not (poster.startswith("/tmdb-images/") or poster.startswith("/api/") or poster.startswith("http")):
                                if not poster.startswith("/"):
                                    poster = "/" + poster
                                poster = f"/tmdb-images{poster}"
                            
                            chart_entries.append({
                                "tmdb_id": e.tmdb_id,
                                "rank": e.rank,
                                "title": e.title,
                                "poster": poster,
                                "media_type": e.media_type,
                            })
                        
                        result.append({
                            "platform": platform,
                            "chart_name": chart_name,
                            "media_type": media_type,
                            "entries": chart_entries
                        })
        
        await set_cache(cache_key, result, expire=CHARTS_CACHE_EXPIRE)
        return result
    except Exception as e:
        logger.error(f"获取公开榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取公开榜单失败: {str(e)}")

@app.get("/api/charts/detail")
async def get_chart_detail(
    platform: str,
    chart_name: str,
    db: Session = Depends(get_db)
):
    """获取完整榜单详情（Top 250）"""
    try:
        platform_map = {
            'Rotten Tomatoes': '烂番茄',
            'Metacritic': 'MTC',
        }
        backend_platform = platform_map.get(platform, platform)
        
        chart_name_map = {
            'IMDb 电影 Top 250': 'IMDb Top 250 Movies',
            'IMDb 剧集 Top 250': 'IMDb Top 250 TV Shows',
            'Letterboxd 电影 Top 250': 'Letterboxd Official Top 250',
            '豆瓣 电影 Top 250': '豆瓣 Top 250',
            'Metacritic 史上最佳电影 Top 250': 'Metacritic Best Movies of All Time',
            'Metacritic 史上最佳剧集 Top 250': 'Metacritic Best TV Shows of All Time',
            'TMDB 高分电影 Top 250': 'TMDB Top 250 Movies',
            'TMDB 高分剧集 Top 250': 'TMDB Top 250 TV Shows',
        }
        backend_chart_name = chart_name_map.get(chart_name, chart_name)
        
        entries = db.query(PublicChartEntry).filter(
            PublicChartEntry.platform == backend_platform,
            PublicChartEntry.chart_name == backend_chart_name,
        ).order_by(PublicChartEntry.rank.asc()).all()
        
        if not entries:
            entries = db.query(ChartEntry).filter(
                ChartEntry.platform == backend_platform,
                ChartEntry.chart_name == backend_chart_name,
            ).order_by(ChartEntry.rank.asc()).all()
        
        if not entries:
            raise HTTPException(status_code=404, detail="榜单数据不存在")
        
        chart_entries = []
        media_type = None
        
        metacritic_top250_charts = [
            'Metacritic Best Movies of All Time',
            'Metacritic Best TV Shows of All Time',
        ]
        is_metacritic_top250 = backend_chart_name in metacritic_top250_charts
        
        for e in entries:
            poster = e.poster or ""
            if poster and not (poster.startswith("/tmdb-images/") or poster.startswith("/api/") or poster.startswith("http")):
                if not poster.startswith("/"):
                    poster = "/" + poster
                poster = f"/tmdb-images{poster}"
            
            entry_media_type = getattr(e, 'media_type', None)
            if not media_type and entry_media_type:
                media_type = entry_media_type
            
            chart_entries.append({
                "tmdb_id": e.tmdb_id,
                "rank": e.rank,
                "title": e.title,
                "poster": poster,
                "media_type": entry_media_type,
            })
        
        if is_metacritic_top250:
            media_type = 'both'
        elif not media_type:
            media_type = 'movie'
        
        return {
            "platform": platform,
            "chart_name": chart_name,
            "media_type": media_type,
            "entries": chart_entries
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取榜单详情失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取榜单详情失败: {str(e)}")

@app.post("/api/charts/auto-update")
async def auto_update_charts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """自动更新所有榜单数据"""
    require_admin(current_user)
    
    try:
        from chart_scrapers import ChartScraper
        
        scraper = ChartScraper(db)
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
        
        from datetime import timezone
        beijing_tz = timezone(timedelta(hours=8))
        update_time = datetime.now(beijing_tz)
        
        from chart_scrapers import scheduler_instance
        if scheduler_instance:
            scheduler_instance.last_update = update_time
            logger.info(f"手动更新后，更新调度器实例的last_update: {update_time}")
        
        try:
            db_status = db.query(SchedulerStatus).order_by(SchedulerStatus.updated_at.desc()).first()
            if db_status:
                db_status.last_update = update_time
                db.commit()
                logger.info("手动更新后，数据库中的last_update已更新")
        except Exception as db_error:
            logger.error(f"更新数据库last_update失败: {db_error}")
        
        return {
            "status": "success",
            "message": "所有榜单数据已成功更新",
            "results": results,
            "timestamp": update_time.isoformat()
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
        from chart_scrapers import ChartScraper
        
        scraper = ChartScraper(db)
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

@app.post("/api/charts/update-top250")
async def update_top250_chart(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新单个 Top 250 榜单"""
    require_admin(current_user)
    
    try:
        body = await request.json()
        platform = body.get("platform")
        chart_name = body.get("chart_name")
        
        if not platform or not chart_name:
            raise HTTPException(status_code=400, detail="缺少必要参数：platform 和 chart_name")
        
        from chart_scrapers import ChartScraper
        
        scraper = ChartScraper(db)
        top250_updaters = {
            "TMDB": {
                "TMDB Top 250 Movies": scraper.update_tmdb_top250_movies,
                "TMDB Top 250 TV Shows": scraper.update_tmdb_top250_tv,
            },
            "IMDb": {
                "IMDb Top 250 Movies": scraper.update_imdb_top250_movies,
                "IMDb Top 250 TV Shows": scraper.update_imdb_top250_tv,
            },
            "Letterboxd": {
                "Letterboxd Official Top 250": scraper.update_letterboxd_top250,
            },
            "豆瓣": {
                "豆瓣 Top 250": scraper.update_douban_top250,
            },
            "MTC": {
                "Metacritic Best Movies of All Time": scraper.update_metacritic_best_movies,
                "Metacritic Best TV Shows of All Time": scraper.update_metacritic_best_tv,
            },
            # "Trakt": {
            #     "Trakt Highest Rated Movies (Top 250)": scraper.update_trakt_top250_movies,
            #     "Trakt Highest Rated TV Shows (Top 250)": scraper.update_trakt_top250_tv,
            # },
        }
        
        if platform not in top250_updaters:
            raise HTTPException(status_code=400, detail=f"平台 {platform} 暂不支持 Top 250 榜单更新")
        
        if chart_name not in top250_updaters[platform]:
            raise HTTPException(status_code=400, detail=f"平台 {platform} 不支持榜单: {chart_name}")
        
        updater = top250_updaters[platform][chart_name]
        
        if platform == "豆瓣" and chart_name == "豆瓣 Top 250":
            douban_cookie = current_user.douban_cookie if current_user.douban_cookie else None
            count = await updater(douban_cookie=douban_cookie, request=request)
        else:
            count = await updater()
        
        return {
            "status": "success",
            "message": f"{platform} - {chart_name} 更新成功",
            "platform": platform,
            "chart_name": chart_name,
            "count": count,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "ANTI_SCRAPING_DETECTED" in error_msg:
            logger.warning(f"更新 Top 250 榜单遇到反爬虫机制: {e}")
            raise HTTPException(
                status_code=428,
                detail={
                    "error": "ANTI_SCRAPING_DETECTED",
                    "message": "遇到反爬虫机制，请验证",
                    "platform": platform,
                    "chart_name": chart_name
                }
            )
        logger.error(f"更新 Top 250 榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")

@app.post("/api/charts/clear/{platform}")
async def clear_platform_charts(
    platform: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """清空指定平台的所有榜单（排除 Top 250 榜单）"""
    require_admin(current_user)
    
    try:
        top250_chart_names = [
            "IMDb Top 250 Movies",
            "IMDb Top 250 TV Shows",
            "Letterboxd Official Top 250",
            "豆瓣 Top 250",
            "Metacritic Best Movies of All Time",
            "Metacritic Best TV Shows of All Time",
            "TMDB Top 250 Movies",
            "TMDB Top 250 TV Shows",
        ]
        
        deleted_count = db.query(ChartEntry).filter(
            ChartEntry.platform == platform,
            ~ChartEntry.chart_name.in_(top250_chart_names)
        ).delete()
        db.commit()
        
        return {
            "status": "success",
            "message": f"已清空 {platform} 平台的所有榜单（Top 250 榜单除外），共删除 {deleted_count} 条记录",
            "deleted_count": deleted_count,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"清空 {platform} 平台榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"清空榜单失败: {str(e)}")

@app.post("/api/charts/clear-top250")
async def clear_top250_chart(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """清空单个 Top 250 榜单"""
    require_admin(current_user)
    
    try:
        body = await request.json()
        platform = body.get("platform")
        chart_name = body.get("chart_name")
        
        if not platform or not chart_name:
            raise HTTPException(status_code=400, detail="缺少必要参数：platform 和 chart_name")
        
        deleted_count = db.query(ChartEntry).filter(
            ChartEntry.platform == platform,
            ChartEntry.chart_name == chart_name
        ).delete()
        db.commit()
        
        return {
            "status": "success",
            "message": f"已清空 {platform} - {chart_name}，共删除 {deleted_count} 条记录",
            "platform": platform,
            "chart_name": chart_name,
            "deleted_count": deleted_count,
            "timestamp": datetime.utcnow().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"清空 Top 250 榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"清空失败: {str(e)}")

@app.post("/api/charts/clear-all")
async def clear_all_charts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """清空所有平台的所有榜单（排除 Top 250 榜单）"""
    require_admin(current_user)
    
    try:
        top250_chart_names = [
            "IMDb Top 250 Movies",
            "IMDb Top 250 TV Shows",
            "Letterboxd Official Top 250",
            "豆瓣 Top 250",
            "Metacritic Best Movies of All Time",
            "Metacritic Best TV Shows of All Time",
            "TMDB Top 250 Movies",
            "TMDB Top 250 TV Shows",
        ]
        
        deleted_count = db.query(ChartEntry).filter(
            ~ChartEntry.chart_name.in_(top250_chart_names)
        ).delete()
        db.commit()
        
        return {
            "status": "success",
            "message": f"已清空所有平台的所有榜单（Top 250 榜单除外），共删除 {deleted_count} 条记录",
            "deleted_count": deleted_count,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"清空所有榜单失败: {e}")
        raise HTTPException(status_code=500, detail=f"清空所有榜单失败: {str(e)}")

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
        platforms = ["豆瓣", "IMDb", "Letterboxd", "烂番茄", "MTC"]
        status = {}
        
        for platform in platforms:
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
        
        scheduler = await start_auto_scheduler(db_session=db)
        scheduler_status = scheduler.get_status()
        logger.info(f"调度器启动成功，状态: {scheduler_status}")
        
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

def calculate_next_update():
    """计算下次更新时间（每天北京时间21:30）"""
    from datetime import timezone, timedelta
    beijing_tz = timezone(timedelta(hours=8))
    now_beijing = datetime.now(beijing_tz)
    today_2130 = now_beijing.replace(hour=21, minute=30, second=0, microsecond=0)
    
    if now_beijing >= today_2130:
        next_update = today_2130 + timedelta(days=1)
    else:
        next_update = today_2130
    
    return next_update

@app.get("/api/scheduler/status")
async def get_scheduler_status_endpoint(db: Session = Depends(get_db)):
    """获取调度器状态"""
    try:
        from chart_scrapers import scheduler_instance
        if scheduler_instance and scheduler_instance.running:
            status = scheduler_instance.get_status()
            logger.debug(f"从内存调度器实例获取状态: {status}")
            return {
                "status": "success",
                "data": status,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        db_status = db.query(SchedulerStatus).order_by(SchedulerStatus.updated_at.desc()).first()
        
        if db_status:
            logger.debug(f"从数据库获取调度器状态: running={db_status.running}")
            next_update = calculate_next_update()
            return {
                "status": "success",
                "data": {
                    "running": db_status.running,
                    "next_update": next_update.isoformat(),
                    "last_update": db_status.last_update.isoformat() if db_status.last_update else None
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            from chart_scrapers import get_scheduler_status
            status = get_scheduler_status()
            logger.debug(f"从内存获取调度器状态: {status}")
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
    redis_status = "healthy" if redis else "unhealthy"
    
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
        redis = await aioredis.from_url(
            REDIS_URL,
            encoding='utf-8',
            decode_responses=True
        )
        logger.info("Redis连接成功")
    except Exception as e:
        logger.error(f"Redis 连接初始化失败: {e}")
        redis = None
    
    try:
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
    
    if os.getenv("ENV") != "development":
        try:
            from chart_scrapers import start_auto_scheduler
            await start_auto_scheduler()
            logger.info("生产环境：定时调度器已自动启动")
        except Exception as e:
            logger.error(f"生产环境：自动启动调度器失败: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时清理资源"""
    try:
        await browser_pool.cleanup()
        print("浏览器池已清理")
    except Exception as e:
        print(f"浏览器池清理失败: {e}")
    
    global _tmdb_client
    if _tmdb_client and not _tmdb_client.is_closed:
        try:
            await _tmdb_client.aclose()
            print("TMDB 客户端连接池已关闭")
        except Exception as e:
            print(f"TMDB 客户端清理失败: {e}")
            
