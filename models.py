# ==========================================
# 数据库模型
# ==========================================
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from sqlalchemy.dialects.mysql import LONGTEXT
from datetime import datetime

# 数据库连接配置
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://ratefuse_user:L1994z0912x.@localhost/ratefuse"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True)
    username = Column(String(255), unique=True, index=True)
    hashed_password = Column(String(255))
    avatar = Column(LONGTEXT)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    favorites = relationship("Favorite", back_populates="user")
    favorite_lists = relationship("FavoriteList", back_populates="user")

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
    list_id = Column(Integer, ForeignKey("favorite_lists.id"))
    media_id = Column(String(255))
    media_type = Column(String(50))
    title = Column(String(255))
    poster = Column(String(255))
    year = Column(String(50))
    overview = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    sort_order = Column(Integer, nullable=True)
    
    user = relationship("User", back_populates="favorites")
    favorite_list = relationship("FavoriteList", back_populates="favorites")

class PasswordReset(Base):
    __tablename__ = "password_resets"
    
    id = Column(Integer, primary_key=True)
    email = Column(String(255), index=True)
    token = Column(String(255), unique=True)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    used = Column(Boolean, default=False)

# 创建数据库表
def init_db():
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
