"""
Automated unit tests for Gemini fallback logic in FinPilot AI Service.
Validates:
1. Primary succeeds -> fallback is never invoked.
2. Primary returns 429 -> fallback model is invoked.
3. Primary returns 503 or 504 -> fallback model is invoked.
4. Primary returns 401 or 403 (auth/permission error) -> fallback is NOT invoked; fails immediately.
5. Primary returns 400 (bad request / non-retryable) -> fallback is NOT invoked.
6. Both primary and fallback fail -> GeminiFallbackError raised with details preserved.
7. Unbounded retry prevention -> at most 1 primary call and 1 fallback call.
"""

import os
from unittest.mock import MagicMock
import pytest

from app.llm import generate_with_fallback, GeminiFallbackError


class MockGeminiError(Exception):
    """Simulated Google GenAI SDK API error with HTTP status code."""
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.code = code
        self.status_code = code


class MockResponse:
    def __init__(self, text: str):
        self.text = text


@pytest.fixture(autouse=True)
def setup_models(monkeypatch):
    """Ensure predictable model identifiers across test runs."""
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    monkeypatch.setenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite")


def test_primary_succeeds_fallback_not_called():
    """When the primary model succeeds, the fallback model must not be called."""
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MockResponse('{"recipientName": "Acme"}')

    result = generate_with_fallback(
        contents="prompt text",
        config={"temperature": 0.1},
        client=mock_client,
    )

    assert result.text == '{"recipientName": "Acme"}'
    assert mock_client.models.generate_content.call_count == 1
    call_args = mock_client.models.generate_content.call_args[1]
    assert call_args["model"] == "gemini-3.1-flash-lite"


def test_primary_429_triggers_fallback():
    """When the primary model returns HTTP 429 (rate/quota limit), fallback is called."""
    mock_client = MagicMock()
    primary_error = MockGeminiError("Resource exhausted: Rate limit exceeded", code=429)
    fallback_response = MockResponse('{"recipientName": "Acme from fallback"}')

    mock_client.models.generate_content.side_effect = [
        primary_error,
        fallback_response,
    ]

    result = generate_with_fallback(
        contents="prompt text",
        config={"temperature": 0.1},
        client=mock_client,
    )

    assert result.text == '{"recipientName": "Acme from fallback"}'
    assert mock_client.models.generate_content.call_count == 2
    calls = mock_client.models.generate_content.call_args_list
    assert calls[0][1]["model"] == "gemini-3.1-flash-lite"
    assert calls[1][1]["model"] == "gemini-3.5-flash-lite"


@pytest.mark.parametrize("status_code", [503, 504])
def test_primary_503_504_triggers_fallback(status_code):
    """When the primary model returns HTTP 503 or 504, fallback is called."""
    mock_client = MagicMock()
    primary_error = MockGeminiError(f"Temporary outage: {status_code}", code=status_code)
    fallback_response = MockResponse('{"recipientName": "Acme after outage"}')

    mock_client.models.generate_content.side_effect = [
        primary_error,
        fallback_response,
    ]

    result = generate_with_fallback(
        contents="prompt text",
        config={"temperature": 0.1},
        client=mock_client,
    )

    assert result.text == '{"recipientName": "Acme after outage"}'
    assert mock_client.models.generate_content.call_count == 2
    calls = mock_client.models.generate_content.call_args_list
    assert calls[0][1]["model"] == "gemini-3.1-flash-lite"
    assert calls[1][1]["model"] == "gemini-3.5-flash-lite"


@pytest.mark.parametrize("auth_status_code", [401, 403, 400])
def test_auth_and_permission_errors_do_not_trigger_fallback(auth_status_code):
    """Authentication, permission, and bad request errors must fail immediately without calling fallback."""
    mock_client = MagicMock()
    auth_error = MockGeminiError(f"Non-retryable error: {auth_status_code}", code=auth_status_code)
    mock_client.models.generate_content.side_effect = auth_error

    with pytest.raises(MockGeminiError) as exc_info:
        generate_with_fallback(
            contents="prompt text",
            config={"temperature": 0.1},
            client=mock_client,
        )

    assert exc_info.value.code == auth_status_code
    # Fallback was NOT attempted; called exactly once
    assert mock_client.models.generate_content.call_count == 1
    call_args = mock_client.models.generate_content.call_args[1]
    assert call_args["model"] == "gemini-3.1-flash-lite"


def test_both_models_fail_handled_correctly():
    """When both primary and fallback fail, a GeminiFallbackError is raised with details preserved."""
    mock_client = MagicMock()
    primary_err = MockGeminiError("Primary quota exhausted", code=429)
    fallback_err = MockGeminiError("Fallback unavailable", code=503)

    mock_client.models.generate_content.side_effect = [
        primary_err,
        fallback_err,
    ]

    with pytest.raises(GeminiFallbackError) as exc_info:
        generate_with_fallback(
            contents="prompt text",
            config={"temperature": 0.1},
            client=mock_client,
        )

    err = exc_info.value
    assert err.primary_model == "gemini-3.1-flash-lite"
    assert err.fallback_model == "gemini-3.5-flash-lite"
    assert err.primary_error is primary_err
    assert err.fallback_error is fallback_err
    assert err.code == 503
    # Both failure details are exposed in message
    assert "gemini-3.1-flash-lite" in str(err)
    assert "gemini-3.5-flash-lite" in str(err)
    assert "Primary quota exhausted" in str(err)
    assert "Fallback unavailable" in str(err)

    # Bounded: at most 2 calls total
    assert mock_client.models.generate_content.call_count == 2


def test_fallback_skipped_if_same_model(monkeypatch):
    """If fallback model is identical to primary model, fallback must not be attempted."""
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    monkeypatch.setenv("GEMINI_FALLBACK_MODEL", "gemini-3.1-flash-lite")

    mock_client = MagicMock()
    primary_error = MockGeminiError("Rate limit exceeded", code=429)
    mock_client.models.generate_content.side_effect = primary_error

    with pytest.raises(MockGeminiError):
        generate_with_fallback(
            contents="prompt text",
            config={"temperature": 0.1},
            client=mock_client,
        )

    # Exactly 1 call; skipped fallback because model is identical
    assert mock_client.models.generate_content.call_count == 1


def test_unbounded_retry_guard():
    """Verify that under no circumstances does the function execute more than 2 calls."""
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = [
        MockGeminiError("Primary 429", code=429),
        MockGeminiError("Fallback 429", code=429),
    ]

    with pytest.raises(GeminiFallbackError):
        generate_with_fallback(
            contents="prompt text",
            config={"temperature": 0.1},
            client=mock_client,
        )

    assert mock_client.models.generate_content.call_count == 2
