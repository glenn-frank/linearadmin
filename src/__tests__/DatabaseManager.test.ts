import { DatabaseManager } from "../modules/DatabaseManager";
import { Logger, LogLevel } from "../utils/logger";
import { LaravelForgeAppConfig } from "../modules/ConfigurationManager";

describe("DatabaseManager", () => {
  let manager: DatabaseManager;
  let mockConfig: LaravelForgeAppConfig;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger(LogLevel.ERROR, undefined, false);

    mockConfig = {
      appName: "test-app",
      description: "Test app",
      teamId: "team-123",
      databaseType: "forge-postgresql",
      features: ["auth", "profile"],
      deploymentTarget: "both",
      createNewProject: true,
      createNewTeam: false,
      teamOption: "existing",
      createForgeSite: false,
      useForgeStorage: true,
      forgeDatabaseName: "testdb",
      forgeStorageBucket: "test-bucket",
      projectDirectory: "/tmp/test",
      localDatabaseType: "postgresql",
      githubRepo: "https://github.com/test/repo",
      enableAIDependencies: false,
      startDevelopment: false,
      rerunExistingIssues: false,
    };

    manager = new DatabaseManager("/tmp/test-project", mockConfig, logger);
  });

  describe("Configuration", () => {
    it("should initialize with correct configuration", () => {
      expect(manager["config"]).toBe(mockConfig);
      expect(manager["projectPath"]).toBe("/tmp/test-project");
      expect(manager["logger"]).toBe(logger);
    });

    it("should use config values for database setup", () => {
      expect(manager["config"].databaseType).toBe("forge-postgresql");
      expect(manager["config"].forgeDatabaseName).toBe("testdb");
      expect(manager["config"].localDatabaseType).toBe("postgresql");
    });
  });

  describe("Environment File Generation", () => {
    it("should include correct database connection for PostgreSQL", () => {
      const envContent = manager["buildLocalEnvContent"]("test-key");

      expect(envContent).toContain("DB_CONNECTION=postgresql");
      expect(envContent).toContain("DB_PORT=5432");
      expect(envContent).toContain("DB_USERNAME=postgres");
    });

    it("should include correct database connection for MySQL", () => {
      mockConfig.localDatabaseType = "mysql";
      const updatedManager = new DatabaseManager(
        "/tmp/test-project",
        mockConfig,
        logger
      );

      const envContent = updatedManager["buildLocalEnvContent"]("test-key");

      expect(envContent).toContain("DB_CONNECTION=mysql");
      expect(envContent).toContain("DB_PORT=3306");
      expect(envContent).toContain("DB_USERNAME=root");
    });

    it("should include app name in environment files", () => {
      const envContent = manager["buildLocalEnvContent"]("test-key");

      expect(envContent).toContain('APP_NAME="test-app"');
      expect(envContent).toContain('VITE_APP_NAME="test-app"');
    });

    it("should use provided app key", () => {
      const appKey = "base64:test123key456";
      const envContent = manager["buildLocalEnvContent"](appKey);

      expect(envContent).toContain(`APP_KEY=${appKey}`);
    });
  });

  describe("Production Environment", () => {
    it("should generate production env with Forge placeholders", () => {
      const envContent = manager["buildProductionEnvContent"]("prod-key");

      expect(envContent).toContain("APP_ENV=production");
      expect(envContent).toContain("APP_DEBUG=false");
      expect(envContent).toContain("${FORGE_DB_HOST}");
      expect(envContent).toContain("${FORGE_DB_USERNAME}");
      expect(envContent).toContain("${FORGE_DB_PASSWORD}");
    });

    it("should use correct database type for Forge", () => {
      const envContent = manager["buildProductionEnvContent"]("prod-key");

      expect(envContent).toContain("DB_CONNECTION=pgsql");
      expect(envContent).toContain("DB_PORT=5432");
    });

    it("should use MySQL for forge-mysql type", () => {
      mockConfig.databaseType = "forge-mysql";
      const mysqlManager = new DatabaseManager(
        "/tmp/test-project",
        mockConfig,
        logger
      );

      const envContent = mysqlManager["buildProductionEnvContent"]("prod-key");

      expect(envContent).toContain("DB_CONNECTION=mysql");
      expect(envContent).toContain("DB_PORT=3306");
    });

    it("should include Forge storage configuration", () => {
      const envContent = manager["buildProductionEnvContent"]("prod-key");

      expect(envContent).toContain("FILESYSTEM_DISK=s3");
      expect(envContent).toContain("AWS_BUCKET=test-bucket");
      expect(envContent).toContain("${FORGE_STORAGE_KEY}");
      expect(envContent).toContain("${FORGE_STORAGE_SECRET}");
    });
  });

  describe("Deployment Script", () => {
    it("should generate deployment script with app name", () => {
      const script = manager["buildDeploymentScript"]();

      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("test-app");
      expect(script).toContain("composer install");
      expect(script).toContain("php artisan migrate");
      expect(script).toContain("npm run build");
    });

    it("should include all necessary deployment steps", () => {
      const script = manager["buildDeploymentScript"]();

      expect(script).toContain("cp .env.production .env");
      expect(script).toContain("php artisan key:generate");
      expect(script).toContain("php artisan config:cache");
      expect(script).toContain("php artisan route:cache");
      expect(script).toContain("php artisan view:cache");
    });
  });

  describe("App Key Generation", () => {
    it("should generate app key in correct format", () => {
      const appKey = manager["generateAppKey"]();

      expect(appKey).toMatch(/^base64:.+/);
      expect(appKey.length).toBeGreaterThan(10);
    });

    it("should generate unique keys", () => {
      const key1 = manager["generateAppKey"]();
      const key2 = manager["generateAppKey"]();

      expect(key1).not.toBe(key2);
    });
  });
});

