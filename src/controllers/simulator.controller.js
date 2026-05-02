import { supabase } from "../config/supabase.js";
import { logger } from "../utils/logger.js";
import { sha256 } from "../utils/crypto.js";
import { callGemini } from "../services/gemini.service.js";
import { buildSimulatorQuestionsPrompt } from "../prompts/simulatorQuestions.prompt.js";
import { buildSimulatorRecommendPrompt } from "../prompts/simulatorRecommend.prompt.js";

// Hard cap on how many questions a user answers per session.
const MAX_SESSION_QUESTIONS = 5;

const countAnswered = (history = []) =>
    history.filter((h) => h && h.answer !== undefined && h.answer !== null && h.answer !== "").length;

// Trim the slice we send to the LLM — only fields the prompt actually uses.
const slimHistory = (history = []) =>
    history
        .filter((h) => h && h.question)
        .map((h) => ({ theme: h.theme, question: h.question, answer: h.answer }));

// Normalize the LLM output to a stable { theme, q } shape. Tolerates Gemini
// drifting between `q` / `question` / `text` and root keys `questions` /
// `decision_tree` / a bare array.
const normalizeQuestions = (output) => {
    if (!output) return [];
    const raw = Array.isArray(output)
        ? output
        : output.questions || output.decision_tree || [];
    return raw
        .map((item) => {
            if (typeof item === "string") return { theme: "general", q: item, options: [] };
            const q = item?.q || item?.question || item?.text || item?.root_question;
            const theme = item?.theme || "general";
            const options = Array.isArray(item?.options)
                ? item.options.map(String).filter(Boolean)
                : [];
            return q ? { theme, q, options } : null;
        })
        .filter(Boolean);
};

// True only if the cache row matches the current `{theme, q, options}` schema
// AND does not exceed the session cap (evicts over-count rows from old builds).
const isValidCachedQuestions = (questions) =>
    Array.isArray(questions) &&
    questions.length > 0 &&
    questions.length <= MAX_SESSION_QUESTIONS &&
    questions.every(
        (it) =>
            it &&
            typeof it === "object" &&
            typeof it.q === "string" &&
            it.q.length > 0 &&
            Array.isArray(it.options)
    );

