
import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_FILE)

import socket

_original_getaddrinfo = socket.getaddrinfo

def ipv4_getaddrinfo(host, *args, **kwargs):
    results = _original_getaddrinfo(host, *args, **kwargs)
    ipv4_results = [
        result for result in results
        if result[0] == socket.AF_INET
    ]
    return ipv4_results or results

socket.getaddrinfo = ipv4_getaddrinfo
def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is missing. Check ai-service-python/.env"
        )

    http_options = types.HttpOptions(
        timeout=30000,
        retry_options=types.HttpRetryOptions(attempts=1),
    )

    return genai.Client(
        api_key=api_key,
        http_options=http_options,
    )


def get_gemini_model():
    return os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def test_gemini_connection():
    import time

    start = time.perf_counter()
    print("Creating Gemini client...", flush=True)

    client = get_gemini_client()
    print(
        f"Client created in {time.perf_counter() - start:.1f}s",
        flush=True
    )

    request_start = time.perf_counter()
    print("Sending test request to Gemini...", flush=True)

    response = client.models.generate_content(
        model=get_gemini_model(),
        contents="Reply with exactly: FINPILOT_GEMINI_CONNECTED"
    )

    print(
        f"Gemini responded in {time.perf_counter() - request_start:.1f}s",
        flush=True
    )

    if not response.text:
        raise RuntimeError("Gemini returned an empty response.")

    return response.text.strip()

def generate_with_fallback(contents: str, config: dict):
    client = get_gemini_client()

    primary_model = get_gemini_model()
    fallback_model = os.getenv(
        "GEMINI_FALLBACK_MODEL",
        "gemini-3.5-flash-lite",
    )

    try:
        print(f"Trying primary Gemini model: {primary_model}")

        return client.models.generate_content(
            model=primary_model,
            contents=contents,
            config=config,
        )

    except Exception as error:
        status_code = getattr(error, "code", None)

        if status_code not in (503, 504):
            raise

        if fallback_model == primary_model:
            raise

        print(
            f"Primary model returned {status_code}. "
            f"Trying fallback: {fallback_model}"
        )

        return client.models.generate_content(
            model=fallback_model,
            contents=contents,
            config=config,
        )
