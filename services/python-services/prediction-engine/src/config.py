import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://neondb_owner:npg_VsLT9Px7nOcX@ep-royal-waterfall-at9ob7h6-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
    REDIS_URL: str = "redis://localhost:6379"
    GRPC_PORT: int = 50051
    HTTP_PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

