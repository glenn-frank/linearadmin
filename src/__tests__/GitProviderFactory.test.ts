import { GitProviderFactory, GitProvider } from "../modules/GitProviderFactory";
import { Logger, LogLevel } from "../utils/logger";

describe("GitProviderFactory", () => {
  let factory: GitProviderFactory;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger(LogLevel.ERROR, undefined, false);
    factory = new GitProviderFactory(logger);
  });

  describe("getProvider", () => {
    it("should detect GitHub provider from HTTPS URL", () => {
      const provider = factory.getProvider("https://github.com/user/repo");
      expect(provider.name).toBe("GitHub");
    });

    it("should detect GitHub provider from SSH URL", () => {
      const provider = factory.getProvider("git@github.com:user/repo.git");
      expect(provider.name).toBe("GitHub");
    });

    it("should detect GitHub provider from simple format", () => {
      const provider = factory.getProvider("user/repo");
      expect(provider.name).toBe("GitHub");
    });

    it("should detect GitLab provider", () => {
      const provider = factory.getProvider("https://gitlab.com/user/repo");
      expect(provider.name).toBe("GitLab");
    });

    it("should detect Bitbucket provider", () => {
      const provider = factory.getProvider("https://bitbucket.org/user/repo");
      expect(provider.name).toBe("Bitbucket");
    });

    it("should throw error for unsupported provider", () => {
      expect(() => {
        factory.getProvider("https://unknown.com/user/repo");
      }).toThrow("Unsupported git provider");
    });
  });

  describe("GitHub Provider", () => {
    let github: GitProvider;

    beforeEach(() => {
      github = factory.getProvider("https://github.com/test/repo");
    });

    it("should extract repo info from HTTPS URL", () => {
      const { owner, repo } = github.extractRepoInfo(
        "https://github.com/owner/repository"
      );
      expect(owner).toBe("owner");
      expect(repo).toBe("repository");
    });

    it("should extract repo info from SSH URL", () => {
      const { owner, repo } = github.extractRepoInfo(
        "git@github.com:owner/repository.git"
      );
      expect(owner).toBe("owner");
      expect(repo).toBe("repository");
    });

    it("should extract repo info from simple format", () => {
      const { owner, repo } = github.extractRepoInfo("owner/repository");
      expect(owner).toBe("owner");
      expect(repo).toBe("repository");
    });

    it("should generate HTTPS remote URL", () => {
      const url = github.getRemoteUrl("owner", "repo", "https");
      expect(url).toBe("https://github.com/owner/repo.git");
    });

    it("should generate SSH remote URL", () => {
      const url = github.getRemoteUrl("owner", "repo", "ssh");
      expect(url).toBe("git@github.com:owner/repo.git");
    });

    it("should generate web URL", () => {
      const url = github.getWebUrl("owner", "repo");
      expect(url).toBe("https://github.com/owner/repo");
    });

    it("should validate GitHub URLs", () => {
      expect(github.isValidUrl("https://github.com/user/repo")).toBe(true);
      expect(github.isValidUrl("user/repo")).toBe(true);
      expect(github.isValidUrl("https://gitlab.com/user/repo")).toBe(false);
    });
  });

  describe("GitLab Provider", () => {
    let gitlab: GitProvider;

    beforeEach(() => {
      gitlab = factory.getProvider("https://gitlab.com/test/repo");
    });

    it("should extract repo info correctly", () => {
      const { owner, repo } = gitlab.extractRepoInfo(
        "https://gitlab.com/owner/repository"
      );
      expect(owner).toBe("owner");
      expect(repo).toBe("repository");
    });

    it("should generate HTTPS remote URL", () => {
      const url = gitlab.getRemoteUrl("owner", "repo", "https");
      expect(url).toBe("https://gitlab.com/owner/repo.git");
    });

    it("should generate SSH remote URL", () => {
      const url = gitlab.getRemoteUrl("owner", "repo", "ssh");
      expect(url).toBe("git@gitlab.com:owner/repo.git");
    });

    it("should validate GitLab URLs", () => {
      expect(gitlab.isValidUrl("https://gitlab.com/user/repo")).toBe(true);
      expect(gitlab.isValidUrl("https://github.com/user/repo")).toBe(false);
    });
  });

  describe("Bitbucket Provider", () => {
    let bitbucket: GitProvider;

    beforeEach(() => {
      bitbucket = factory.getProvider("https://bitbucket.org/test/repo");
    });

    it("should extract repo info correctly", () => {
      const { owner, repo } = bitbucket.extractRepoInfo(
        "https://bitbucket.org/owner/repository"
      );
      expect(owner).toBe("owner");
      expect(repo).toBe("repository");
    });

    it("should generate remote URLs correctly", () => {
      const httpsUrl = bitbucket.getRemoteUrl("owner", "repo", "https");
      expect(httpsUrl).toBe("https://bitbucket.org/owner/repo.git");

      const sshUrl = bitbucket.getRemoteUrl("owner", "repo", "ssh");
      expect(sshUrl).toBe("git@bitbucket.org:owner/repo.git");
    });
  });

  describe("Factory Methods", () => {
    it("should list all supported providers", () => {
      const providers = factory.getSupportedProviders();

      expect(providers).toContain("GitHub");
      expect(providers).toContain("GitLab");
      expect(providers).toContain("Bitbucket");
      expect(providers.length).toBe(3);
    });

    it("should check if URL is supported", () => {
      expect(factory.isSupported("https://github.com/user/repo")).toBe(true);
      expect(factory.isSupported("https://gitlab.com/user/repo")).toBe(true);
      expect(factory.isSupported("https://bitbucket.org/user/repo")).toBe(true);
      expect(factory.isSupported("https://unknown.com/user/repo")).toBe(false);
    });

    it("should allow registering custom providers", () => {
      const customProvider: GitProvider = {
        name: "CustomGit",
        extractRepoInfo: (url) => ({ owner: "custom", repo: "repo" }),
        getRemoteUrl: (owner, repo) => `https://custom.com/${owner}/${repo}`,
        getWebUrl: (owner, repo) => `https://custom.com/${owner}/${repo}`,
        isValidUrl: (url) => url.includes("custom.com"),
      };

      factory.registerProvider(customProvider);

      const providers = factory.getSupportedProviders();
      expect(providers).toContain("CustomGit");

      const provider = factory.getProvider("https://custom.com/user/repo");
      expect(provider.name).toBe("CustomGit");
    });
  });
});

