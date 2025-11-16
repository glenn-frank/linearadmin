import {
  ConfigValidator,
  LaravelAppConfigSchema,
  isValidAppName,
  isValidDatabaseName,
  isValidBucketName,
  CONFIG_DEFAULTS,
} from "../schemas/ConfigValidation";

describe("ConfigValidation", () => {
  describe("LaravelAppConfigSchema", () => {
    it("should validate valid configuration", () => {
      const validConfig = {
        appName: "my-app",
        description: "A test application for validation",
        projectDirectory: "/home/user/projects",
        githubRepo: "https://github.com/user/repo",
        teamOption: "existing",
        teamId: "550e8400-e29b-41d4-a716-446655440000",
        createNewProject: true,
        deploymentTarget: "both",
        localDatabaseType: "postgresql",
        databaseType: "forge-postgresql",
        features: ["auth", "profile"],
        enableAIDependencies: true,
        startDevelopment: false,
        rerunExistingIssues: false,
        createForgeSite: false,
        useForgeStorage: false,
      };

      const result = ConfigValidator.safeValidateConfig(validConfig);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it("should reject invalid app name with uppercase", () => {
      const invalidConfig = {
        appName: "MyApp", // Uppercase not allowed
        description: "Test app",
        projectDirectory: "/tmp",
        githubRepo: "https://github.com/user/repo",
        teamOption: "existing",
        createNewProject: true,
        deploymentTarget: "local",
        localDatabaseType: "sqlite",
        features: ["auth"],
        enableAIDependencies: false,
        startDevelopment: false,
        rerunExistingIssues: false,
        createForgeSite: false,
        useForgeStorage: false,
      };

      const result = ConfigValidator.safeValidateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      const errorMessages = ConfigValidator.formatErrors(result.errors!);
      expect(errorMessages.some((msg) => msg.includes("appName"))).toBe(true);
    });

    it("should reject empty features array", () => {
      const invalidConfig = {
        appName: "test-app",
        description: "Test app description",
        projectDirectory: "/tmp",
        githubRepo: "https://github.com/user/repo",
        teamOption: "existing",
        createNewProject: true,
        deploymentTarget: "local",
        localDatabaseType: "sqlite",
        features: [], // Empty not allowed
        enableAIDependencies: false,
        startDevelopment: false,
        rerunExistingIssues: false,
        createForgeSite: false,
        useForgeStorage: false,
      };

      const result = ConfigValidator.safeValidateConfig(invalidConfig);

      expect(result.success).toBe(false);
      const errorMessages = ConfigValidator.formatErrors(result.errors!);
      expect(errorMessages.some((msg) => msg.includes("features"))).toBe(true);
    });

    it("should reject short description", () => {
      const invalidConfig = {
        appName: "test-app",
        description: "Short", // Too short
        projectDirectory: "/tmp",
        githubRepo: "https://github.com/user/repo",
        teamOption: "existing",
        createNewProject: true,
        deploymentTarget: "local",
        localDatabaseType: "sqlite",
        features: ["auth"],
        enableAIDependencies: false,
        startDevelopment: false,
        rerunExistingIssues: false,
        createForgeSite: false,
        useForgeStorage: false,
      };

      const result = ConfigValidator.safeValidateConfig(invalidConfig);

      expect(result.success).toBe(false);
      const errorMessages = ConfigValidator.formatErrors(result.errors!);
      expect(errorMessages.some((msg) => msg.includes("description"))).toBe(
        true
      );
    });

    it("should reject invalid GitHub URL", () => {
      const invalidConfig = {
        appName: "test-app",
        description: "Test application",
        projectDirectory: "/tmp",
        githubRepo: "not-a-github-url", // Invalid
        teamOption: "existing",
        createNewProject: true,
        deploymentTarget: "local",
        localDatabaseType: "sqlite",
        features: ["auth"],
        enableAIDependencies: false,
        startDevelopment: false,
        rerunExistingIssues: false,
        createForgeSite: false,
        useForgeStorage: false,
      };

      const result = ConfigValidator.safeValidateConfig(invalidConfig);

      expect(result.success).toBe(false);
      const errorMessages = ConfigValidator.formatErrors(result.errors!);
      expect(errorMessages.some((msg) => msg.includes("githubRepo"))).toBe(
        true
      );
    });

    it("should validate database name format", () => {
      const configWithInvalidDbName = {
        appName: "test-app",
        description: "Test application",
        projectDirectory: "/tmp",
        githubRepo: "https://github.com/user/repo",
        teamOption: "existing",
        createNewProject: true,
        deploymentTarget: "forge",
        localDatabaseType: "postgresql",
        databaseType: "forge-postgresql",
        forgeDatabaseName: "Invalid-Name!", // Invalid characters
        features: ["auth"],
        enableAIDependencies: false,
        startDevelopment: false,
        rerunExistingIssues: false,
        createForgeSite: false,
        useForgeStorage: false,
      };

      const result = ConfigValidator.safeValidateConfig(
        configWithInvalidDbName
      );

      expect(result.success).toBe(false);
      const errorMessages = ConfigValidator.formatErrors(result.errors!);
      expect(
        errorMessages.some((msg) => msg.includes("forgeDatabaseName"))
      ).toBe(true);
    });
  });

  describe("Type Guards", () => {
    describe("isValidAppName", () => {
      it("should accept valid app names", () => {
        expect(isValidAppName("my-app")).toBe(true);
        expect(isValidAppName("app123")).toBe(true);
        expect(isValidAppName("test-app-2024")).toBe(true);
      });

      it("should reject invalid app names", () => {
        expect(isValidAppName("MyApp")).toBe(false); // Uppercase
        expect(isValidAppName("my_app")).toBe(false); // Underscore
        expect(isValidAppName("my app")).toBe(false); // Space
        expect(isValidAppName("app!")).toBe(false); // Special char
        expect(isValidAppName("")).toBe(false); // Empty
        expect(isValidAppName("a".repeat(51))).toBe(false); // Too long
      });

      it("should reject non-string values", () => {
        expect(isValidAppName(123)).toBe(false);
        expect(isValidAppName(null)).toBe(false);
        expect(isValidAppName(undefined)).toBe(false);
        expect(isValidAppName({})).toBe(false);
      });
    });

    describe("isValidDatabaseName", () => {
      it("should accept valid database names", () => {
        expect(isValidDatabaseName("mydb")).toBe(true);
        expect(isValidDatabaseName("db_123")).toBe(true);
        expect(isValidDatabaseName("test_database_2024")).toBe(true);
      });

      it("should reject invalid database names", () => {
        expect(isValidDatabaseName("my-db")).toBe(false); // Hyphen
        expect(isValidDatabaseName("My_Db")).toBe(false); // Uppercase
        expect(isValidDatabaseName("db!")).toBe(false); // Special char
        expect(isValidDatabaseName("")).toBe(false); // Empty
        expect(isValidDatabaseName("a".repeat(65))).toBe(false); // Too long
      });
    });

    describe("isValidBucketName", () => {
      it("should accept valid bucket names", () => {
        expect(isValidBucketName("my-bucket")).toBe(true);
        expect(isValidBucketName("bucket123")).toBe(true);
        expect(isValidBucketName("test-bucket-2024")).toBe(true);
      });

      it("should reject invalid bucket names", () => {
        expect(isValidBucketName("ab")).toBe(false); // Too short
        expect(isValidBucketName("My-Bucket")).toBe(false); // Uppercase
        expect(isValidBucketName("bucket_name")).toBe(false); // Underscore
        expect(isValidBucketName("bucket!")).toBe(false); // Special char
        expect(isValidBucketName("a".repeat(64))).toBe(false); // Too long
      });
    });
  });

  describe("ConfigValidator", () => {
    describe("formatErrors", () => {
      it("should format Zod errors into readable messages", () => {
        const invalidConfig = {
          appName: "Invalid Name!", // Invalid
          description: "Short", // Too short
          features: [], // Empty
        };

        const result = LaravelAppConfigSchema.safeParse(invalidConfig);

        if (!result.success) {
          const messages = ConfigValidator.formatErrors(result.error);

          expect(messages.length).toBeGreaterThan(0);
          expect(messages.some((msg) => msg.includes("appName"))).toBe(true);
          expect(messages.some((msg) => msg.includes("description"))).toBe(
            true
          );
          expect(messages.some((msg) => msg.includes("features"))).toBe(true);
        }
      });
    });

    describe("validateConfig", () => {
      it("should throw on invalid configuration", () => {
        const invalidConfig = {
          appName: "", // Empty
        };

        expect(() => {
          ConfigValidator.validateConfig(invalidConfig);
        }).toThrow();
      });

      it("should return validated config on success", () => {
        const validConfig = {
          appName: "valid-app",
          description: "A valid test application",
          projectDirectory: "/home/user/projects",
          githubRepo: "https://github.com/user/repo",
          teamOption: "existing",
          createNewProject: true,
          deploymentTarget: "local",
          localDatabaseType: "sqlite",
          features: ["auth"],
          enableAIDependencies: false,
          startDevelopment: false,
          rerunExistingIssues: false,
          createForgeSite: false,
          useForgeStorage: false,
        };

        const result = ConfigValidator.validateConfig(validConfig);

        expect(result.appName).toBe("valid-app");
        expect(result.features).toContain("auth");
      });
    });
  });

  describe("CONFIG_DEFAULTS", () => {
    it("should have sensible default values", () => {
      expect(CONFIG_DEFAULTS.deploymentTarget).toBe("both");
      expect(CONFIG_DEFAULTS.localDatabaseType).toBe("postgresql");
      expect(CONFIG_DEFAULTS.enableAIDependencies).toBe(true);
      expect(CONFIG_DEFAULTS.features).toContain("auth");
      expect(CONFIG_DEFAULTS.features).toContain("profile");
      expect(CONFIG_DEFAULTS.features).toContain("dashboard");
    });

    it("should have at least one feature by default", () => {
      expect(CONFIG_DEFAULTS.features.length).toBeGreaterThan(0);
    });
  });
});

