# 🧭 FinPilot

> **Autonomous AI-Assisted, Policy-Governed PayPal Invoicing for Freelancers**

FinPilot empowers independent freelancers to generate, review, approve, dispatch, and track professional client invoices in seconds. Freelancers simply enter plain-text requests (e.g. *"Invoice Acme Corp $500 for web design due in 7 days"*), review a structured proposal, authorize it through an explicit human-in-the-loop approval workflow, dispatch it via the **PayPal Invoicing API (Sandbox)**, and track settlements with cryptographic webhook signature verification and mandatory API re-fetch confirmation.

---

## ⚡ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons | Responsive freelancer portal, same-origin API proxy, real-time workflow controls |
| **Backend API** | Node.js 20+, Fastify 4.x, TypeScript | State machine orchestrator, policy engine, PayPal client, origin-restricted CORS |
| **Database & ORM** | SQLite (`dev.db`), Prisma ORM 5.x | Data persistence, ACID transactions, and append-only audit trail |
| **Real AI Service** | Python 3.11+, FastAPI, Uvicorn, Google Gemini | Natural language invoice extraction & contextual reminder drafting |
| **Fallback AI Service** | TypeScript / Fastify Microservice | Deterministic heuristic fallback microservice |
| **Payment Gateway** | PayPal Invoicing REST API v2 (Sandbox) | Draft creation, client dispatch, automated reminders, and webhooks |
| **Authentication** | Signed HTTP-only session cookies with bcrypt password hashing | Protected API routes and authenticated session state |

---

## 🧠 Google Gemini Models Used at Runtime

The Python AI microservice (`ai-service-python/app/llm.py`) connects to Google Gemini using `google-genai` with automatic model fallback for resilience:

- **Primary Model**: `gemini-3.1-flash-lite`
  - Configured via environment variable: `GEMINI_MODEL` (defaults to `"gemini-3.1-flash-lite"`).
  - High-speed, cost-efficient model used for invoice entity extraction, currency detection, and reminder drafting.
- **Fallback Model**: `gemini-3.5-flash-lite`
  - Configured via environment variable: `GEMINI_FALLBACK_MODEL` (defaults to `"gemini-3.5-flash-lite"`).
  - Automatically engaged if the primary model returns HTTP 503 (service unavailable) or 504 (gateway timeout).

---

## 🏗️ Architecture & Data Flow

```
+-----------------------------------------------------------------------------------+
|                              Next.js 14 Frontend                                  |
|         (Dashboard, Invoice Review, Policy Config, Append-Only Audit Trail)       |
+-----------------------------------------+-----------------------------------------+
                                          | HTTP / JSON with credentials (Port 3000 -> 4000)
                                          | Browser uses /api same-origin rewrite proxy
                                          v
+-----------------------------------------------------------------------------------+
|                               Fastify Backend API                                 |
|  - Human-in-the-Loop State Machine        - Policy Engine (Limits, Duplicates)     |
|  - PayPal OAuth & Draft/Send Client       - Webhook Verification & Re-Fetch Guard  |
|  - Strict CORS (FRONTEND_URL only)        - AI Rate Limiter (Quota Protection)     |
|  - Signed Session Auth & Production Guard - Append-Only Audit Logging              |
+-------------------+---------------------+--------------------+--------------------+
                    |                     |                    |
   HTTP (Port 5002) |    Prisma / SQLite  |   HTTPS            |
                    v                     v                    v
+-----------------------+   +-------------------+   +-------------------------------+
|  Python Gemini AI     |   |   SQLite Database |   |    PayPal Invoicing API v2    |
|  - POST /parse-invoice|   |  - Users          |   |  - OAuth 2.0 Client Creds     |
|  - POST /generate-    |   |  - Invoices       |   |  - POST /v2/invoicing/invoices|
|         reminder      |   |  - InvoiceItems   |   |  - POST .../invoices/{id}/send|
|  (gemini-3.1-flash-   |   |  - PolicyConfigs  |   |  - POST .../{id}/remind       |
|   lite & fallback)    |   |  - AuditLogs      |   |  - Webhook: INVOICE.PAID      |
+-----------------------+   +-------------------+   +-------------------------------+
```

