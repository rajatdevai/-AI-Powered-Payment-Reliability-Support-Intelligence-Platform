import asyncio
import logging
import sys
import os
from fastapi import FastAPI
import uvicorn
import grpc

# Add the parent directory and stubs directory to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../shared/protobuf/generated/python")))

import incident_pb2_grpc
from src.incident_service import IncidentServiceServicer
from src.health_engines import run_health_cycle
from src.config import settings

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("incident-engine.main")

# FastAPI setup
app = FastAPI(title="PRISM Incident Engine HTTP Gateway", version="1.0.0")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "incident-engine"}

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
    incident_pb2_grpc.add_IncidentServiceServicer_to_server(
        IncidentServiceServicer(), grpc_server
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

async def run_health_scheduler():
    logger.info("Starting background health engine scheduler (10s interval)...")
    while True:
        try:
            await run_health_cycle()
        except Exception as e:
            logger.error(f"Error in health calculation scheduler: {e}")
        await asyncio.sleep(10)

async def main():
    # Start gRPC, HTTP, and health scheduler concurrently
    await asyncio.gather(
        run_grpc_server(),
        run_http_server(),
        run_health_scheduler()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down incident-engine service...")
