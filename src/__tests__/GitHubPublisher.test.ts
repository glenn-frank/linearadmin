import { GitHubPublisher } from "../modules/GitHubPublisher";
import { Logger, LogLevel } from "../utils/logger";
import { LaravelForgeAppConfig } from "../modules/ConfigurationManager";

describe("GitHubPublisher", () => {
  let publisher: GitHubPublisher;
  let mockConfig: LaravelForgeAppConfig;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger(LogLevel.ERROR, undefined, false); // Suppress logs in tests

    mockConfig = {
      appName: "test-app",
      description: "Test app",
      teamId: "team-123",
      databaseType: "postgresql",
      features: ["auth"],
      deploymentTarget: "both",
      createNewProject: true,
      createNewTeam: false,
      teamOption: "existing",
      createForgeSite: false,
      useForgeStorage: false,
      projectDirectory: "/tmp/test",
      localDatabaseType: "postgresql",
      githubRepo: "https://github.com/testuser/testrepo",
      enableAIDependencies: false,
      startDevelopment: false,
      rerunExistingIssues: false,
    };

    publisher = new GitHubPublisher("/tmp/test-project", mockConfig, logger);
  });

  describe("extractRepoPath", () => {
    it("should extract repo path from HTTPS URL", () => {
      const result = publisher.extractRepoPath(
        "https://github.com/owner/repo.git"
      );
      expect(result).toBe("owner/repo");
    });

    it("should extract repo path from HTTPS URL without .git", () => {
      const result = publisher.extractRepoPath("https://github.com/owner/repo");
      expect(result).toBe("owner/repo");
    });

    it("should extract repo path from SSH URL", () => {
      const result = publisher.extractRepoPath("git@github.com:owner/repo.git");
      expect(result).toBe("owner/repo");
    });

    it("should handle simple owner/repo format", () => {
      const result = publisher.extractRepoPath("owner/repo");
      expect(result).toBe("owner/repo");
    });

    it("should return unknown-repo for invalid URLs", () => {
      const result = publisher.extractRepoPath("invalid-url");
      expect(result).toBe("unknown-repo");
    });

    it("should handle URLs with extra paths", () => {
      const result = publisher.extractRepoPath(
        "https://github.com/owner/repo/tree/main"
      );
      expect(result).toBe("owner/repo");
    });
  });

  describe("Configuration", () => {
    it("should store config correctly", () => {
      expect(publisher["config"]).toBe(mockConfig);
      expect(publisher["projectPath"]).toBe("/tmp/test-project");
      expect(publisher["logger"]).toBe(logger);
    });
  });
});

