const log = (level, event, extra = {}) => {
    const payload = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...extra });
    if (level === "error") console.error(payload);
    else if (level === "warn") console.warn(payload);
    else console.log(payload);
};

export const logger = {
    info: (event, data = {}) => log("info", event, data),
    error: (event, error, data = {}) => log("error", event, { error: error?.message || error, ...data }),
    warn: (event, data = {}) => log("warn", event, data),
};
