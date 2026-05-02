import "dotenv/config";
import { logger } from "../utils/logger.js";

const {
    PORT = 3001,
    LLM_KEY,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    ENCRYPTION_KEY,
} = process.env;

if (!LLM_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
    logger.error(
        "startup_error",
        "Missing required environment variables (LLM_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY)"
    );
    process.exit(1);
}

if (Buffer.from(ENCRYPTION_KEY, "hex").length !== 32) {
    logger.error("startup_error", "ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
    process.exit(1);
}

export const env = {
    PORT,
    LLM_KEY,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    ENCRYPTION_KEY,
};
