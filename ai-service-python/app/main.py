import os
import logging
from datetime import date

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.propose import extract_invoice
from app.reminder import draft_reminder
from app.schemas import (
    ParseInvoiceRequest,
    ParseInvoiceResponse,
    ReminderRequest,
    ReminderResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("finpilot-ai")

# Shared-secret token for protecting publicly reachable AI service
AI_SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN")
IS_PRODUCTION = os.getenv("ENVIRONMENT") == "production" or os.getenv("NODE_ENV") == "production"

if IS_PRODUCTION:
    if not AI_SERVICE_TOKEN or AI_SERVICE_TOKEN in ("finpilot-internal-ai-token-2026", "replace-with-a-secure-random-token"):
        raise RuntimeError("FATAL: In production, AI_SERVICE_TOKEN must be explicitly set and cannot use predictable defaults.")
else:
    AI_SERVICE_TOKEN = AI_SERVICE_TOKEN or "dev-ai-token-local-only"

app = FastAPI(
    title="FinPilot AI Service",
    version="0.1.0",
    description="Python AI service for FinPilot",
)


@app.middleware("http")
async def verify_ai_service_token(request: Request, call_next):
    # GET /health is public and exempt from auth
    path = request.url.path.rstrip("/")
    if path == "/health":
        return await call_next(request)

    # All other endpoints require the shared secret token
    if AI_SERVICE_TOKEN:
        token = request.headers.get("x-ai-service-token")
        if not token:
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()
            elif auth_header:
                token = auth_header.strip()

        if not token or token != AI_SERVICE_TOKEN:
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized: Invalid or missing AI service token"},
            )

    return await call_next(request)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "finpilot-ai-python",
    }


@app.post("/v1/parse-invoice", response_model=ParseInvoiceResponse)
def parse_invoice(request: ParseInvoiceRequest):
    reference_date = request.referenceDate or date.today()

    try:
        result = extract_invoice(
            text=request.text,
            reference_date=reference_date,
        )
        return ParseInvoiceResponse(**result)

    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        )

    except Exception as error:
        logger.exception("Invoice extraction failed")
        error_str = str(error).lower()
        if "429" in error_str or "resource_exhausted" in error_str or "quota" in error_str:
            raise HTTPException(
                status_code=429,
                detail="Gemini API quota reached. Please wait a few moments and try again.",
            )

        raise HTTPException(
            status_code=502,
            detail="Invoice extraction failed. Please try again.",
        )


@app.post("/v1/generate-reminder", response_model=ReminderResponse)
def generate_reminder(request: ReminderRequest):
    try:
        result = draft_reminder(request)
        return ReminderResponse(**result)

    except Exception as error:
        logger.exception("Reminder generation failed")
        error_str = str(error).lower()
        if "429" in error_str or "resource_exhausted" in error_str or "quota" in error_str:
            raise HTTPException(
                status_code=429,
                detail="Gemini API quota reached. Please wait a few moments and try again.",
            )

        raise HTTPException(
            status_code=502,
            detail="Reminder generation failed. Please try again.",
        )
