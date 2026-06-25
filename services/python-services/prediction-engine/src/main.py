import asyncio
import logging
import sys
import os
from fastapi import FastAPI
import uvicorn
import grpc

# Add the parent directory and generated stubs directory to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../shared/protobuf/generated/python")))

import prediction_pb2_grpc
from src.prediction_service import PredictionServiceServicer
from src.config import settings

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("prediction-engine.main")

# FastAPI setup
app = FastAPI(title="PRISM Prediction Engine HTTP Gateway", version="1.0.0")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "prediction-engine"}

@app.get("/metrics")
def get_metrics():
    return {
        "grpc_port": settings.GRPC_PORT,
        "http_port": settings.HTTP_PORT,
        "redis_url": settings.REDIS_URL,
        "database_url": settings.DATABASE_URL
    }

async def run_grpc_server():
    grpc_server = grpc.aio.server()
    prediction_pb2_grpc.add_PredictionServiceServicer_to_server(
        PredictionServiceServicer(), grpc_server
    )
    listen_addr = f"[::]:{settings.GRPC_PORT}"
    grpc_server.add_insecure_port(listen_addr)
    logger.info(f"Starting gRPC server on {listen_addr}...")
    await grpc_server.start()
    try:
        await grpc_server.wait_for_termination()
    except asyncio.CancelledError:
        logger.info("gRPC server cancellation requested.")
        await grpc_server.stop(5)

async def run_http_server():
    config = uvicorn.Config(app, host="0.0.0.0", port=settings.HTTP_PORT, log_level="warning")
    server = uvicorn.Server(config)
    logger.info(f"Starting HTTP server on port {settings.HTTP_PORT}...")
    await server.serve()

async def main():
    # Start both gRPC and HTTP concurrently
    await asyncio.gather(
        run_grpc_server(),
        run_http_server()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down prediction-engine service...")
