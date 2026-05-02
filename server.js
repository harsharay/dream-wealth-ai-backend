import { env } from "./src/config/env.js";
import { logger } from "./src/utils/logger.js";
import app from "./src/app.js";

logger.info("startup_init", { message: "Starting WealthPilot backend..." });

app.listen(env.PORT, () => {
    logger.info("server_listening", { port: env.PORT });
});