export const generateQuestions = async (req, res) => {
    try {
        const { data, metrics, force_refresh } = req.body;
        const userId = req.user.id;

        const dataHash = sha256(JSON.stringify({ metrics, riskAppetite: data?.riskAppetite }));

        if (!force_refresh) {
            const { data: cached, error: cacheError } = await supabase
                .from("simulator_question_cache")
                .select("questions")
                .eq("user_id", userId)
                .eq("data_hash", dataHash)
                .single();

            if (cached && !cacheError) {
                if (isValidCachedQuestions(cached.questions)) {
                    logger.info("simulator_cache_hit", { user_id: userId, hash: dataHash });
                    return res.json({
                        questions: cached.questions,
                        cached: true,
                        max_questions: MAX_SESSION_QUESTIONS,
                    });
                }
                logger.warn("simulator_cache_stale_shape", {
                    user_id: userId,
                    hash: dataHash,
                    sample: cached.questions?.[0],
                });
            }
        }

        if (force_refresh) {
            // Re-verify eligibility on the backend when explicitly forcing a new generation
            const { data: stateData } = await supabase
                .from("simulator_state")
                .select("state_data")
                .eq("user_id", userId)
                .single();
            const lastGen = stateData?.state_data?.lastGeneratedAt || 0;
            const weekInMs = 7 * 24 * 3600 * 1000;
            if (Date.now() - lastGen < weekInMs) {
                return res
                    .status(403)
                    .json({ error: "Cannot generate new suggestions before the 7-day cooldown period is over." });
            }
        }

        const prompt = buildSimulatorQuestionsPrompt({
            metrics,
            data,
            force_refresh,
            conversation_history: [],
            count: MAX_SESSION_QUESTIONS,
        });
        const output = await callGemini(prompt);
        const questions = normalizeQuestions(output).slice(0, MAX_SESSION_QUESTIONS);

        if (!questions.length) {
            logger.error("simulator_questions_empty_llm_output", {
                user_id: userId,
                raw: output,
            });
            return res.status(502).json({ error: "Model returned no usable questions" });
        }

        await supabase.from("simulator_question_cache").upsert(
            {
                user_id: userId,
                data_hash: dataHash,
                questions,
                created_at: new Date().toISOString(),
            },
            { onConflict: "user_id,data_hash" }
        );

        res.json({ questions, max_questions: MAX_SESSION_QUESTIONS });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// After the initial batch, generate up to 2 more breadth questions across themes
// the user hasn't answered yet. Returns done=true once the 5-question budget is hit;
// client should then POST to /simulator/recommend with the collected qna.
export const generateNextQuestions = async (req, res) => {
    try {
        const { data, metrics, conversation_history = [] } = req.body;
        const history = slimHistory(conversation_history);
        const answered = countAnswered(history);
        const remaining = MAX_SESSION_QUESTIONS - answered;

        if (remaining <= 0) {
            return res.json({
                questions: [],
                done: true,
                answered,
                max_questions: MAX_SESSION_QUESTIONS,
            });
        }

        const prompt = buildSimulatorQuestionsPrompt({
            metrics,
            data,
            force_refresh: false,
            conversation_history: history,
            count: remaining,
        });
        const output = await callGemini(prompt);
        const questions = normalizeQuestions(output).slice(0, remaining);

        res.json({
            questions,
            done: false,
            answered,
            remaining,
            max_questions: MAX_SESSION_QUESTIONS,
        });
    } catch (err) {
        logger.error("simulator_next_questions_error", err);
        res.status(500).json({ error: err.message });
    }
};

export const getSimulatorState = async (req, res) => {
    try {
        const userId = req.user.id;
        const { data, error } = await supabase
            .from("simulator_state")
            .select("state_data")
            .eq("user_id", userId)
            .single();

        if (error && error.code !== "PGRST116") {
            logger.error("simulator_state_fetch_error", { error, user_id: userId });
            throw error;
        }

        logger.info("simulator_state_fetch_success", {
            user_id: userId,
            has_state: !!data?.state_data,
            phase: data?.state_data?.phase,
        });

        res.json(data?.state_data || null);
    } catch (err) {
        logger.error("simulator_state_fetch_exception", err);
        res.status(500).json({ error: "Failed to fetch simulator state" });
    }
};

export const saveSimulatorState = async (req, res) => {
    try {
        const userId = req.user.id;
        const state = req.body;

        logger.info("simulator_state_save_request", {
            user_id: userId,
            phase: state?.phase,
            questions_count: state?.questions?.length,
        });

        const { error } = await supabase
            .from("simulator_state")
            .upsert(
                {
                    user_id: userId,
                    state_data: state,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" }
            );

        if (error) {
            logger.error("simulator_state_upsert_error", { error, user_id: userId });
            throw error;
        }

        res.json({ success: true });
    } catch (err) {
        logger.error("simulator_state_save_exception", err);
        res.status(500).json({ error: "Failed to save simulator state" });
    }
};

export const checkEligibility = async (req, res) => {
    try {
        const userId = req.user.id;
        const { data, error } = await supabase
            .from("simulator_state")
            .select("state_data")
            .eq("user_id", userId)
            .single();

        if (error && error.code !== "PGRST116") {
            throw error;
        }

        const lastGen = data?.state_data?.lastGeneratedAt || 0;
        const now = Date.now();
        const weekInMs = 7 * 24 * 3600 * 1000;

        if (now - lastGen < weekInMs) {
            const nextAvailable = new Date(lastGen + weekInMs).toISOString();
            const remainingDays = Math.ceil((weekInMs - (now - lastGen)) / (24 * 3600 * 1000));
            return res.json({ eligible: false, nextAvailableAt: nextAvailable, remainingDays });
        }

        res.json({ eligible: true });
    } catch (err) {
        logger.error("simulator_eligibility_error", err);
        res.status(500).json({ error: "Failed to check eligibility" });
    }
};

export const rateQuestion = async (req, res) => {
    try {
        const { question, rating } = req.body;
        const { error } = await supabase.from("simulator_ratings").insert({
            user_id: req.user.id,
            question_text: question,
            rating: rating, // 1 for like, -1 for dislike
            created_at: new Date().toISOString(),
        });
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        logger.error("simulator_rating_error", err);
        res.status(500).json({ error: "Failed to save rating" });
    }
};

export const recommend = async (req, res) => {
    try {
        const { qna, metrics, data } = req.body; // array of { question, answer }
        const prompt = buildSimulatorRecommendPrompt({ qna, metrics, data });
        const output = await callGemini(prompt);
        res.json(output);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