---

## 🛡️ Key Safety & Governance Boundaries

FinPilot was engineered with strict safety mechanisms to eliminate common risks associated with autonomous AI financial tooling:

1. **Human-in-the-Loop Approval Boundary**:
   - The AI service produces only `PROPOSED` invoice drafts.
   - **Nothing is ever dispatched to PayPal or emailed to a client without explicit user action in the UI.**
   - Out-of-order state transitions (e.g., trying to create a PayPal draft before approval) are rejected with HTTP 400 by backend state machine guards.

2. **Real-Time Policy Engine**:
   - **Max Amount Ceiling**: Configurable invoice ceiling (default: `$10,000 USD`). Invoices exceeding this threshold require explicit warning acknowledgment before approval.
   - **Duplicate Invoice Prevention**: Blocks creation if an invoice with the identical client email and total amount was created within a configurable sliding window (default: 24 hours).
   - **Reminder Rate Limits & Cooldowns**: Reminders are strictly barred unless an invoice is `SENT` or `OVERDUE`. Caps reminders at 3 per invoice and enforces a 3-day cooling-off interval between reminders.

3. **Separation of Demo Flags & Payment Simulation**:
   - **`SHOW_DEMO_LOGIN`** (default `true` in dev): Controls whether demo login credentials and auto-fill hints appear on `/login`.
   - **`ENABLE_PAYMENT_SIMULATION`** (default `false`): Controls whether the developer `/api/webhooks/simulate` endpoint is registered.
   - **Public deployments MUST run with `ENABLE_PAYMENT_SIMULATION=false`.** When disabled, the route is completely unregistered and returns 404.
   - When simulation is enabled for QA, simulated payments are explicitly labeled as `[SIMULATED]` in the immutable audit log and the UI, ensuring no simulated event can ever masquerade as authentic settlement.

4. **Cryptographic Webhook Verification with Mandatory API Re-Fetch**:
   - Webhook payloads verify PayPal transmission signatures (`paypal-transmission-sig`, `paypal-cert-url`, etc.).
   - Crucially, FinPilot **never trusts the incoming webhook body alone**. Upon receiving `INVOICING.INVOICE.PAID`, the backend re-fetches the live record directly from PayPal's API.
   - Marked as `PAID` **only if** PayPal confirms `status === "PAID"` AND `due_amount.value === "0.00"`. Partial or pending payments are logged in the audit trail without altering the paid status.

5. **AI Rate Limiting (Gemini Quota Protection)**:
   - A sliding-window rate limiter tracks requests per authenticated user and per IP address across AI-backed endpoints (`/invoices/parse` and `/invoices/:id/remind`).
   - Caps requests to 10 per minute with friendly, actionable error messages and retry-after hints.

6. **Immutable, Append-Only Audit Trail**:
   - Every invoice proposal, modification, approval, policy check, reminder dispatch, and payment event generates an append-only `AuditLog` entry with timestamp, actor, and context snapshot.
   - Zero update or delete routes or database mutation paths exist for audit logs across the application.

---

## 🌐 Real Webhook Readiness & Setup

To receive real payment notifications from PayPal Sandbox or Live in production:

### 1. Expose Your Local Server or Deploy Publicly
PayPal webhooks require an internet-accessible HTTPS endpoint:
- **Local Sandbox Testing via ngrok**:
  ```bash
  ngrok http 4000
  ```
  Note your public forwarding URL (e.g. `https://your-subdomain.ngrok-free.app`).
- **Hosted Cloud Deployment**:
  Deploy to Render, Fly.io, or Railway and note your backend URL (e.g. `https://api.finpilot.com`).

