"use strict";
/**
 * Structured Logger for Firebase Cloud Functions
 * Outputs JSON logs compatible with Cloud Logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.debug = debug;
exports.info = info;
exports.warn = warn;
exports.error = error;
exports.createLogger = createLogger;
/**
 * Get current log level from environment
 */
function getLogLevel() {
    const level = process.env.LOG_LEVEL || 'INFO';
    return level;
}
/**
 * Check if log level should be output
 */
function shouldLog(level) {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentLevel = getLogLevel();
    return levels.indexOf(level) >= levels.indexOf(currentLevel);
}
/**
 * Format and output log entry
 */
function log(entry, level) {
    if (!shouldLog(level)) {
        return;
    }
    const logEntry = Object.assign({ timestamp: new Date().toISOString(), level, service: entry.service || 'unknown', operation: entry.operation || 'unknown', message: entry.message || '' }, entry);
    // Output as JSON for Cloud Logging
    console.log(JSON.stringify(logEntry));
}
/**
 * Debug level logging
 */
function debug(entry) {
    log(entry, 'DEBUG');
}
/**
 * Info level logging
 */
function info(entry) {
    log(entry, 'INFO');
}
/**
 * Warning level logging
 */
function warn(entry) {
    log(entry, 'WARN');
}
/**
 * Error level logging
 */
function error(entry) {
    log(entry, 'ERROR');
}
/**
 * Logger object with all methods
 */
exports.logger = {
    debug,
    info,
    warn,
    error
};
/**
 * Create a child logger with default context
 */
function createLogger(defaultContext) {
    return {
        debug: (entry) => debug(Object.assign(Object.assign({}, defaultContext), entry)),
        info: (entry) => info(Object.assign(Object.assign({}, defaultContext), entry)),
        warn: (entry) => warn(Object.assign(Object.assign({}, defaultContext), entry)),
        error: (entry) => error(Object.assign(Object.assign({}, defaultContext), entry))
    };
}
//# sourceMappingURL=logger.js.map