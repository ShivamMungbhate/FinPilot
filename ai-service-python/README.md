
# FinPilot AI Service

The AI service for FinPilot, a freelancer invoicing and payment follow-up application.

It converts natural-language invoice requests into structured invoice proposals and drafts professional payment reminders.

**Core principle: AI proposes. Code and PayPal decide.**

The AI service never sends invoices, processes payments, determines whether an invoice is paid, or independently triggers reminders. Those actions and decisions belong to the backend and PayPal integration.

## Features

- Natural-language invoice extraction using Google Gemini.
- Support for English, Hinglish, and informal input.
- Extraction of recipients, line items, prices, quantities, currencies, and due dates.
- Relative due-date interpretation using a supplied reference date.
- Professional payment reminder generation in three tones: gentle, firm, and urgent.
- Validation of generated reminder content against supplied invoice facts.
- Retry and deterministic fallback for reminder generation.
- Input validation using Pydantic.
- HTTP API built with FastAPI.

## Technology

- Python 3.11+
- FastAPI
- Pydantic v2
- Google GenAI SDK
- Gemini API
- Uvicorn
- Docker

## Project structure

```text
ai-service-python/
├── app/
│   ├── main.py
│   ├── schemas.py
│   ├── llm.py
│   ├── propose.py
│   ├── reminder.py
│   └── prompts/
│       ├── invoice_extraction.txt
│       └── reminder_generation.txt
├── evals/
│   ├── cases.jsonl
│   └── run_eval.py
├── tests/
├── .dockerignore
├── .env
├── .gitignore
├── Dockerfile
├── requirements.txt
└── README.md
```

## Configuration

