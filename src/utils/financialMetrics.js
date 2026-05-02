const toNumber = (value) => (Number.isFinite(value) ? value : Number(value) || 0);
const AGE_RANGE_MEDIANS = {
    under_20: 19,
    "20_25": 22.5,
    "26_30": 28,
    "31_35": 33,
    "36_40": 38,
    "41_45": 43,
    "46_50": 48,
    "51_55": 53,
    "56_60": 58,
    above_60: 62,
};

export const calculateEmergencyBufferMonths = (financialData) => {
    if (!financialData) return 0;

    const assets = financialData.assets || {};
    const liabilities = financialData.liabilities || {};
    const expenses = financialData.expenses || {};

    // Formula: (Liquid Cash + Savings) / (Monthly Expenses + EMIs)
    const liquidCashAndSavings =
        toNumber(assets.bankBalance) +
        toNumber(assets.savings) +
        toNumber(assets.mutualFunds);

    const monthlyExpenses = Object.values(expenses).reduce((sum, val) => sum + toNumber(val), 0);
    const monthlyEmis =
        toNumber(liabilities.homeLoan) +
        toNumber(liabilities.personalLoan) +
        toNumber(liabilities.others);

    const denominator = monthlyExpenses + monthlyEmis;
    if (denominator <= 0) return 0;

    return liquidCashAndSavings / denominator;
};

export const calculateFinancialIndependenceMetrics = (financialData) => {
    if (!financialData || !financialData.ageRange || toNumber(financialData.targetRetirementCorpus) <= 0) {
        return {
            fiMetricAvailable: false,
            fiRatio: null,
            targetRetirementCorpus: null,
            investedAssets: null,
            estimatedRetirementAge: null,
        };
    }

    const assets = financialData.assets || {};
    const expenses = financialData.expenses || {};

    const investedAssets =
        toNumber(assets.mutualFunds) +
        toNumber(assets.stocks) +
        toNumber(assets.realEstate) +
        toNumber(assets.gold);

    const monthlyExpenses = Object.values(expenses).reduce((sum, val) => sum + toNumber(val), 0);
    const targetRetirementCorpus = toNumber(financialData.targetRetirementCorpus);
    const fiRatio = targetRetirementCorpus > 0 ? investedAssets / targetRetirementCorpus : 0;
    const currentAge = AGE_RANGE_MEDIANS[financialData.ageRange] ?? 30;

    const monthlySavings = Math.max(0, toNumber(financialData.monthlyIncome) - monthlyExpenses);
    const annualSavings = monthlySavings * 12;
    const remainingCorpus = Math.max(0, targetRetirementCorpus - investedAssets);
    const yearsToGoal = annualSavings > 0 ? Math.ceil(remainingCorpus / annualSavings) : null;
    let estimatedRetirementAge = yearsToGoal === null ? null : currentAge + yearsToGoal;
    if (estimatedRetirementAge !== null) {
        estimatedRetirementAge = Math.min(Math.max(estimatedRetirementAge, currentAge), 99);
    }

    return {
        fiMetricAvailable: true,
        fiRatio,
        targetRetirementCorpus,
        investedAssets,
        estimatedRetirementAge,
    };
};

export const calculateEmiStressRatio = (financialData) => {
    if (!financialData) return 0;

    const liabilities = financialData.liabilities || {};
    const monthlyEmis =
        toNumber(liabilities.homeLoan) +
        toNumber(liabilities.personalLoan) +
        toNumber(liabilities.others);
    const takeHomeIncome = toNumber(financialData.monthlyIncome);

    if (takeHomeIncome <= 0) return 0;
    return monthlyEmis / takeHomeIncome;
};

export const buildFinancialMetricsPayload = (financialData) => ({
    emergencyBufferMonths: calculateEmergencyBufferMonths(financialData),
    ...calculateFinancialIndependenceMetrics(financialData),
    emiStressRatio: calculateEmiStressRatio(financialData),
});
