#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const FORGE_API_KEY = process.env.FORGE_API_KEY;
const FORGE_API_BASE = "https://forge.laravel.com/api/v1";

if (!FORGE_API_KEY) {
  console.error("❌ FORGE_API_KEY is required in .env file");
  process.exit(1);
}

const forgeApi = axios.create({
  baseURL: FORGE_API_BASE,
  headers: {
    Authorization: `Bearer ${FORGE_API_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const server = new Server(
  {
    name: "laravel-forge",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_forge_servers",
        description: "List all Laravel Forge servers in your account",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_server_sites",
        description: "List all sites on a specific server",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
          },
          required: ["serverId"],
        },
      },
      {
        name: "create_site",
        description: "Create a new site on a Forge server",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            domain: {
              type: "string",
              description: "Domain name for the site",
            },
            projectType: {
              type: "string",
              description: "Project type: php, html, symfony, laravel, nodejs",
              enum: ["php", "html", "symfony", "laravel", "nodejs"],
            },
            directory: {
              type: "string",
              description: "Web directory (default: /public for Laravel)",
              default: "/public",
            },
          },
          required: ["serverId", "domain", "projectType"],
        },
      },
      {
        name: "deploy_site",
        description: "Trigger deployment for a site",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
          },
          required: ["serverId", "siteId"],
        },
      },
      {
        name: "get_deployment_status",
        description: "Get the latest deployment status for a site",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
          },
          required: ["serverId", "siteId"],
        },
      },
      {
        name: "get_deployment_log",
        description: "Get deployment log output for a site",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
          },
          required: ["serverId", "siteId"],
        },
      },
      {
        name: "install_repository",
        description: "Install a Git repository on a site",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
            provider: {
              type: "string",
              description: "Git provider",
              enum: ["github", "gitlab", "bitbucket", "custom"],
              default: "github",
            },
            repository: {
              type: "string",
              description: "Repository in format: owner/repo",
            },
            branch: {
              type: "string",
              description: "Branch name (default: main)",
              default: "main",
            },
          },
          required: ["serverId", "siteId", "repository"],
        },
      },
      {
        name: "enable_quick_deploy",
        description: "Enable automatic deployment when code is pushed",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
          },
          required: ["serverId", "siteId"],
        },
      },
      {
        name: "get_site_ssl",
        description: "Get SSL certificate information for a site",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
          },
          required: ["serverId", "siteId"],
        },
      },
      {
        name: "install_letsencrypt_ssl",
        description: "Install Let's Encrypt SSL certificate",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
            domains: {
              type: "array",
              items: { type: "string" },
              description: "Array of domains for the certificate",
            },
          },
          required: ["serverId", "siteId", "domains"],
        },
      },
      {
        name: "restart_nginx",
        description: "Restart Nginx web server",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
          },
          required: ["serverId"],
        },
      },
      {
        name: "restart_php",
        description: "Restart PHP-FPM",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            version: {
              type: "string",
              description: "PHP version (e.g., php82, php81)",
              default: "php82",
            },
          },
          required: ["serverId"],
        },
      },
      {
        name: "get_site_env",
        description: "Get environment variables for a site",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
          },
          required: ["serverId", "siteId"],
        },
      },
      {
        name: "update_site_env",
        description: "Update environment variables for a site",
        inputSchema: {
          type: "object",
          properties: {
            serverId: {
              type: "string",
              description: "Forge server ID",
            },
            siteId: {
              type: "string",
              description: "Site ID",
            },
            env: {
              type: "string",
              description: "Environment variables content",
            },
          },
          required: ["serverId", "siteId", "env"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_forge_servers": {
        const response = await forgeApi.get("/servers");

        const servers = response.data.servers.map((server: any) => ({
          id: server.id,
          name: server.name,
          ipAddress: server.ip_address,
          region: server.region,
          provider: server.provider,
          size: server.size,
          phpVersion: server.php_version,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  servers,
                  count: servers.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_server_sites": {
        const { serverId } = args as any;

        const response = await forgeApi.get(`/servers/${serverId}/sites`);

        const sites = response.data.sites.map((site: any) => ({
          id: site.id,
          name: site.name,
          directory: site.directory,
          status: site.status,
          repository: site.repository,
          repositoryBranch: site.repository_branch,
          quickDeploy: site.quick_deploy,
          projectType: site.project_type,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  sites,
                  count: sites.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "create_site": {
        const {
          serverId,
          domain,
          projectType,
          directory = "/public",
        } = args as any;

        const response = await forgeApi.post(`/servers/${serverId}/sites`, {
          domain,
          project_type: projectType,
          directory,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  site: {
                    id: response.data.site.id,
                    name: response.data.site.name,
                    status: response.data.site.status,
                  },
                  message: `Site ${domain} created successfully`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "deploy_site": {
        const { serverId, siteId } = args as any;

        await forgeApi.post(
          `/servers/${serverId}/sites/${siteId}/deployment/deploy`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Deployment triggered successfully",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_deployment_status": {
        const { serverId, siteId } = args as any;

        const response = await forgeApi.get(
          `/servers/${serverId}/sites/${siteId}/deployment-history`
        );

        const latestDeployment = response.data.deployments[0];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  deployment: {
                    id: latestDeployment?.id,
                    status: latestDeployment?.status,
                    startedAt: latestDeployment?.started_at,
                    endedAt: latestDeployment?.ended_at,
                    commitHash: latestDeployment?.commit_hash,
                    commitMessage: latestDeployment?.commit_message,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_deployment_log": {
        const { serverId, siteId } = args as any;

        const response = await forgeApi.get(
          `/servers/${serverId}/sites/${siteId}/deployment/log`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  log: response.data,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "install_repository": {
        const {
          serverId,
          siteId,
          provider = "github",
          repository,
          branch = "main",
        } = args as any;

        await forgeApi.post(`/servers/${serverId}/sites/${siteId}/git`, {
          provider,
          repository,
          branch,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Repository ${repository} installed successfully`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "enable_quick_deploy": {
        const { serverId, siteId } = args as any;

        await forgeApi.post(`/servers/${serverId}/sites/${siteId}/deployment`);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Quick deploy enabled",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_site_ssl": {
        const { serverId, siteId } = args as any;

        const response = await forgeApi.get(
          `/servers/${serverId}/sites/${siteId}/certificates`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  certificates: response.data.certificates,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "install_letsencrypt_ssl": {
        const { serverId, siteId, domains } = args as any;

        await forgeApi.post(
          `/servers/${serverId}/sites/${siteId}/certificates/letsencrypt`,
          {
            domains,
          }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "SSL certificate installation started",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "restart_nginx": {
        const { serverId } = args as any;

        await forgeApi.post(`/servers/${serverId}/nginx/restart`);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Nginx restart initiated",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "restart_php": {
        const { serverId, version = "php82" } = args as any;

        await forgeApi.post(`/servers/${serverId}/${version}/restart`);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `${version} restart initiated`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_site_env": {
        const { serverId, siteId } = args as any;

        const response = await forgeApi.get(
          `/servers/${serverId}/sites/${siteId}/env`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  env: response.data,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "update_site_env": {
        const { serverId, siteId, env } = args as any;

        await forgeApi.put(`/servers/${serverId}/sites/${siteId}/env`, {
          content: env,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Environment variables updated",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
        };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: error.message,
              details: error.response?.data,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Laravel Forge MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});








