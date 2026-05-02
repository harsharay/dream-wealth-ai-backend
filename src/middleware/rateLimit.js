import rateLimit from "express-rate-limit";

export const verifyRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // Global proxy rate per user to prevent API flood. Business quotas are in DB.
    keyGenerator: (req) => req.user?.id || req.ip,
    handler: (req, res) => res.status(429).json({ error: "Too many proxy requests" }),
});
