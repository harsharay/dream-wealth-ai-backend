const fmt = (n) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const buildInsightsPrompt = (data, metrics) => `You are a brutally honest Indian financial advisor. Speak directly to the user.
Features: Monthly Income: ${fmt(data.monthlyIncome)} | Expenses: ${fmt(metrics.totalExpenses)} | Net Worth: ${fmt(metrics.netWorth)} | Savings Rate: ${metrics.savingsRate}%

Return ONLY a valid JSON object matching exactly:
{
  "sections": [
    { "title": "Diagnosis", "emoji": "🩺", "bullet": "→", "bgColor": "bg-accent/20", "items": ["<2-3 direct sentences>"] },
    { "title": "Key Risks", "emoji": "⚠️", "bullet": "✕", "bgColor": "bg-danger/10", "items": ["<1-4 risks>"] },
    { "title": "Action Plan", "emoji": "🎯", "bullet": "→", "bgColor": "bg-primary/20", "items": ["<2-3 actions>"] }
  ],
  "warnings": ["<0-3 short punchy warnings>"]
}`;
