import { supabase } from "../config/supabase.js";
import { logger } from "../utils/logger.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import { financialDataSchema } from "../schemas/financial.schema.js";

export const saveFinancialRecords = async (req, res) => {
    try {
        const validatedArgs = financialDataSchema.parse(req.body);
        const encryptedPayload = encryptData(validatedArgs);

        const { error } = await supabase.from("financial_records").upsert(
            {
                user_id: req.user.id,
                encrypted_payload: encryptedPayload,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        ); // Assuming user_id is PK or pseudo-PK usually

        if (error) throw error;
        logger.info("financial_records_saved", { user_id: req.user.id });
        res.json({ success: true });
    } catch (err) {
        logger.error("financial_records_error", err, { user_id: req.user.id });
        res.status(400).json({ error: err.issues || err.message });
    }
};

export const getFinancialRecords = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("financial_records")
            .select("encrypted_payload")
            .eq("user_id", req.user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== "PGRST116") throw error; // PGRST116 is 'not found'
        if (!data) return res.json(null);

        const decrypted = decryptData(data.encrypted_payload);
        res.json(decrypted);
    } catch (err) {
        logger.error("financial_records_fetch_error", err, { user_id: req.user.id });
        res.status(500).json({ error: "Failed to retrieve financial records" });
    }
};
