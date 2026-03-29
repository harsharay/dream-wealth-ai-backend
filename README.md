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

## Requirements
- Node.js environment
- `.env` file containing:
  - `LLM_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