Create an `.env` file inside `ai-service-python/`:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
PORT=5002
```

Never commit `.env` or expose your API key.

The service loads its environment file from the `ai-service-python` directory.

## Run locally

From the FinPilot repository root:

```cmd
python -m pip install -r ai-service-python\requirements.txt
```

Start the service:

```cmd
python -m uvicorn app.main:app --app-dir ai-service-python --reload --port 5002
```

The service will be available at:

```text
http://localhost:5002
```

Interactive API documentation:

```text
http://localhost:5002/docs
```

Health check:

```cmd
curl http://localhost:5002/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "finpilot-ai-python"
}
```

## API endpoints

### 1. Parse invoice

`POST /v1/parse-invoice`

Extracts invoice information from a natural-language request.

Request:

```json
{
  "text": "Create an invoice for Acme Corp, billing@acme.com, for website design worth USD 500, due November 10, 2026.",
  "referenceDate": "2026-11-09"
}
```

`referenceDate` is optional and helps interpret relative dates such as "next Friday".

Response structure:

```json
{
  "recipientName": "Acme Corp",
  "recipientEmail": "billing@acme.com",
  "items": [
    {
      "name": "Website design",
      "description": "",
      "quantity": 1.0,
      "unitPrice": 500.0,
      "total": 500.0
    }
  ],
  "currency": "USD",
  "dueDate": "2026-11-10",
  "notes": "",
  "confidenceScore": 1.0,
  "rawPrompt": "Original user request",
  "entities": {
    "detectedEmail": "billing@acme.com"
  }
}
```

The response values above are illustrative. Actual extraction depends on the input.

Important behavior:
- Missing or ambiguous prices are not invented.
- Items without a usable price are excluded from calculated line items, and a warning is added to `notes`.
- Missing recipient emails remain empty.
- Missing due dates remain empty.
- Currency and monetary calculations are handled by application code, not trusted to the LLM.
- `confidenceScore` is a model-provided estimate, adjusted downward when prices are missing. It is not a guarantee of correctness.

### 2. Generate payment reminder

`POST /v1/generate-reminder`

Creates a professional reminder draft using supplied invoice information.

Request:

```json
{
  "invoiceId": "inv_test_001",
  "invoiceNumber": "FP-001",
  "recipientName": "Acme Corp",
  "recipientEmail": "billing@acme.com",
  "amount": 1500,
  "currency": "USD",
  "dueDate": "2026-11-05",
  "daysOverdue": 4,
  "reminderCount": 1,
  "tone": "gentle"
}
```

Supported tones:

- `gentle`
- `firm`
- `urgent`

Response structure:

```json
{
  "subject": "Friendly payment reminder",
  "message": "Hello Acme Corp, ...",
  "tone": "gentle",
  "suggestedFollowUpDays": 5,
  "reminderCount": 1,
  "generatedAt": null
}
```

Follow-up suggestions are:
- Gentle: 5 days
- Firm: 3 days
- Urgent: 1 day

These are suggestions only. The backend remains responsible for reminder scheduling and policy enforcement.

### 3. Health check

`GET /health`

Returns the service status.

## Windows CMD examples

Parse invoice:

```cmd
curl -X POST http://localhost:5002/v1/parse-invoice -H "Content-Type: application/json" -d "{\"text\":\"Create an invoice for Acme Corp for USD 500 for website design, due November 10, 2026.\",\"referenceDate\":\"2026-11-09\"}"
```

Generate reminder:

```cmd
curl -X POST http://localhost:5002/v1/generate-reminder -H "Content-Type: application/json" -d "{\"invoiceId\":\"inv_test_001\",\"invoiceNumber\":\"FP-001\",\"recipientName\":\"Acme Corp\",\"amount\":1500,\"currency\":\"USD\",\"dueDate\":\"2026-11-05\",\"daysOverdue\":4,\"reminderCount\":1,\"tone\":\"gentle\"}"
```

## Validation and safety

- Request schemas are validated using Pydantic.
- Unexpected request fields are rejected.
- Invalid amounts, dates, and reminder tones are rejected.
- Invoice extraction requests are limited to 5,000 characters.
- User input is treated as untrusted data in prompts.
- The model cannot authorize invoice creation or payment actions.
- Reminder drafts are checked for required invoice facts and unsupported claims.
- Reminder generation retries once after a validation failure.
- If generation still fails, a deterministic template-based reminder is returned.
- Internal exception details are logged by the service and are not returned to API clients.

The backend must independently validate invoice proposals and require explicit user approval before creating or sending invoices.

Payment status must come from PayPal-backed backend verification, not AI-generated content.

## Evaluation

Invoice extraction has an evaluation suite in `evals/cases.jsonl`.

Run it from the FinPilot repository root:

```cmd
python ai-service-python\evals\run_eval.py
```

The evaluation set covers:
- Basic invoice extraction
- Missing email and due dates
- Multiple currencies
- Large monetary amounts
- Multiple line items
- Quantities and units
- Ambiguous amounts
- Conflicting currencies
- Prompt injection attempts
- Missing prices
- Hinglish requests

Latest recorded evaluation result:

| Metric | Result |
|---|---:|
| Total cases | 18 |
| Passed | 18 |
| Failed | 0 |
| Errors | 0 |
| Pass rate | 100% |

This is a small evaluation set, not a guarantee of production accuracy or safety.

## Docker

Build the image from the FinPilot repository root:

```cmd
docker build -t finpilot-ai:latest ./ai-service-python
```

Run the container:

```cmd
docker run --rm --env-file ai-service-python/.env -p 5002:5002 finpilot-ai:latest
```

Check the health endpoint:

```cmd
curl http://localhost:5002/health
```

The API will be available at `http://localhost:5002`.

The `.dockerignore` excludes local secrets and development-only files from the build context. The Gemini API key is supplied at container runtime, not baked into the image.

## Backend integration

The Python service implements the HTTP contract expected by the FinPilot backend:

| Purpose | Method | Endpoint |
|---|---|---|
| Health | GET | `/health` |
| Invoice parsing | POST | `/v1/parse-invoice` |
| Reminder generation | POST | `/v1/generate-reminder` |

During local development, the Python service listens on port `5002`.

Configure the backend environment:

```env
AI_SERVICE_URL=http://localhost:5002
```

The backend should continue to own:
- Invoice approval and creation.
- PayPal API calls.
- Payment status verification.
- Webhook processing.
- Duplicate prevention.
- Reminder eligibility and scheduling.
- Rate limits and business rules.

The AI service only returns structured proposals and reminder drafts.

## Environment-specific networking note

During local development, an IPv4 preference workaround was used in `app/llm.py` because the development environment experienced slow IPv6 connectivity to the Gemini API.

This is an environment-specific workaround, not a required part of the FinPilot API contract. Review it when deploying to environments with working IPv6 connectivity.

## Tools used

- Python and FastAPI for the independent AI HTTP service.
- Pydantic for request and response validation.
- Google Gemini through the Google GenAI SDK for invoice extraction and reminder drafting.
- Docker for containerization.
- Pytest and a custom JSONL evaluation runner for validation.

---

**FinPilot AI Service — AI proposes. Code and PayPal decide.**
