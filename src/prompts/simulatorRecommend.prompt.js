export const buildSimulatorRecommendPrompt = ({ qna, metrics, data }) => {
    const qnaStr = qna.map((q) => `- ${q.question} -> ${q.answer}`).join("\n");
    return `Indian finance coach. Profile: NW=${metrics?.netWorth}, SR=${metrics?.savingsRate}%, Risk=${data?.riskAppetite}.

Answers:
${qnaStr}

Give EXACTLY 3 personalized 12-week action paths the user can pick from. Cover different fronts (don't repeat themes). Indian context: family, EMIs, gold/FD bias, insurance/emergency-fund gaps. No generic advice. Numbers in ₹, realistic for their profile.

Priority order if relevant: emergency fund > insurance > cashflow > SIP > debt. Skip areas they're already strong in.

Each path: short title; specific description; "Current: X -> Future: Y" vision; 3 impact bullets (tangible benefits); 3 action items each with impact 1-10; difficulty Easy|Medium|Hard; duration_weeks=12; target_amount in ₹.

Return ONLY JSON:
{"recommendations":[{"title":"","description":"","vision":"Current: X -> Future: Y","impact_bullets":["","",""],"difficulty":"Easy|Medium|Hard","duration_weeks":12,"target_amount":0,"action_items":[{"text":"","impact":1}]}]}`;
};
