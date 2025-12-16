# ==========================================
# 数据库模型 - SQLAlchemy ORM模型定义
# 包含: 用户、收藏、收藏列表、关注、榜单条目、密码重置、调度器状态
# ==========================================
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Boolean, Text, UniqueConstraint, text
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from sqlalchemy.dialects.mysql import LONGTEXT
from datetime import datetime
from sqlalchemy.sql import text

# 数据库连接配置
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://ratefuse_user:L1994z0912x.@localhost/ratefuse"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True)
    username = Column(String(255), unique=True, index=True)
    hashed_password = Column(String(255))
    avatar = Column(LONGTEXT, nullable=True) 
    created_at = Column(DateTime, default=datetime.utcnow)
    is_admin = Column(Boolean, default=False)
    douban_cookie = Column(Text, nullable=True)

    favorites = relationship("Favorite", back_populates="user")
    favorite_lists = relationship("FavoriteList", back_populates="user")
    following = relationship("Follow", foreign_keys="Follow.follower_id", back_populates="follower")
    followers = relationship("Follow", foreign_keys="Follow.following_id", back_populates="following")

class FavoriteList(Base):
    __tablename__ = "favorite_lists"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String(255))
    description = Column(Text, nullable=True)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    original_list_id = Column(Integer, ForeignKey("favorite_lists.id"), nullable=True)
    
    user = relationship("User", back_populates="favorite_lists")
    favorites = relationship("Favorite", back_populates="favorite_list")

class Favorite(Base):
    __tablename__ = "favorites"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    list_id = Column(Integer, ForeignKey("favorite_lists.id", ondelete="CASCADE"))
    media_id = Column(String)
    media_type = Column(String)
    title = Column(String)
    poster = Column(String)
    year = Column(String)
    overview = Column(Text)
    note = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="favorites")
    favorite_list = relationship("FavoriteList", back_populates="favorites")

class ChartEntry(Base):
    __tablename__ = "chart_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String(50), index=True)  # imdb/tmdb/douban/letterboxd/trakt/metacritic/rottentomatoes
    chart_name = Column(String(100), index=True)
    media_type = Column(String(10), index=True)  # movie | tv
    tmdb_id = Column(Integer, index=True)
    title = Column(String(255))
    poster = Column(Text)
    rank = Column(Integer, index=True)
    original_language = Column(String(10), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    locked = Column(Boolean, default=False, index=True)
    
    user = relationship("User")
    __table_args__ = (
        UniqueConstraint('platform', 'chart_name', 'media_type', 'tmdb_id', 'rank', name='uq_chart_item'),
    )

class PublicChartEntry(Base):
    __tablename__ = "public_chart_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String(50), index=True)
    chart_name = Column(String(100), index=True)
    media_type = Column(String(10), index=True)  # movie | tv
    tmdb_id = Column(Integer, index=True)
    title = Column(String(255))
    poster = Column(Text)
    rank = Column(Integer, index=True)
    synced_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    __table_args__ = (
        UniqueConstraint('platform', 'chart_name', 'media_type', 'rank', name='uq_public_chart_item'),
    )

class PasswordReset(Base):
    __tablename__ = "password_resets"
    
    id = Column(Integer, primary_key=True)
    email = Column(String(255), index=True)
    token = Column(String(255), unique=True)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    used = Column(Boolean, default=False)

class Follow(Base):
    __tablename__ = "follows"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=text('CURRENT_TIMESTAMP'))
    
    # 添加唯一约束，确保一个用户不能重复关注同一个用户
    __table_args__ = (
        UniqueConstraint('follower_id', 'following_id', name='follower_id'),
    )
    
    follower = relationship("User", foreign_keys=[follower_id], back_populates="following")
    following = relationship("User", foreign_keys=[following_id], back_populates="followers")

class SchedulerStatus(Base):
    __tablename__ = "scheduler_status"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    running = Column(Boolean, default=False, nullable=False)
    last_update = Column(DateTime, nullable=True)
    next_update = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=text('CURRENT_TIMESTAMP'), onupdate=text('CURRENT_TIMESTAMP'))

# 创建数据库表
def init_db():
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