> [!IMPORTANT]
> **Webhook Direct Registration Requirement**:
> PayPal webhooks **must be registered directly against the Fastify backend's public URL** (`https://<backend-host>/api/webhooks/paypal`), NOT routed through the Next.js frontend rewrite (`https://<frontend-host>/api/webhooks/paypal`).
>
> **Why?**
> PayPal's webhook verification service (`/v1/notifications/verify-webhook-signature`) validates asymmetric RSA signatures based on the exact raw transmission bytes and headers (`paypal-transmission-sig`, `paypal-transmission-time`, `paypal-cert-url`, etc.). Intermediate reverse proxies like Next.js rewrites can re-serialize JSON bodies, alter whitespace, stream chunks, or drop custom transmission headers, which causes cryptographic signature checks to fail. Direct routing to Fastify ensures pristine raw body preservation and instant signature validation.

### 2. Register Webhook in PayPal Developer Dashboard
1. Log in to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox).
2. Select your Sandbox App and scroll to **Webhooks** > **Add Webhook**.
3. Set the Webhook URL (pointing directly to the backend):
   ```text
   https://<backend-public-domain>/api/webhooks/paypal
   ```
4. Subscribe to the following events:
   - `Invoicing invoice paid` (`INVOICING.INVOICE.PAID`)
   - `Payment capture completed` (`PAYMENT.CAPTURE.COMPLETED`)
5. Save the webhook and copy the generated **Webhook ID**.

### 3. Configure the Environment Variable
Set the webhook ID in your `backend/.env`:
```env
PAYPAL_WEBHOOK_ID="your_copied_paypal_webhook_id"
```

### 4. Verify Webhook Readiness via `/health`
Check backend webhook configuration status at any time:
```bash
curl http://localhost:4000/health
```
Response:
```json
{
  "status": "ok",
  "service": "finpilot-backend",
  "timestamp": "2026-11-09T...",
  "paypalEnv": "sandbox",
  "aiServiceUrl": "http://localhost:5002",
  "webhookVerification": {
    "configured": true,
    "webhookIdPresent": true,
    "simulationMode": false
  }
}
```
*Note: The health endpoint confirms signature verification status without leaking secret credentials.*

---

## 🔄 State Machine Lifecycle Matrix

| State | Allowed Next State | Action Required |
|---|---|---|
| `PROPOSED` | `APPROVED` | Explicit UI click on **"Approve Invoice Proposal"** |
| `APPROVED` | `CREATED` | Freelancer initiates **"Create PayPal Draft"** (`POST /v2/invoicing/invoices`) |
| `CREATED` | `SENT` | Explicit UI click on **"Send to Client via PayPal"** (`POST .../{id}/send`) |
| `SENT` | `PAID` | Verified PayPal webhook confirming full payment OR live status sync |
| `SENT` | `OVERDUE` | System detects `dueDate < now` without settled balance |
| `OVERDUE` | `PAID` | Late payment confirmed via PayPal re-fetch verification |
| `PAID` | *None* | Terminal state. No further modifications or reminders permitted. |

---

## 🚀 Quickstart Guide (Judges: Up in 5 Minutes)

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Python**: v3.11 or higher
- **npm**: v9.0.0 or higher

---

### Step 1: One-Time Setup

1. **Install root & subproject dependencies:**
   ```bash
   npm run install:all
   ```

2. **Install Python AI microservice dependencies:**
   ```bash
   python -m pip install -r ai-service-python/requirements.txt
   ```

3. **Configure Environment Files:**
   Copy the provided `.env.example` templates to `.env`:
   ```bash
   # Root / Backend environment
   cp .env.example .env
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   cp ai-service-python/.env.example ai-service-python/.env
   ```
   *Note: Add your `GEMINI_API_KEY` into `ai-service-python/.env`. All PayPal services default to sandbox simulation mode out of the box if real PayPal keys are not provided.*

4. **Initialize Database & Seed Demo Data:**
   ```bash
   npm run reset
   ```
   *This wipes any existing database, applies the Prisma schema, and seeds policy defaults, the demo account, and 5 realistic sample invoices across all lifecycle states.*

---

### Step 2: Start the Services

You can start all three services together or in separate terminals:

#### Option A: Single Command (Concurrently)
```bash
npm run dev
```

