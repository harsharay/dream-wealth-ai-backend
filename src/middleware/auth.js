import { supabase } from "../config/supabase.js";
import { logger } from "../utils/logger.js";

export const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid authorization header" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: "Invalid or expired token" });
        req.user = user;
        next();
    } catch (err) {
        logger.error("auth_failure", err);
        return res.status(401).json({ error: "Authentication failed" });
    }
};
