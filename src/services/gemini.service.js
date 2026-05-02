import { env } from "../config/env.js";
import { MODEL_VERSION } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export const callGemini = async (prompt) => {
    const t0 = Date.now();
    const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_VERSION}:generateContent?key=${env.LLM_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
            }),
        }
    );

    if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Gemini API error: ${geminiRes.status} - ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const duration = Date.now() - t0;
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty response from Gemini");

    logger.info("llm_response", { duration_ms: duration, tokens: rawText.length });
    return JSON.parse(rawText);
};
