// Themes the questions should span. Keep short — every token counts.
const THEMES = [
    "liabilities",   // EMIs, home/car loans, parental medical
    "leaks",         // UPI impulse, subs, lifestyle inflation
    "insurance",     // term + health gap
    "investments",   // FD/LIC -> Equity/SIP migration
    "tax",           // 80C, 80D, NPS
    "goals",         // 5-yr Freedom, retirement, kids edu
    "safety",        // emergency fund, dependents
];

const askedThemes = (history = []) =>
    Array.from(new Set(history.map((h) => h?.theme).filter(Boolean)));

const askedQs = (history = []) =>
    history.map((h) => `- ${h.question} -> ${h.answer ?? "?"}`).join("\n");

export const buildSimulatorQuestionsPrompt = ({
    metrics,
    data,
    force_refresh,
    conversation_history = [],
    count = 3,
}) => {
    const used = askedThemes(conversation_history);
    const remainingThemes = THEMES.filter((t) => !used.includes(t));
    const history = conversation_history.length ? `\nAsked:\n${askedQs(conversation_history)}` : "";
    const refresh = force_refresh ? "\nUser wants fresh angles — avoid prior themes." : "";

    const themeList = (remainingThemes.length ? remainingThemes : THEMES).join(", ");

    return `Indian finance coach. Profile: NW=${metrics?.netWorth}, SR=${metrics?.savingsRate}%, Risk=${data?.riskAppetite}.${refresh}${history}

Generate exactly ${count} crisp questions (max 15 words each) across DIFFERENT themes from: ${themeList}.
One question per theme. No repeats. No deep follow-ups. Use Indian terms (Lakhs, EMI, SIP, FD, 80C).
Goal: gather breadth so we can recommend 3 action paths.

For each question also provide exactly 3 short suggested answers (max 7 words each) that cover the most common realistic responses an Indian user might give. These will be shown as quick-pick chips in the UI.

Return ONLY this JSON (use the exact key names "theme", "q", "options"):
{"questions":[{"theme":"liabilities","q":"Do you have an active home loan EMI?","options":["Yes, above ₹30k/month","Yes, below ₹30k/month","No home loan"]}]}`;
};
