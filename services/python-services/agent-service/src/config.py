from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/prism_dev"
    REDIS_URL: str = "redis://localhost:6379"
    KAFKA_BROKERS: str = "localhost:9092"
    ENABLE_KAFKA: bool = False
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    GRPC_PORT: int = 50053
    HTTP_PORT: int = 8002
    LOG_LEVEL: str = "INFO"
    OPENAI_API_KEY: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
