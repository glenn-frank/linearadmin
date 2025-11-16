import { Logger } from "../utils/logger";
import { LaravelForgeAppConfig } from "./ConfigurationManager";

/**
 * Generic git provider interface
 */
export interface GitProvider {
  /** Provider name (github, gitlab, bitbucket) */
  name: string;
  /** Extract repository information from URL */
  extractRepoInfo(url: string): { owner: string; repo: string };
  /** Get remote URL for cloning */
  getRemoteUrl(owner: string, repo: string, protocol: "https" | "ssh"): string;
  /** Get web URL for repository */
  getWebUrl(owner: string, repo: string): string;
  /** Validate repository URL */
  isValidUrl(url: string): boolean;
}

/**
 * GitHub provider implementation
 */
class GitHubProvider implements GitProvider {
  name = "GitHub";

  extractRepoInfo(url: string): { owner: string; repo: string } {
    // Handles: https://github.com/owner/repo, git@github.com:owner/repo.git, owner/repo
    let cleanUrl = url;

    if (cleanUrl.includes("github.com/")) {
      cleanUrl = cleanUrl.split("github.com/")[1];
    } else if (cleanUrl.includes("github.com:")) {
      cleanUrl = cleanUrl.split("github.com:")[1];
    }

    cleanUrl = cleanUrl.replace(/\.git$/, "");

    const parts = cleanUrl.split("/");
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }

    throw new Error("Invalid GitHub URL format");
  }

  getRemoteUrl(owner: string, repo: string, protocol: "https" | "ssh"): string {
    if (protocol === "ssh") {
      return `git@github.com:${owner}/${repo}.git`;
    }
    return `https://github.com/${owner}/${repo}.git`;
  }

  getWebUrl(owner: string, repo: string): string {
    return `https://github.com/${owner}/${repo}`;
  }

  isValidUrl(url: string): boolean {
    return (
      url.includes("github.com") || /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(url)
    );
  }
}

/**
 * GitLab provider implementation
 */
class GitLabProvider implements GitProvider {
  name = "GitLab";

  extractRepoInfo(url: string): { owner: string; repo: string } {
    let cleanUrl = url;

    if (cleanUrl.includes("gitlab.com/")) {
      cleanUrl = cleanUrl.split("gitlab.com/")[1];
    } else if (cleanUrl.includes("gitlab.com:")) {
      cleanUrl = cleanUrl.split("gitlab.com:")[1];
    }

    cleanUrl = cleanUrl.replace(/\.git$/, "");

    const parts = cleanUrl.split("/");
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }

    throw new Error("Invalid GitLab URL format");
  }

  getRemoteUrl(owner: string, repo: string, protocol: "https" | "ssh"): string {
    if (protocol === "ssh") {
      return `git@gitlab.com:${owner}/${repo}.git`;
    }
    return `https://gitlab.com/${owner}/${repo}.git`;
  }

  getWebUrl(owner: string, repo: string): string {
    return `https://gitlab.com/${owner}/${repo}`;
  }

  isValidUrl(url: string): boolean {
    return url.includes("gitlab.com");
  }
}

/**
 * Bitbucket provider implementation
 */
class BitbucketProvider implements GitProvider {
  name = "Bitbucket";

  extractRepoInfo(url: string): { owner: string; repo: string } {
    let cleanUrl = url;

    if (cleanUrl.includes("bitbucket.org/")) {
      cleanUrl = cleanUrl.split("bitbucket.org/")[1];
    } else if (cleanUrl.includes("bitbucket.org:")) {
      cleanUrl = cleanUrl.split("bitbucket.org:")[1];
    }

    cleanUrl = cleanUrl.replace(/\.git$/, "");

    const parts = cleanUrl.split("/");
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }

    throw new Error("Invalid Bitbucket URL format");
  }

  getRemoteUrl(owner: string, repo: string, protocol: "https" | "ssh"): string {
    if (protocol === "ssh") {
      return `git@bitbucket.org:${owner}/${repo}.git`;
    }
    return `https://bitbucket.org/${owner}/${repo}.git`;
  }

  getWebUrl(owner: string, repo: string): string {
    return `https://bitbucket.org/${owner}/${repo}`;
  }

  isValidUrl(url: string): boolean {
    return url.includes("bitbucket.org");
  }
}

/**
 * Factory for creating git provider instances
 *
 * Automatically detects the git provider from URL and returns appropriate implementation.
 *
 * @example
 * ```typescript
 * const factory = new GitProviderFactory(logger);
 * const provider = factory.getProvider("https://github.com/user/repo");
 * const { owner, repo } = provider.extractRepoInfo(url);
 * ```
 */
export class GitProviderFactory {
  private logger: Logger;
  private providers: GitProvider[];

  constructor(logger: Logger) {
    this.logger = logger;
    this.providers = [
      new GitHubProvider(),
      new GitLabProvider(),
      new BitbucketProvider(),
    ];
  }

  /**
   * Get appropriate git provider for a URL
   *
   * @param url - Repository URL
   * @returns Matching git provider
   * @throws {Error} If no provider matches the URL
   */
  getProvider(url: string): GitProvider {
    for (const provider of this.providers) {
      if (provider.isValidUrl(url)) {
        this.logger.debug("Detected git provider", {
          url,
          provider: provider.name,
        });
        return provider;
      }
    }

    this.logger.error("No git provider found for URL", undefined, { url });
    throw new Error(`Unsupported git provider for URL: ${url}`);
  }

  /**
   * Get all supported providers
   *
   * @returns Array of provider names
   */
  getSupportedProviders(): string[] {
    return this.providers.map((p) => p.name);
  }

  /**
   * Check if a URL is supported
   *
   * @param url - Repository URL to check
   * @returns True if supported
   */
  isSupported(url: string): boolean {
    return this.providers.some((p) => p.isValidUrl(url));
  }

  /**
   * Register a custom git provider
   *
   * @param provider - Custom provider implementation
   */
  registerProvider(provider: GitProvider): void {
    this.providers.push(provider);
    this.logger.info("Registered custom git provider", {
      name: provider.name,
    });
  }
}