#### Option B: Dedicated Terminals
```bash
# Terminal 1: Real Python AI Service (Port 5002 - Google Gemini)
npm run dev:ai:python

# Terminal 2: Fastify Backend API (Port 4000)
npm run dev:backend

# Terminal 3: Next.js Frontend (Port 3000)
npm run dev:frontend
```

---

### Step 3: Access the Application

- **Frontend Portal**: [http://localhost:3000](http://localhost:3000)
- **Backend API & Health**: [http://localhost:4000/health](http://localhost:4000/health)
- **Python AI Health**: [http://localhost:5002/health](http://localhost:5002/health)

---

## 🎮 How to Demo FinPilot (Step-by-Step Walkthrough)

### 1. Sign In
- Navigate to [http://localhost:3000/login](http://localhost:3000/login).
- Click the **"Auto-fill"** button in the Demo Credentials banner (`SHOW_DEMO_LOGIN=true`):
  - **Email**: `demo@finpilot.dev`
  - **Password**: `finpilot123`
- Click **"Sign in"**. You will be securely authenticated and redirected to the dashboard.

### 2. Create an Invoice with Plain English
- Click **"Create Invoice with AI"** in the top navigation or hero banner.
- Paste the following sample prompt:
  ```text
  Invoice Acme Corp (billing@acmecorp.com) $500 for web design and branding due in 7 days
  ```
- Click **"Generate Proposal"**.
- FinPilot will call Google Gemini (`gemini-3.1-flash-lite`), extract structured line items, recipient email, currency, and calculate the due date, and open the invoice detail page in `PROPOSED` status.

> [!TIP]
> **Notice for Hackathon Judges & Evaluators (Duplicate Invoice Detection)**:
> FinPilot actively enforces a **Duplicate Invoice Prevention Policy** (default 24-hour sliding window). If you or another evaluator already submitted this exact sample prompt (`billing@acmecorp.com` for `$500.00`), the policy engine will flag:
> ```
> Duplicate Invoice Detected: Invoice #INV-... for $500.00 was already drafted/sent to billing@acmecorp.com within the last 24 hours
> ```
> **How to proceed if flagged:**
> 1. **Change the prompt/amount**: In the prompt or proposal editor, change the total amount (e.g. `$550` or `$1,200`) or client email (e.g. `billing2@acmecorp.com`).
> 2. **Or use the Policy Override**: On the invoice review page, check the **"Acknowledge Policy Warning & Override"** checkbox next to the Approve button. This records your explicit override in the append-only audit trail and allows you to proceed with approval.

### 3. Review & Explicit Approval
- Review the line items and terms. You can click **"Edit Proposal"** to adjust numbers or descriptions.
- Click **"Approve Invoice Proposal"**.
- Notice the state moves to `APPROVED`. The human approval requirement is satisfied.

### 4. Create PayPal Draft & Send
- Click **"Create PayPal Invoice Draft"**. State advances to `CREATED`, assigning an official PayPal invoice ID.
- Click **"Send to Client via PayPal"**. State advances to `SENT`. An audit log entry is permanently recorded.

### 5. Send an AI Reminder
- On the `SENT` invoice, click **"Send AI Reminder"**.
- Select a tone: **Gentle**, **Firm**, or **Urgent**.
- Gemini dynamically generates personalized dunning copy with invoice specifics. Click **"Dispatch Reminder"**.
- Notice the reminder counter increments to `1/3` and the policy cooldown activates.

### 6. Verify Settlement via Webhook
- With `ENABLE_PAYMENT_SIMULATION=true`, click **"Simulate Webhook & Re-fetch"**.
- Select **"Simulate Full Settlement (PAID)"** and submit.
- FinPilot receives the webhook, verifies transmission headers, performs the mandatory API re-fetch to confirm `$0.00` balance, transitions the invoice to `PAID`, and labels the event as `[SIMULATED]`.
- Try **"Simulate Partial Payment"**: observe that FinPilot refuses to mark the invoice as paid because balance remains outstanding.

### 7. Inspect Immutable Audit Trail
- Click **"Audit Trail"** in the navbar or visit [http://localhost:3000/audit](http://localhost:3000/audit).
- Inspect every action, actor attribution, timestamp, `[SIMULATED]` indicators, and contextual JSON snapshots.

---

## 🧪 Automated Test Suites

FinPilot includes complete end-to-end and regression test suites:

### 1. Security & Failure-Path Tests (57 Checks)
Verifies AI outage handling, approval boundaries, signature forgery prevention, webhook idempotency, reminder cooldowns, rate limits, CORS origin protection, audit log immutability, schema validation, and secret sanitization:
```bash
cd backend
npx tsx test-failure-paths.ts
```

### 2. Audit Log Immutability Tests (10 Checks)
Asserts 0 mutation/deletion routes exist in the API and verifies 0 occurrences in source code:
```bash
cd backend
npx tsx test-audit-immutability.ts
```

### 3. Production Session Secret Guard Test
Verifies that the backend process immediately halts with code 1 if `SESSION_SECRET` is missing in production:
```bash
cd backend
npx tsx test-session-secret.ts
```

### 4. Full End-to-End Workflow Test (10 Stages)
Simulates prompt parsing, policy duplicate rejection, approval transitions, PayPal draft creation, client dispatch, 3 reminder tones, and webhook settlement:
```bash
cd backend
npx tsx test-e2e.ts
```

### 5. Python AI Service Evals (18 Test Cases)
Evaluates currency detection, Hinglish parsing, prompt injection defense, missing attributes, and boundary cases with 100% pass rate:
```bash
cd ai-service-python
python evals/run_eval.py
```

---

## 🚀 Render Native Deployment (Free Tier Guide)

FinPilot can be deployed on Render using native runtimes (Web Services without Docker).

> [!NOTE]
> **Render Free Tier Spin-Down & Cold Starts**:
> Render's free tier spins down web services after 15 minutes of inactivity. When spinning up after inactivity:
> - The first request can take **1 to 2 minutes** to spin up both the frontend and backend instances.
> - The free filesystem is wiped upon spin-down. FinPilot's **idempotent startup bootstrap** automatically executes `prisma db push` and seeds the demo account on each boot, ensuring the app is always fully operational.
> - **Demo Credentials**:
>   - **Email**: `demo@finpilot.dev`
>   - **Password**: `finpilot123`

---

### Service 1: Python AI Microservice (`ai-service-python`)
Create a **Web Service** on Render with:
- **Environment**: `Python 3`
- **Root Directory**: `ai-service-python`
- **Build Command**: `pip install --upgrade pip && pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `PYTHON_VERSION`: `3.11.9`
  - `PORT`: `5002` (Render auto-sets `$PORT`)
  - `GEMINI_API_KEY`: `<your_gemini_api_key>`
  - `GEMINI_MODEL`: `gemini-3.1-flash-lite`
  - `GEMINI_FALLBACK_MODEL`: `gemini-3.5-flash-lite`
  - `AI_SERVICE_TOKEN`: `<your_secure_shared_secret>` (protects public endpoints; requires token header except on `/health`)

---

### Service 2: Fastify Backend API (`backend`)
Create a **Web Service** on Render with:
- **Environment**: `Node`
- **Root Directory**: `backend`
- **Build Command**: `npm install --include=dev && npm run build && npx prisma generate`
  *(Note: `--include=dev` is mandatory because `typescript` and `prisma` CLI are devDependencies!)*
- **Start Command**: `npx prisma db push --skip-generate && npx tsx prisma/seed.ts && node dist/index.js`
  *(Note: Automatically runs schema bootstrap and idempotent seeding before booting Fastify on `0.0.0.0:$PORT`.)*
- **Environment Variables**:
  - `NODE_VERSION`: `20.18.0`
  - `NODE_ENV`: `production`
  - `HOST`: `0.0.0.0`
  - `DATABASE_URL`: `file:./dev.db`
  - `SESSION_SECRET`: `<high_entropy_secret_min_32_characters>`
  - `FRONTEND_URL`: `https://<your-frontend-service>.onrender.com`
  - `AI_SERVICE_URL`: `https://<your-ai-service>.onrender.com`
  - `AI_SERVICE_TOKEN`: `<your_secure_shared_secret>` (matching AI service)
  - `SHOW_DEMO_LOGIN`: `true`
  - `ENABLE_PAYMENT_SIMULATION`: `false`
  - `PAYPAL_CLIENT_ID`: `<paypal_client_id>`
  - `PAYPAL_CLIENT_SECRET`: `<paypal_client_secret>`
  - `PAYPAL_WEBHOOK_ID`: `<paypal_webhook_id>`
  - `PAYPAL_ENV`: `sandbox`

---

### Service 3: Next.js Frontend (`frontend`)
Create a **Web Service** on Render with:
- **Environment**: `Node`
- **Root Directory**: `frontend`
- **Build Command**: `npm install --include=dev && npm run build`
- **Start Command**: `npm start`
- **Environment Variables**:
  - `NODE_VERSION`: `20.18.0`
  - `NODE_ENV`: `production`
  - `PORT`: `3000` (Render auto-sets `$PORT`)
  - `BACKEND_INTERNAL_URL`: `https://<your-backend-service>.onrender.com/api` (**BUILD TIME & RUNTIME** for `next.config.mjs` rewrites and SSR!)
  - `NEXT_PUBLIC_API_URL`: `https://<your-backend-service>.onrender.com/api`

---

## 🐳 Docker Deployment (Untested Reference)

> [!WARNING]
> **Status**: Untested reference configuration. FinPilot has been thoroughly developed, verified, and regression-tested using **native runtimes** on Windows and Linux. The root `docker-compose.yml` and Dockerfiles are provided as a convenience reference configuration.

```bash
# Reference Docker build (untested on all container daemon variants)
docker compose up --build
```

### Cross-Platform & Engine Details
- **Linux, macOS, and Docker**: The backend runs the standard, high-performance Node-API **`library`** engine (`libquery_engine-linux-musl-openssl-3.0.x.so.node`). Both `openssl` and `libc6-compat` are installed in the container image.
- **Windows Local Development**: If you encounter the Windows-specific Node DLL error `query_engine-windows.dll.node is not a valid Win32 application`, set `PRISMA_CLIENT_ENGINE_TYPE="binary"` in your local `backend/.env`. On Linux, macOS, and inside Docker containers, leave `PRISMA_CLIENT_ENGINE_TYPE` unset to use the faster, in-process Node-API library engine without child process overhead.
- **Automated Container DB Bootstrap**: The backend container automatically executes `npx prisma db push --skip-generate` at container start, ensuring SQLite schemas and tables are initialized in `/app/data/prod.db` without requiring manual database migration commands.

---

## 📋 Environment Variables: Build Time vs. Runtime Reference

The table below lists every environment variable used across FinPilot, specifying when it is required (**BUILD TIME** vs. **RUNTIME**), default values, and operational scope:

| Variable | Service | Required At | Default / Example | Purpose & Behavior |
|:---|:---|:---:|:---|:---|
| `NEXT_PUBLIC_API_URL` | Frontend | **BUILD TIME** | `http://localhost:4000/api` | Inlined into client-side JavaScript bundles by the Next.js compiler during `npm run build`. |
| `BACKEND_INTERNAL_URL` | Frontend | **BUILD & RUNTIME** | `http://backend:4000/api` | Target URL used by Next.js server rewrites (`next.config.mjs`) during compilation and SSR to route `/api/*` calls directly to the Fastify backend. |
| `PORT` | Frontend | **RUNTIME** | `3000` | Port on which the Next.js web application listens. |
| `NODE_ENV` | All Services | **BUILD & RUNTIME** | `production` / `development` | Optimizes Next.js compilation (`production`) and activates backend session security guards and cookie flags. |
| `DATABASE_URL` | Backend | **BUILD & RUNTIME** | `file:/app/data/prod.db` | SQLite database file location. Used during schema pushes and runtime queries. |
| `PRISMA_CLIENT_ENGINE_TYPE` | Backend | **BUILD & RUNTIME** | `library` (Linux/macOS) / `binary` (Windows) | Controls whether Prisma uses Node-API (`library`) or external child processes (`binary`). On Linux/macOS/Docker, leave unset (defaults to `library`). On Windows, set to `binary` if DLL loading errors occur. |
| `PORT` | Backend | **RUNTIME** | `4000` | Port on which the Fastify API server listens. |
| `HOST` | Backend | **RUNTIME** | `0.0.0.0` | Bind address for Fastify server (`0.0.0.0` required for cloud platforms like Render). |
| `SESSION_SECRET` | Backend | **RUNTIME** | *Required in Prod* (min 32 chars) | Cryptographic HMAC secret used to sign session cookies. Refuses to start if missing or under 32 chars in production. |
| `FRONTEND_URL` | Backend | **RUNTIME** | `http://localhost:3000` | Whitelisted CORS origin. Refuses to reflect untrusted origins for credentialed requests. |
| `AI_SERVICE_URL` | Backend | **RUNTIME** | `http://ai-service:5002` | Target URL of the primary Python AI service for natural language invoice extraction and reminder drafting. |
| `AI_MOCK_SERVICE_URL` | Backend | **RUNTIME** | `http://localhost:5001` | Optional fallback URL to the deterministic TypeScript mock microservice if the Python service is offline. |
| `AI_SERVICE_TOKEN` | Backend & AI Service | **RUNTIME** | `replace-with-a-secure-random-token` | Shared-secret token header (`X-AI-Service-Token`) sent by the backend and required by the publicly reachable Python service. |
| `SHOW_DEMO_LOGIN` | Backend | **RUNTIME** | `false` (prod) / `true` (dev) | Exposes demo account credentials and auto-fill button on the `/login` page. |
| `ENABLE_PAYMENT_SIMULATION`| Backend | **RUNTIME** | `false` (prod) / `false` (dev) | Registers `/api/webhooks/simulate`. Must remain `false` on public and production deployments. |
| `PAYPAL_ENV` | Backend | **RUNTIME** | `sandbox` / `live` | Target PayPal REST API environment. |
| `PAYPAL_BASE_URL` | Backend | **RUNTIME** | `https://api-m.sandbox.paypal.com` | Base endpoint for PayPal Invoicing REST v2 calls. |
| `PAYPAL_CLIENT_ID` | Backend | **RUNTIME** | *PayPal Sandbox Client ID* | OAuth 2.0 client credential for PayPal invoicing. |
| `PAYPAL_CLIENT_SECRET` | Backend | **RUNTIME** | *PayPal Sandbox Secret* | OAuth 2.0 client secret for PayPal authentication. |
| `PAYPAL_WEBHOOK_ID` | Backend | **RUNTIME** | *PayPal Webhook ID* | Registered webhook ID used to cryptographically verify incoming payment notifications. |
| `MAX_INVOICE_AMOUNT` | Backend | **RUNTIME** | `10000` | Policy ceiling above which an invoice requires explicit warning override before approval. |
| `DUPLICATE_WINDOW_HOURS` | Backend | **RUNTIME** | `24` | Sliding-window threshold (hours) for blocking duplicate invoices with matching email and amount. |
| `MAX_REMINDERS_PER_INVOICE`| Backend | **RUNTIME** | `3` | Maximum permitted automated dunning reminders per invoice. |
| `MIN_DAYS_BETWEEN_REMINDERS`| Backend | **RUNTIME** | `3` | Minimum mandatory cooling-off period (days) between consecutive reminders. |
| `PORT` | AI Service | **RUNTIME** | `5002` | Port on which the Python FastAPI/Uvicorn microservice listens. |
| `GEMINI_API_KEY` | AI Service | **RUNTIME** | *Google AI Studio Key* | Secret API key used for Google Gemini model inference. |
| `GEMINI_MODEL` | AI Service | **RUNTIME** | `gemini-3.1-flash-lite` | Primary Gemini model name for invoice extraction and reminders. |
| `GEMINI_FALLBACK_MODEL` | AI Service | **RUNTIME** | `gemini-3.5-flash-lite` | Fallback Gemini model name automatically engaged if primary returns 503/504 errors. |

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](./LICENSE) for full details.
