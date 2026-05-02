import express from "express";
import cors from "cors";
import { corsOptions } from "./config/cors.js";
import apiRoutes from "./routes/index.js";

const app = express();

app.use(cors(corsOptions));

// Payload Size Limitation (Cost & Memory Control)
app.use(express.json({ limit: "10kb" }));

app.use("/api", apiRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
