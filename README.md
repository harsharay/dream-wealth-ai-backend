# WealthPilot Backend

This is the secure backend proxy for the Dream WealthPilot AI Insights feature. It protects the Gemini API key, manages IP rate limits, enforces user quotas, and interacts with Supabase for data caching.

## Architecture: AI Insights Flow

To ensure atomic transactions, prevent race conditions, and minimize AI costs, the system uses the following robust flow for every `/api/insights` request:

1. **Verify JWT**: Express middleware extracts the Supabase Auth generic token and validates the user session.
2. **Rate Limit check**: Protects the server from spam attacks using `express-rate-limit` (10 max requests per 15 minutes).
3. **Cache Check (Cost Saving)**: 
   - Uses `dataHash` provided by the frontend.
   - Queries `ai_insights_cache` via Supabase Service Role.
   - If a hit occurs, the cached insights are returned instantly (0 quota cost, 0 LLM cost).
4. **Atomic Quota Check**:
   - Executes the `check_and_increment_quota` RPC on Supabase.
   - This RPC uses a `FOR UPDATE` row-level lock to prevent concurrent bypasses.
   - It also handles daily resets internally.
   - If blocked, returns a `429 Too Many Requests` status.
5. **Call Gemini LLM**: Sends the financial data to Gemini.
6. **Store in Cache**: Saves the generated insights to `ai_insights_cache` using the backend.
7. **Return Response**: Returns the parsed JSON to the user.

## Project Structure

The codebase follows a standard layered Express layout. `server.js` is a thin entry point; all logic lives under `src/`.

```
dream-wealth-ai-backend/
├── server.js                            # Entry: bootstraps env + starts the app
├── package.json
└── src/
    ├── app.js                           # Express app: cors, json, route mounting, /health
    ├── config/
    │   ├── env.js                       # Loads + validates required env vars (exits on error)
    │   ├── constants.js                 # PROMPT_VERSION, MODEL_VERSION, ALLOWED_ORIGINS
    │   ├── cors.js                      # CORS options
    │   └── supabase.js                  # Shared Supabase service-role client
    ├── middleware/
    │   ├── auth.js                      # authenticateUser (Supabase JWT)
    │   └── rateLimit.js                 # express-rate-limit instance for /api
    ├── schemas/
    │   └── financial.schema.js          # Zod schemas (financialData, insightsRequest)
    ├── utils/
    │   ├── logger.js                    # Structured JSON logger (info/warn/error)
    │   └── crypto.js                    # encryptData, decryptData, sha256
    ├── services/
    │   └── gemini.service.js            # callGemini(prompt) — single LLM client
    ├── prompts/
    │   ├── insights.prompt.js
    │   ├── simulatorQuestions.prompt.js
    │   └── simulatorRecommend.prompt.js
    ├── controllers/
    │   ├── financialRecords.controller.js
    │   ├── insights.controller.js
    │   ├── simulator.controller.js
    │   └── actionTracking.controller.js
    └── routes/
        ├── index.js                     # Mounts subrouters under /api + applies rate limiter
        ├── financialRecords.routes.js   # /api/financial-records
        ├── insights.routes.js           # /api/insights, /api/insights/history
        └── simulator.routes.js          # /api/simulator/* including /track endpoints
```

### Layer responsibilities

- **config/** — environment, third-party clients, and global constants. Imported once at startup.
- **middleware/** — cross-cutting concerns (auth, rate limiting) reusable across routes.
- **schemas/** — Zod request validators, kept separate so they can be shared/tested.
- **utils/** — pure helpers (logging, crypto). No I/O dependencies on Express.
- **services/** — outbound integrations (Gemini). Controllers never `fetch` directly.
- **prompts/** — LLM prompt builders, isolated for versioning and prompt iteration.
- **controllers/** — request handlers. Orchestrate validation → cache → service → persistence → response.
- **routes/** — wire HTTP verbs/paths to controllers; `routes/index.js` applies the API rate limiter and mounts subrouters under `/api`.

## API Surface

All endpoints under `/api` require a `Bearer <supabase-jwt>` and are rate-limited (100 requests / 15 min per user).

| Method | Path                           | Purpose                                   |
| ------ | ------------------------------ | ----------------------------------------- |
| POST   | `/api/financial-records`       | Save encrypted financial snapshot         |
| GET    | `/api/financial-records`       | Fetch latest decrypted snapshot           |
| POST   | `/api/insights`                | Generate (or return cached) AI insights   |
| GET    | `/api/insights/history`        | List cached insight history               |
| POST   | `/api/simulator/questions`     | Generate personalized scenario questions  |
| GET    | `/api/simulator/state`         | Resume saved simulator state              |
| POST   | `/api/simulator/state`         | Persist simulator state                   |
| GET    | `/api/simulator/eligibility`   | Check 7-day cooldown for new generation   |
| POST   | `/api/simulator/rate`          | Like/dislike a generated question         |
| POST   | `/api/simulator/recommend`     | Generate 3 personalized 12-week paths     |
| POST   | `/api/simulator/track`         | Start tracking an action plan             |
| GET    | `/api/simulator/track`         | List user's tracked plans                 |
| PUT    | `/api/simulator/track/:id`     | Update progress / status / action items   |
| GET    | `/health`                      | Liveness probe                            |

## Requirements

- Node.js 18+ (uses built-in `fetch`)
- `.env` file containing:
  - `LLM_KEY` — Google Gemini API key
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ENCRYPTION_KEY` — 64-character hex string (32 bytes) for AES-256-CBC
  - `PORT` (optional, defaults to `3001`)

## Running

```bash
npm install
npm run dev      # node --watch server.js
npm start        # node server.js
```
