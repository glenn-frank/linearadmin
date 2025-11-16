import { Logger, LogLevel } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

describe("Logger", () => {
  let logger: Logger;
  let testLogFile: string;

  beforeEach(() => {
    testLogFile = path.join(__dirname, "test.log");
    // Clean up log file if it exists
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
    logger = new Logger(LogLevel.DEBUG, testLogFile, false); // Disable console for tests
  });

  afterEach(() => {
    // Clean up log file
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
  });

  describe("Log Levels", () => {
    it("should respect log level filtering - DEBUG level", () => {
      const debugLogger = new Logger(LogLevel.DEBUG, testLogFile, false);
      debugLogger.debug("Debug message");
      debugLogger.info("Info message");
      debugLogger.warn("Warn message");

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("DEBUG: Debug message");
      expect(logContent).toContain("INFO: Info message");
      expect(logContent).toContain("WARN: Warn message");
    });

    it("should respect log level filtering - INFO level", () => {
      const infoLogger = new Logger(LogLevel.INFO, testLogFile, false);
      infoLogger.debug("Debug message");
      infoLogger.info("Info message");
      infoLogger.warn("Warn message");

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).not.toContain("DEBUG");
      expect(logContent).toContain("INFO: Info message");
      expect(logContent).toContain("WARN: Warn message");
    });

    it("should respect log level filtering - ERROR level", () => {
      const errorLogger = new Logger(LogLevel.ERROR, testLogFile, false);
      errorLogger.debug("Debug message");
      errorLogger.info("Info message");
      errorLogger.warn("Warn message");
      errorLogger.error("Error message");

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).not.toContain("DEBUG");
      expect(logContent).not.toContain("INFO");
      expect(logContent).not.toContain("WARN");
      expect(logContent).toContain("ERROR: Error message");
    });
  });

  describe("Context Logging", () => {
    it("should include context in log entries", () => {
      logger.info("Test message", { user: "alice", action: "login" });

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("Test message");
      expect(logContent).toContain('"user": "alice"');
      expect(logContent).toContain('"action": "login"');
    });

    it("should handle complex context objects", () => {
      const context = {
        nested: {
          level: {
            deep: "value",
          },
        },
        array: [1, 2, 3],
      };

      logger.info("Complex context", context);

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("Complex context");
      expect(logContent).toContain('"deep": "value"');
      expect(logContent).toContain("[1, 2, 3]");
    });
  });

  describe("Error Logging", () => {
    it("should include error message and stack trace", () => {
      const error = new Error("Test error");
      logger.error("Operation failed", error, { operation: "test" });

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("ERROR: Operation failed");
      expect(logContent).toContain('"errorMessage": "Test error"');
      expect(logContent).toContain("Stack Trace:");
      expect(logContent).toContain('"operation": "test"');
    });

    it("should handle errors without stack trace", () => {
      const simpleError = { message: "Simple error" } as Error;
      logger.error("Simple failure", simpleError);

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("ERROR: Simple failure");
      expect(logContent).toContain('"errorMessage": "Simple error"');
    });
  });

  describe("logOperation", () => {
    it("should log successful operations", async () => {
      const operation = async () => {
        return "success";
      };

      const result = await logger.logOperation("Test operation", operation);

      expect(result).toBe("success");
      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("Starting operation: Test operation");
      expect(logContent).toContain("Completed operation: Test operation");
    });

    it("should log and rethrow errors in operations", async () => {
      const operation = async () => {
        throw new Error("Operation failed");
      };

      await expect(
        logger.logOperation("Failing operation", operation)
      ).rejects.toThrow("Operation failed");

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("Starting operation: Failing operation");
      expect(logContent).toContain("Failed operation: Failing operation");
      expect(logContent).toContain("Operation failed");
    });

    it("should include context in operation logs", async () => {
      const operation = async () => "done";
      const context = { userId: "123", action: "create" };

      await logger.logOperation("Contextual operation", operation, context);

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain('"userId": "123"');
      expect(logContent).toContain('"action": "create"');
    });
  });

  describe("Child Logger", () => {
    it("should create child logger with inherited context", () => {
      const childLogger = logger.child({ module: "auth", userId: "456" });
      childLogger.info("Child message");

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("Child message");
      expect(logContent).toContain('"module": "auth"');
      expect(logContent).toContain('"userId": "456"');
    });

    it("should merge additional context with inherited context", () => {
      const childLogger = logger.child({ module: "auth" });
      childLogger.info("Message", { action: "login" });

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain('"module": "auth"');
      expect(logContent).toContain('"action": "login"');
    });

    it("should handle child logger operations", async () => {
      const childLogger = logger.child({ module: "test" });
      const operation = async () => "result";

      await childLogger.logOperation("Child operation", operation);

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("Starting operation: Child operation");
      expect(logContent).toContain("Completed operation: Child operation");
      expect(logContent).toContain('"module": "test"');
    });
  });

  describe("Log File Creation", () => {
    it("should create log directory if it doesn't exist", () => {
      const nestedLogFile = path.join(__dirname, "nested", "dir", "test.log");
      const nestedDir = path.dirname(nestedLogFile);

      // Ensure directory doesn't exist
      if (fs.existsSync(nestedDir)) {
        fs.rmSync(nestedDir, { recursive: true, force: true });
      }

      const nestedLogger = new Logger(LogLevel.INFO, nestedLogFile, false);
      nestedLogger.info("Test message");

      expect(fs.existsSync(nestedLogFile)).toBe(true);

      // Cleanup
      fs.rmSync(nestedDir, { recursive: true, force: true });
    });

    it("should append to existing log file", () => {
      logger.info("First message");
      logger.info("Second message");

      const logContent = fs.readFileSync(testLogFile, "utf8");
      expect(logContent).toContain("First message");
      expect(logContent).toContain("Second message");
    });
  });

  describe("Timestamp Format", () => {
    it("should include ISO timestamp in logs", () => {
      logger.info("Timestamped message");

      const logContent = fs.readFileSync(testLogFile, "utf8");
      // Check for ISO format: [YYYY-MM-DDTHH:MM:SS.sssZ]
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

