import * as fs from "fs";
import * as path from "path";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: any;
  stack?: string;
}

/**
 * Comprehensive logging utility with stack traces and context
 */
export class Logger {
  private logLevel: LogLevel;
  private logFile?: string;
  private enableConsole: boolean;

  constructor(
    logLevel: LogLevel = LogLevel.INFO,
    logFile?: string,
    enableConsole: boolean = true
  ) {
    this.logLevel = logLevel;
    this.logFile = logFile;
    this.enableConsole = enableConsole;

    // Ensure log directory exists if logFile is provided
    if (this.logFile) {
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  private formatEntry(entry: LogEntry): string {
    const { timestamp, level, message, context, stack } = entry;
    let formatted = `[${timestamp}] ${level}: ${message}`;

    if (context) {
      formatted += `\nContext: ${JSON.stringify(context, null, 2)}`;
    }

    if (stack) {
      formatted += `\nStack Trace:\n${stack}`;
    }

    return formatted;
  }

  private writeLog(entry: LogEntry): void {
    const formatted = this.formatEntry(entry);

    // Write to console if enabled
    if (this.enableConsole) {
      switch (entry.level) {
        case "ERROR":
          console.error(formatted);
          break;
        case "WARN":
          console.warn(formatted);
          break;
        case "INFO":
          console.info(formatted);
          break;
        case "DEBUG":
          console.debug(formatted);
          break;
      }
    }

    // Write to file if specified
    if (this.logFile) {
      fs.appendFileSync(this.logFile, formatted + "\n\n");
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  debug(message: string, context?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "DEBUG",
      message,
      context,
    });
  }

  info(message: string, context?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message,
      context,
    });
  }

  warn(message: string, context?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "WARN",
      message,
      context,
    });
  }

  error(message: string, error?: Error, context?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message,
      context: {
        ...context,
        errorMessage: error?.message,
        errorName: error?.name,
      },
      stack: error?.stack,
    });
  }

  /**
   * Log an operation with automatic error handling
   */
  async logOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    context?: any
  ): Promise<T> {
    this.info(`Starting operation: ${operationName}`, context);

    try {
      const result = await operation();
      this.info(`Completed operation: ${operationName}`, context);
      return result;
    } catch (error) {
      this.error(`Failed operation: ${operationName}`, error as Error, context);
      throw error;
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: any): ContextLogger {
    return new ContextLogger(this, additionalContext);
  }
}

/**
 * Context-aware logger that automatically includes context in all logs
 */
class ContextLogger {
  constructor(private parent: Logger, private context: any) {}

  debug(message: string, additionalContext?: any): void {
    this.parent.debug(message, { ...this.context, ...additionalContext });
  }

  info(message: string, additionalContext?: any): void {
    this.parent.info(message, { ...this.context, ...additionalContext });
  }

  warn(message: string, additionalContext?: any): void {
    this.parent.warn(message, { ...this.context, ...additionalContext });
  }

  error(message: string, error?: Error, additionalContext?: any): void {
    this.parent.error(message, error, {
      ...this.context,
      ...additionalContext,
    });
  }

  async logOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    additionalContext?: any
  ): Promise<T> {
    return this.parent.logOperation(operationName, operation, {
      ...this.context,
      ...additionalContext,
    });
  }
}

// Default logger instance
export const logger = new Logger(
  LogLevel.INFO,
  path.join(process.cwd(), "logs", "app.log"),
  true
);

