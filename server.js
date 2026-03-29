import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3001;
const LLM_KEY = process.env.LLM_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!LLM_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing required environment variables (LLM_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY)");
    process.exit(1);
}

// Initialize Supabase admin client (using service role to manage quotas)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const allowedOrigins = [
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
    "https://dream-wealth-ai.lovable.app",
];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("CORS blocked: " + origin));
            }
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

// ─── AUTH MIDDLEWARE ────────────────────────────────────────────────────────
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: "Invalid or expired token" });
        }
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Authentication failed" });
    }
};

// ─── QUOTA & CACHE HELPERS ────────────────────────────────────────────────────
const verifyRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // strict limit on proxy requests
});

app.use("/api/", verifyRateLimit);
app.use(express.json());

// ─── POST /api/insights ──────────────────────────────────────────────────────
app.post("/api/insights", authenticateUser, async (req, res) => {
    const { data, metrics, dataHash } = req.body;
    const userId = req.user.id;

    if (!data || !metrics || !dataHash) {
        return res.status(400).json({ error: "Missing data, metrics, or dataHash in request body" });
    }

    try {
        // 1. Check Supabase Cache FIRST (zero quota/LLM cost)
        const { data: cached, error: cacheError } = await supabase
            .from("ai_insights_cache")
            .select("insight_data")
            .eq("user_id", userId)
            .eq("data_hash", dataHash)
            .single();

        if (cached && !cacheError) {
            console.log("Supabase cache hit in backend for:", userId);
            return res.json({ ...cached.insight_data, cached: true });
        }

        // 2. Atomic Quota Check & Increment via RPC
        const { data: isAllowed, error: rpcError } = await supabase.rpc(
            "check_and_increment_quota",
            { target_user_id: userId }
        );

        if (rpcError) {
            console.error("Quota RPC error:", rpcError);
            return res.status(500).json({ error: "Failed to verify quota" });
        }

        if (!isAllowed) {
            return res.status(429).json({
                error: "Daily quota reached",
                message: "You have used your daily insights quota. Please upgrade or try again tomorrow.",
            });
        }

        const fmt = (n) =>
            new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

        const prompt = `
You are a brutally honest Indian financial advisor. No sugarcoating. Speak directly to the user.

The user's financial data:
- Monthly Income: ${fmt(data.monthlyIncome)}
- Monthly Expenses: ${fmt(metrics.totalExpenses)} (housing: ${fmt(data.expenses.housing)}, food: ${fmt(data.expenses.food)}, transport: ${fmt(data.expenses.transportation)}, utilities: ${fmt(data.expenses.utilities)}, insurance: ${fmt(data.expenses.insurance)}, entertainment: ${fmt(data.expenses.entertainment)}, healthcare: ${fmt(data.expenses.healthcare)}, education: ${fmt(data.expenses.education)}, other: ${fmt(data.expenses.other)})
- Assets: Bank Balance ${fmt(data.assets.bankBalance)}, Gold ${fmt(data.assets.gold)}, Mutual Funds ${fmt(data.assets.mutualFunds)}, Stocks ${fmt(data.assets.stocks)}, Real Estate ${fmt(data.assets.realEstate)}
- Liabilities: Home Loan ${fmt(data.liabilities.homeLoan)}, Personal Loan ${fmt(data.liabilities.personalLoan)}, Credit Card Debt ${fmt(data.liabilities.creditCardDebt)}, Other EMIs ${fmt(data.liabilities.others)}
- Risk Appetite: ${data.riskAppetite}

Calculated metrics:
- Health Score: ${metrics.healthScore}/100
- Net Worth: ${fmt(metrics.netWorth)}
- Savings Rate: ${metrics.savingsRate.toFixed(1)}%
- Debt-to-Income Ratio: ${metrics.debtToIncomeRatio.toFixed(1)}%
- Liquidity Ratio: ${metrics.liquidityRatio.toFixed(2)}
- Asset Diversification Score: ${metrics.assetDiversificationScore.toFixed(0)}/100

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "sections": [
    {
      "title": "Diagnosis",
      "emoji": "🩺",
      "bullet": "→",
      "bgColor": "bg-accent/20",
      "items": ["<2-3 direct, personalized sentences about overall financial health>"]
    },
    {
      "title": "Key Risks",
      "emoji": "⚠️",
      "bullet": "✕",
      "bgColor": "bg-danger/10",
      "items": ["<1-4 specific risks based on the data>"]
    },
    {
      "title": "Missed Opportunities",
      "emoji": "💡",
      "bullet": "★",
      "bgColor": "bg-secondary/30",
      "items": ["<1-3 actionable missed opportunities>"]
    },
    {
      "title": "Action Plan",
      "emoji": "🎯",
      "bullet": "→",
      "bgColor": "bg-accent/10",
      "items": ["<2-4 concrete numbered action items, most urgent first>"]
    }
  ],
  "warnings": ["<0-5 short, punchy warning strings for the warnings panel, or empty array if none>"]
}

Be specific — reference actual numbers from the data. Keep each item under 120 characters. No generic advice.
`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${LLM_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        responseMimeType: "application/json",
                    },
                }),
            }
        );

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error("Gemini API error:", geminiRes.status, errText);
            return res.status(502).json({ error: "Gemini API error", detail: errText });
        }

        const geminiData = await geminiRes.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) {
            return res.status(502).json({ error: "Empty response from Gemini" });
        }

        // Parse and validate JSON
        const parsed = JSON.parse(rawText);

        const finalPayload = { ...parsed, timestamp: Date.now() };

        // 3. Save to Supabase Cache via Backend
        const { error: insertError } = await supabase.from("ai_insights_cache").upsert({
            user_id: userId,
            data_hash: dataHash,
            insight_data: finalPayload,
            created_at: new Date().toISOString()
        });

        if (insertError) {
            console.error("Failed to save insights to Supabase cache", insertError);
        }

        return res.json(finalPayload);
    } catch (err) {
        console.error("Server error:", err);
        return res.status(500).json({ error: "Internal server error", detail: err.message });
    }
});

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", message: "WealthPilot backend is running 🚀" }));

app.listen(PORT, () => {
    console.log(`\n🚀 WealthPilot backend running on http://localhost:${PORT}`);
    console.log(`   API key: ${LLM_KEY.slice(0, 8)}${"*".repeat(LLM_KEY.length - 8)} (Gemini)`);
    console.log(`   POST http://localhost:${PORT}/api/insights\n`);
});
