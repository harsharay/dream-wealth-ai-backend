import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 3001;
const LLM_KEY = process.env.LLM_KEY;

if (!LLM_KEY) {
    console.error("❌ LLM_KEY is not set in .env — please add your Gemini API key.");
    process.exit(1);
}

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
        allowedHeaders: ["Content-Type"],
    })
);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20, // limit each IP
});

app.use("/api/", limiter);
app.use(express.json());

// ─── POST /api/insights ──────────────────────────────────────────────────────
// Body: { data: FinancialData, metrics: FinancialMetrics }
// Returns: { sections: InsightSection[] }
app.post("/api/insights", async (req, res) => {
    const { data, metrics } = req.body;

    if (!data || !metrics) {
        return res.status(400).json({ error: "Missing data or metrics in request body" });
    }

    const fmt = (n) =>
        new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

    const prompt = `
You are a brutally honest Indian financial advisor. No sugarcoating. Speak directly to the user.

The user's financial data:
- Monthly Income: ${fmt(data.monthlyIncome)}
- Monthly Expenses: ${fmt(metrics.totalExpenses)} (housing: ${fmt(data.expenses.housing)}, food: ${fmt(data.expenses.food)}, transport: ${fmt(data.expenses.transportation)}, utilities: ${fmt(data.expenses.utilities)}, insurance: ${fmt(data.expenses.insurance)}, entertainment: ${fmt(data.expenses.entertainment)}, healthcare: ${fmt(data.expenses.healthcare)}, education: ${fmt(data.expenses.education)}, other: ${fmt(data.expenses.other)})
- Assets: Bank Balance ${fmt(data.assets.bankBalance)}, Gold ${fmt(data.assets.gold)}, Mutual Funds ${fmt(data.assets.mutualFunds)}, Stocks ${fmt(data.assets.stocks)}, Real Estate ${fmt(data.assets.realEstate)}
- Liabilities: Home Loan ${fmt(data.liabilities.homeLoan)}, Personal Loan ${fmt(data.liabilities.personalLoan)}, Credit Card Debt ${fmt(data.liabilities.creditCardDebt)}, Other EMIs ${fmt(data.liabilities.otherEMIs)}
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

    try {
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
        if (!parsed.sections || !Array.isArray(parsed.sections)) {
            return res.status(502).json({ error: "Unexpected response shape from Gemini" });
        }

        return res.json({ ...parsed, timestamp: Date.now() });
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
