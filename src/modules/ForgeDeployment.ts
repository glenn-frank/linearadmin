import axios from "axios";
import inquirer from "inquirer";
import { Logger } from "../utils/logger";
import { LaravelForgeAppConfig } from "./ConfigurationManager";

/**
 * Handles Laravel Forge site creation and deployment
 */
export class ForgeDeployment {
  private logger: Logger;
  private config: LaravelForgeAppConfig;
  private forgeApiBase = "https://forge.laravel.com/api/v1";

  constructor(config: LaravelForgeAppConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Create Laravel Forge site
   */
  async createForgeSite(): Promise<string | null> {
    this.logger.info("Creating Laravel Forge site");
    console.log("🚀 Creating Laravel Forge site...");

    if (!this.config.forgeApiKey) {
      this.logger.warn("No Forge API key provided");
      console.log("❌ No Forge API key found in environment variables");
      console.log("   Please add FORGE_API_KEY to your .env file");
      return null;
    }

    try {
      // Extract repository info
      const { username, repo } = this.extractRepoInfo(this.config.githubRepo);
      const repository = `${username}/${repo}`;

      this.logger.info("Creating Forge site", { repository });
      console.log(`📦 Repository: ${repository}`);

      const headers = {
        Authorization: `Bearer ${this.config.forgeApiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      // Get servers
      console.log("🔍 Fetching Forge servers...");
      const serversResponse = await axios.get(`${this.forgeApiBase}/servers`, {
        headers,
      });

      if (
        !serversResponse.data.servers ||
        serversResponse.data.servers.length === 0
      ) {
        throw new Error("No servers found in your Forge account");
      }

      // Let user select server
      const { selectedServer } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedServer",
          message: "Select Forge server:",
          choices: serversResponse.data.servers.map((server: any) => ({
            name: `${server.name} (${server.ip_address})`,
            value: server,
          })),
        },
      ]);

      const server = selectedServer;
      this.logger.info("Selected Forge server", {
        serverId: server.id,
        serverName: server.name,
      });
      console.log(`🖥️  Selected server: ${server.name} (${server.ip_address})`);

      // Create site
      console.log("🏗️  Creating Forge site...");
      const siteData = {
        domain: `${this.config.appName.toLowerCase()}.com`,
        project_type: "laravel",
        directory: "/public",
        repository: repository,
        branch: "main",
        composer: true,
        php_version: "php81",
        node: true,
        database:
          this.config.databaseType === "forge-postgresql"
            ? "postgresql"
            : "mysql",
        database_name:
          this.config.forgeDatabaseName || this.config.appName.toLowerCase(),
      };

      const siteResponse = await axios.post(
        `${this.forgeApiBase}/servers/${server.id}/sites`,
        siteData,
        { headers }
      );

      const site = siteResponse.data.site;
      this.logger.info("Created Forge site", {
        siteId: site.id,
        domain: siteData.domain,
      });

      console.log("✅ Forge site created successfully!");
      console.log(`🌐 Site URL: https://${siteData.domain}`);
      console.log(
        `🔗 Forge Dashboard: https://forge.laravel.com/servers/${server.id}/sites/${site.id}`
      );

      // Enable SSL
      await this.enableSSL(server.id, site.id, headers);

      // Deploy the site
      await this.deploySite(server.id, site.id, headers);

      console.log("");
      console.log("🎉 Laravel Forge site setup complete!");
      console.log(`📋 Next steps:`);
      console.log(`1. Wait for deployment to complete`);
      console.log(`2. Visit https://${siteData.domain}`);
      console.log(`3. Configure environment variables in Forge dashboard`);
      console.log(`4. Set up domain DNS if needed`);

      return site.id;
    } catch (error) {
      this.logger.error("Failed to create Forge site", error as Error);
      console.log("❌ Could not create Forge site:", error.message);
      console.log("   You can create it manually from the Forge dashboard");
      console.log("   Make sure your GitHub repository is accessible");
      return null;
    }
  }

  /**
   * Enable SSL certificate
   */
  private async enableSSL(
    serverId: string,
    siteId: string,
    headers: any
  ): Promise<void> {
    this.logger.info("Enabling SSL certificate", { serverId, siteId });
    console.log("🔒 Enabling SSL certificate...");

    try {
      const sslResponse = await axios.post(
        `${this.forgeApiBase}/servers/${serverId}/sites/${siteId}/ssl`,
        { type: "letsencrypt" },
        { headers }
      );

      if (sslResponse.status === 200 || sslResponse.status === 201) {
        this.logger.info("SSL certificate enabled");
        console.log("✅ SSL certificate enabled");
      } else {
        throw new Error("SSL setup failed");
      }
    } catch (error) {
      this.logger.warn("SSL certificate setup failed", error as Error);
      console.log(
        "⚠️  SSL certificate setup failed (you can enable it manually)"
      );
    }
  }

  /**
   * Deploy the site
   */
  private async deploySite(
    serverId: string,
    siteId: string,
    headers: any
  ): Promise<void> {
    this.logger.info("Deploying site", { serverId, siteId });
    console.log("🚀 Deploying site...");

    try {
      const deployResponse = await axios.post(
        `${this.forgeApiBase}/servers/${serverId}/sites/${siteId}/deploy`,
        {},
        { headers }
      );

      if (deployResponse.status === 200 || deployResponse.status === 201) {
        this.logger.info("Site deployment initiated");
        console.log("✅ Site deployment initiated");
      } else {
        throw new Error("Deployment failed");
      }
    } catch (error) {
      this.logger.warn("Deployment failed", error as Error);
      console.log(
        "⚠️  Deployment failed (you can deploy manually from Forge dashboard)"
      );
    }
  }

  /**
   * Extract username and repo from GitHub URL
   */
  private extractRepoInfo(githubUrl: string): {
    username: string;
    repo: string;
  } {
    const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);

    if (!urlMatch) {
      throw new Error("Invalid GitHub URL format for Forge integration");
    }

    const [, username, repoWithExt] = urlMatch;
    const repo = repoWithExt.replace(/\.git$/, "");

    return { username, repo };
  }
}

