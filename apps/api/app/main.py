from typing import Literal

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError

from app.database import check_database


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(BaseModel):
    status: Literal["ready"] = "ready"


app = FastAPI(title="Second Brain API", version="0.1.0")


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@app.get(
    "/api/ready",
    response_model=ReadinessResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "Database unavailable"}},
)
async def ready() -> ReadinessResponse:
    try:
        await check_database()
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service unavailable",
        ) from error
    return ReadinessResponse()
