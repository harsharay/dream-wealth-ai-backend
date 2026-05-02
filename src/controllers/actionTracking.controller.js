import { supabase } from "../config/supabase.js";
import { logger } from "../utils/logger.js";

export const createTracking = async (req, res) => {
    try {
        const { action_text, action_items, target_amount } = req.body;
        logger.info("simulator_track_request", {
            user_id: req.user.id,
            body: req.body,
            has_text: !!action_text,
            items_count: action_items?.length,
        });

        const { error } = await supabase.from("action_tracking").insert({
            user_id: req.user.id,
            action_text,
            action_items, // Stored as JSONB
            target_amount,
            progress: 0,
            status: "in_progress",
            start_date: new Date().toISOString(),
        });
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        logger.error("simulator_track_error", err, { user_id: req.user.id });
        res.status(500).json({ error: err.message });
    }
};

export const listTracking = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("action_tracking")
            .select("*")
            .eq("user_id", req.user.id)
            .order("start_date", { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updateTracking = async (req, res) => {
    try {
        const { progress, status, action_items } = req.body;
        const payload = { last_update: new Date().toISOString() };
        if (progress !== undefined) payload.progress = progress;
        if (status !== undefined) payload.status = status;
        if (action_items !== undefined) payload.action_items = action_items;

        const { error } = await supabase
            .from("action_tracking")
            .update(payload)
            .eq("id", req.params.id)
            .eq("user_id", req.user.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
