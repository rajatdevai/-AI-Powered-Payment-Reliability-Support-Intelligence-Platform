from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://neondb_owner:npg_VsLT9Px7nOcX@ep-royal-waterfall-at9ob7h6-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
    REDIS_URL: str = "redis://localhost:6379"
    KAFKA_BROKERS: str = "localhost:9092"
    ENABLE_KAFKA: bool = False
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

