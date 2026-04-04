/**
 * Structured Logger for Firebase Cloud Functions
 * Outputs JSON logs compatible with Cloud Logging
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;              // ISO 8601
  level: LogLevel;
  service: string;                // e.g., "claims-orchestrator"
  operation: string;              // e.g., "fraud-detection"
  claimId?: string;
  workerId?: string;
  payoutId?: string;
  triggerEventId?: string;
  message: string;
  error?: {
    message: string;
    stack?: string;
    code: string;
  };
  [key: string]: any;             // Allow arbitrary additional fields
}

/**
 * Get current log level from environment
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL || 'INFO';
  return level as LogLevel;
}

/**
 * Check if log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  const currentLevel = getLogLevel();
  return levels.indexOf(level) >= levels.indexOf(currentLevel);
}

/**
 * Format and output log entry
 */
function log(entry: Partial<LogEntry>, level: LogLevel): void {
  if (!shouldLog(level)) {
    return;
  }
  
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: entry.service || 'unknown',
    operation: entry.operation || 'unknown',
    message: entry.message || '',
    ...entry
  };
  
  // Output as JSON for Cloud Logging
  console.log(JSON.stringify(logEntry));
}

/**
 * Debug level logging
 */
export function debug(entry: Partial<LogEntry>): void {
  log(entry, 'DEBUG');
}

/**
 * Info level logging
 */
export function info(entry: Partial<LogEntry>): void {
  log(entry, 'INFO');
}

/**
 * Warning level logging
 */
export function warn(entry: Partial<LogEntry>): void {
  log(entry, 'WARN');
}

/**
 * Error level logging
 */
export function error(entry: Partial<LogEntry>): void {
  log(entry, 'ERROR');
}

/**
 * Logger object with all methods
 */
export const logger = {
  debug,
  info,
  warn,
  error
};

/**
 * Create a child logger with default context
 */
export function createLogger(defaultContext: Partial<LogEntry>) {
  return {
    debug: (entry: Partial<LogEntry>) => debug({ ...defaultContext, ...entry }),
    info: (entry: Partial<LogEntry>) => info({ ...defaultContext, ...entry }),
    warn: (entry: Partial<LogEntry>) => warn({ ...defaultContext, ...entry }),
    error: (entry: Partial<LogEntry>) => error({ ...defaultContext, ...entry })
  };
}
