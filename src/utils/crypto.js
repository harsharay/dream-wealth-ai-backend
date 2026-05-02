import crypto from "crypto";
import { env } from "../config/env.js";

const KEY = Buffer.from(env.ENCRYPTION_KEY, "hex");

export const encryptData = (dataObj) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", KEY, iv);
    let encrypted = cipher.update(JSON.stringify(dataObj), "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
};

export const decryptData = (encryptedStr) => {
    const [ivHex, encryptedHex] = encryptedStr.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", KEY, iv);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
};

export const sha256 = (input) => crypto.createHash("sha256").update(input).digest("hex");
