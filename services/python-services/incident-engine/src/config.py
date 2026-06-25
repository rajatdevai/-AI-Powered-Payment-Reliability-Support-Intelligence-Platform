import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://neondb_owner:npg_VsLT9Px7nOcX@ep-royal-waterfall-at9ob7h6-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
    REDIS_URL: str = "redis://localhost:6379"
    KAFKA_BROKERS: str = "localhost:9092"
    ENABLE_KAFKA: bool = False
    GRPC_PORT: int = 50052
    HTTP_PORT: int = 8001
    LOG_LEVEL: str = "INFO"

    # Incident Thresholds
    FAILURE_RATE_THRESHOLD: float = 15.0 # percentage
    TIMEOUT_RATE_THRESHOLD: float = 10.0 # percentage
    LATENCY_THRESHOLD_MS: float = 3000.0

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

