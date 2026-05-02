import { supabase } from "../config/supabase.js";
import { logger } from "../utils/logger.js";
import { sha256 } from "../utils/crypto.js";
import { PROMPT_VERSION, MODEL_VERSION } from "../config/constants.js";
import { insightsRequestSchema } from "../schemas/financial.schema.js";
import { callGemini } from "../services/gemini.service.js";
import { buildInsightsPrompt } from "../prompts/insights.prompt.js";

export const generateInsights = async (req, res) => {
    const t0 = Date.now();
    const userId = req.user.id;
    let validatedReq;

    try {
        validatedReq = insightsRequestSchema.parse(req.body);
    } catch (err) {
        logger.warn("validation_failed", { user_id: userId, issues: err.issues });
        return res.status(400).json({ error: err.issues });
    }

    const { data, metrics, dataHash } = validatedReq;
    const versionString = `${PROMPT_VERSION}|${MODEL_VERSION}`;
    const backendHash = sha256(dataHash + versionString);

    try {
        const { data: cached, error: cacheError } = await supabase
            .from("ai_insights_cache")
            .select("insight_data")
            .eq("user_id", userId)
            .eq("data_hash", backendHash)
            .single();

        if (cached && !cacheError) {
            logger.info("cache_hit", { user_id: userId, hash: backendHash, total_ms: Date.now() - t0 });
            return res.json({ ...cached.insight_data, cached: true });
        }

        const { data: isAllowed, error: rpcError } = await supabase.rpc("check_and_increment_quota", {
            target_user_id: userId,
        });
        if (rpcError) throw rpcError;

        if (!isAllowed) {
            logger.warn("quota_exceeded", { user_id: userId });
            return res.status(429).json({ error: "Daily quota reached" });
        }

        const prompt = buildInsightsPrompt(data, metrics);
        const parsedOutput = await callGemini(prompt);
        const finalPayload = { ...parsedOutput, timestamp: Date.now() };

        await supabase.from("ai_insights_cache").upsert({
            user_id: userId,
            data_hash: backendHash,
            insight_data: finalPayload,
            created_at: new Date().toISOString(),
        });

        logger.info("cache_miss_served", { user_id: userId, total_ms: Date.now() - t0 });
        res.json(finalPayload);
    } catch (err) {
        logger.error("insights_error", err, { user_id: userId });
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getInsightsHistory = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("ai_insights_cache")
            .select("insight_data, created_at")
            .eq("user_id", req.user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        logger.error("history_fetch_error", err);
        res.status(500).json({ error: "Failed to fetch history" });
    }
};
