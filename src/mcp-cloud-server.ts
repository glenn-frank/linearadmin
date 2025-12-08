#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { LinearClient } from "@linear/sdk";
import axios from "axios";
import * as dotenv from "dotenv";
import express, { Request, Response } from "express";
import * as cors from "cors";

dotenv.config();

const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FORGE_API_KEY = process.env.FORGE_API_KEY;
const MCP_API_KEY = process.env.MCP_API_KEY; // For authenticating Cursor connections
const PORT = process.env.PORT || 3000;

const FORGE_API_BASE = "https://forge.laravel.com/api/v1";

// Validate required keys
if (!LINEAR_API_KEY) {
  console.error("❌ LINEAR_API_KEY is required");
  process.exit(1);
}

const linear = new LinearClient({ apiKey: LINEAR_API_KEY });

const forgeApi = FORGE_API_KEY
  ? axios.create({
      baseURL: FORGE_API_BASE,
      headers: {
        Authorization: `Bearer ${FORGE_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
  : null;

// Express app for HTTP/SSE transport
const app = express();
app.use((cors as any).default());
app.use(express.json());

// Store active transports by session
const transports: Map<string, SSEServerTransport> = new Map();

// Authentication middleware
function authenticate(req: Request, res: Response, next: () => void) {
  if (MCP_API_KEY) {
    const authHeader = req.headers.authorization;
    const apiKey = authHeader?.replace("Bearer ", "");

    if (apiKey !== MCP_API_KEY) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  next();
}

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "linear-forge-mcp",
    version: "1.0.0",
    tools: {
      linear: !!LINEAR_API_KEY,
      forge: !!FORGE_API_KEY,
      ai: !!OPENAI_API_KEY,
    },
  });
});

// SSE endpoint for Cursor to connect
app.get("/sse", authenticate, async (req: Request, res: Response) => {
  console.log("New SSE connection established");

  // Create MCP server instance for this connection
  const mcpServer = createMcpServer();

  // Create SSE transport
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = crypto.randomUUID();
  transports.set(sessionId, transport);

  // Set session ID in response header for client to use
  res.setHeader("X-Session-Id", sessionId);

  // Handle connection close
  res.on("close", () => {
    console.log(`SSE connection closed: ${sessionId}`);
    transports.delete(sessionId);
  });

  // Connect server to transport
  await mcpServer.connect(transport);
});

// Messages endpoint for client-to-server communication
app.post("/messages", authenticate, async (req: Request, res: Response) => {
  const sessionId = req.headers["x-session-id"] as string;
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(400).json({ error: "Invalid session" });
    return;
  }

  // Handle the incoming message
  try {
    await transport.handlePostMessage(req, res);
  } catch (error: any) {
    console.error("Error handling message:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create MCP server with all tools
function createMcpServer(): Server {
  const server = new Server(
    {
      name: "linear-forge-cloud",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      // === LINEAR TOOLS ===
      {
        name: "create_linear_issue",
        description: "Create a new issue in Linear",
        inputSchema: {
          type: "object",
          properties: {
            teamId: { type: "string", description: "Linear team ID" },
            title: { type: "string", description: "Issue title" },
            description: { type: "string", description: "Issue description" },
            priority: { type: "number", minimum: 0, maximum: 4 },
            labels: { type: "array", items: { type: "string" } },
            projectId: { type: "string" },
          },
          required: ["teamId", "title"],
        },
      },
      {
        name: "list_linear_teams",
        description: "List all Linear teams",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_team_issues",
        description: "Get issues for a team",
        inputSchema: {
          type: "object",
          properties: {
            teamId: { type: "string" },
            projectId: { type: "string" },
            limit: { type: "number", default: 50 },
          },
          required: ["teamId"],
        },
      },
      {
        name: "search_issues",
        description: "Search issues by query",
        inputSchema: {
          type: "object",
          properties: {
            teamId: { type: "string" },
            query: { type: "string" },
            labelNames: { type: "array", items: { type: "string" } },
            projectId: { type: "string" },
            stateType: { type: "string" },
            limit: { type: "number", default: 50 },
          },
          required: ["teamId"],
        },
      },
      {
        name: "get_issue_by_id",
        description: "Get issue details by ID",
        inputSchema: {
          type: "object",
          properties: { issueId: { type: "string" } },
          required: ["issueId"],
        },
      },
      {
        name: "update_issue",
        description: "Update an existing issue",
        inputSchema: {
          type: "object",
          properties: {
            issueId: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "number" },
            stateId: { type: "string" },
            labelIds: { type: "array", items: { type: "string" } },
            assigneeId: { type: "string" },
            projectId: { type: "string" },
          },
          required: ["issueId"],
        },
      },
      {
        name: "close_issue",
        description: "Close or complete an issue",
        inputSchema: {
          type: "object",
          properties: {
            issueId: { type: "string" },
            completed: { type: "boolean", default: true },
          },
          required: ["issueId"],
        },
      },
      {
        name: "add_issue_comment",
        description: "Add a comment to an issue",
        inputSchema: {
          type: "object",
          properties: {
            issueId: { type: "string" },
            body: { type: "string" },
          },
          required: ["issueId", "body"],
        },
      },
      {
        name: "check_issue_blockers",
        description: "Check if an issue has blockers",
        inputSchema: {
          type: "object",
          properties: { issueId: { type: "string" } },
          required: ["issueId"],
        },
      },
      {
        name: "get_next_available_issues",
        description: "Get unblocked issues ready to work on",
        inputSchema: {
          type: "object",
          properties: {
            teamId: { type: "string" },
            projectId: { type: "string" },
            limit: { type: "number", default: 20 },
          },
          required: ["teamId"],
        },
      },
      {
        name: "get_issue_dependencies",
        description: "Get dependency chain for an issue",
        inputSchema: {
          type: "object",
          properties: { issueId: { type: "string" } },
          required: ["issueId"],
        },
      },
      {
        name: "link_issues",
        description: "Create dependency between issues",
        inputSchema: {
          type: "object",
          properties: {
            issueId: { type: "string" },
            relatedIssueId: { type: "string" },
            relationshipType: {
              type: "string",
              enum: ["blocks", "related", "duplicate"],
            },
          },
          required: ["issueId", "relatedIssueId"],
        },
      },
      {
        name: "create_issues_with_dependencies",
        description: "Create multiple issues with dependencies",
        inputSchema: {
          type: "object",
          properties: {
            teamId: { type: "string" },
            projectId: { type: "string" },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "number" },
                  labels: { type: "array", items: { type: "string" } },
                  blockedBy: { type: "array", items: { type: "number" } },
                },
                required: ["title"],
              },
            },
          },
          required: ["teamId", "issues"],
        },
      },
      {
        name: "get_team_projects",
        description: "List projects for a team",
        inputSchema: {
          type: "object",
          properties: { teamId: { type: "string" } },
          required: ["teamId"],
        },
      },
      {
        name: "get_team_labels",
        description: "List labels for a team",
        inputSchema: {
          type: "object",
          properties: { teamId: { type: "string" } },
          required: ["teamId"],
        },
      },
    ];

    // Add Forge tools if API key is present
    if (forgeApi) {
      const forgeTools = [
        {
          name: "list_forge_servers",
          description: "List all Forge servers",
          inputSchema: { type: "object" as const, properties: {} },
        },
        {
          name: "list_server_sites",
          description: "List sites on a server",
          inputSchema: {
            type: "object" as const,
            properties: { serverId: { type: "string" } },
            required: ["serverId"],
          },
        },
        {
          name: "deploy_site",
          description: "Trigger site deployment",
          inputSchema: {
            type: "object" as const,
            properties: {
              serverId: { type: "string" },
              siteId: { type: "string" },
            },
            required: ["serverId", "siteId"],
          },
        },
        {
          name: "get_deployment_status",
          description: "Get deployment status",
          inputSchema: {
            type: "object" as const,
            properties: {
              serverId: { type: "string" },
              siteId: { type: "string" },
            },
            required: ["serverId", "siteId"],
          },
        },
        {
          name: "get_deployment_log",
          description: "Get deployment log",
          inputSchema: {
            type: "object" as const,
            properties: {
              serverId: { type: "string" },
              siteId: { type: "string" },
            },
            required: ["serverId", "siteId"],
          },
        },
        {
          name: "restart_nginx",
          description: "Restart Nginx",
          inputSchema: {
            type: "object" as const,
            properties: { serverId: { type: "string" } },
            required: ["serverId"],
          },
        },
        {
          name: "restart_php",
          description: "Restart PHP-FPM",
          inputSchema: {
            type: "object" as const,
            properties: {
              serverId: { type: "string" },
              version: { type: "string" },
            },
            required: ["serverId"],
          },
        },
      ];

      return { tools: [...tools, ...forgeTools] };
    }

    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // === LINEAR TOOL HANDLERS ===
      switch (name) {
        case "create_linear_issue": {
          const { teamId, title, description, priority = 2, labels = [], projectId } = args as any;

          const team = await linear.team(teamId);
          const repoLabel = `glenn-frank/${team.name.toLowerCase().replace(/\s+/g, "-")}`;
          const allLabels = [...labels, repoLabel];

          const labelIds: string[] = [];
          for (const labelName of allLabels) {
            const labelsQuery = await linear.issueLabels({
              filter: { name: { eq: labelName }, team: { id: { eq: teamId } } },
            });

            let labelId = labelsQuery.nodes[0]?.id;
            if (!labelId) {
              const newLabel = await linear.createIssueLabel({ name: labelName, teamId });
              const createdLabel = await newLabel.issueLabel;
              labelId = createdLabel?.id;
            }
            if (labelId) labelIds.push(labelId);
          }

          const issueData: any = { teamId, title, description, priority };
          if (labelIds.length > 0) issueData.labelIds = labelIds;
          if (projectId) issueData.projectId = projectId;

          const issuePayload = await linear.createIssue(issueData);
          const issueDetails = await issuePayload.issue;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                issueId: issueDetails?.id,
                issueNumber: issueDetails?.number,
                url: issueDetails?.url,
                title: issueDetails?.title || title,
              }, null, 2),
            }],
          };
        }

        case "list_linear_teams": {
          const teams = await linear.teams();
          const teamList = teams.nodes.map((t) => ({
            id: t.id,
            name: t.name,
            key: t.key,
          }));

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, teams: teamList, count: teamList.length }, null, 2),
            }],
          };
        }

        case "get_team_issues": {
          const { teamId, projectId, limit = 50 } = args as any;
          const filter: any = { team: { id: { eq: teamId } } };
          if (projectId) filter.project = { id: { eq: projectId } };

          const issues = await linear.issues({ filter, first: limit });
          const issueList = await Promise.all(
            issues.nodes.map(async (issue) => {
              const state = await issue.state;
              return {
                id: issue.id,
                number: issue.number,
                title: issue.title,
                priority: issue.priority,
                state: state?.name,
                url: issue.url,
              };
            })
          );

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, issues: issueList, count: issueList.length }, null, 2),
            }],
          };
        }

        case "search_issues": {
          const { teamId, query, labelNames, projectId, stateType, limit = 50 } = args as any;
          const filter: any = { team: { id: { eq: teamId } } };

          if (query) {
            filter.or = [
              { title: { containsIgnoreCase: query } },
              { description: { containsIgnoreCase: query } },
            ];
          }
          if (labelNames?.length > 0) filter.labels = { some: { name: { in: labelNames } } };
          if (projectId) filter.project = { id: { eq: projectId } };
          if (stateType) filter.state = { type: { eq: stateType } };

          const issues = await linear.issues({ filter, first: limit });
          const issueList = await Promise.all(
            issues.nodes.map(async (issue) => {
              const state = await issue.state;
              const labels = await issue.labels();
              return {
                id: issue.id,
                number: issue.number,
                title: issue.title,
                priority: issue.priority,
                state: state?.name,
                url: issue.url,
                labels: labels.nodes.map((l) => l.name),
              };
            })
          );

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, issues: issueList, count: issueList.length }, null, 2),
            }],
          };
        }

        case "get_issue_by_id": {
          const { issueId } = args as any;
          const issue = await linear.issue(issueId);
          const state = await issue.state;
          const labels = await issue.labels();
          const assignee = await issue.assignee;
          const project = await issue.project;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                issue: {
                  id: issue.id,
                  number: issue.number,
                  title: issue.title,
                  description: issue.description,
                  priority: issue.priority,
                  state: state?.name,
                  url: issue.url,
                  labels: labels.nodes.map((l) => l.name),
                  assignee: assignee?.name,
                  project: project?.name,
                },
              }, null, 2),
            }],
          };
        }

        case "update_issue": {
          const { issueId, ...updateData } = args as any;
          await linear.updateIssue(issueId, updateData);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, message: "Issue updated successfully" }, null, 2),
            }],
          };
        }

        case "close_issue": {
          const { issueId, completed = true } = args as any;
          const issue = await linear.issue(issueId);
          const team = await issue.team;
          const states = await team.states();

          const targetState = states.nodes.find((s) =>
            completed ? s.type === "completed" : s.type === "canceled"
          );

          if (!targetState) throw new Error(`No ${completed ? "completed" : "canceled"} state found`);
          await linear.updateIssue(issueId, { stateId: targetState.id });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Issue ${completed ? "completed" : "canceled"} successfully`,
              }, null, 2),
            }],
          };
        }

        case "add_issue_comment": {
          const { issueId, body } = args as any;
          const commentPayload = await linear.createComment({ issueId, body });
          const comment = await commentPayload.comment;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, commentId: comment?.id }, null, 2),
            }],
          };
        }

        case "check_issue_blockers": {
          const { issueId } = args as any;
          const issue = await linear.issue(issueId);
          const relations = await issue.relations();

          const blockers = [];
          let isBlocked = false;

          for (const relation of relations.nodes) {
            if (relation.type === "blocks") {
              const relatedIssue = await relation.relatedIssue;
              const relatedState = await relatedIssue.state;

              if (relatedState?.type !== "completed") {
                isBlocked = true;
                blockers.push({
                  id: relatedIssue.id,
                  number: relatedIssue.number,
                  title: relatedIssue.title,
                  state: relatedState?.name,
                  url: relatedIssue.url,
                });
              }
            }
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                isBlocked,
                canStart: !isBlocked,
                blockers,
                message: isBlocked
                  ? `⛔ Cannot start. Blocked by ${blockers.length} incomplete issue(s)`
                  : "✅ Ready to start - no blockers",
              }, null, 2),
            }],
          };
        }

        case "get_next_available_issues": {
          const { teamId, projectId, limit = 20 } = args as any;

          const filter: any = {
            team: { id: { eq: teamId } },
            state: { type: { nin: ["completed", "canceled"] } },
          };
          if (projectId) filter.project = { id: { eq: projectId } };

          const allIssues = await linear.issues({ filter, first: 100 });
          const availableIssues = [];

          for (const issue of allIssues.nodes) {
            const relations = await issue.relations();
            let isBlocked = false;

            for (const relation of relations.nodes) {
              if (relation.type === "blocks") {
                const relatedIssue = await relation.relatedIssue;
                const relatedState = await relatedIssue.state;
                if (relatedState?.type !== "completed") {
                  isBlocked = true;
                  break;
                }
              }
            }

            if (!isBlocked) {
              const state = await issue.state;
              const labels = await issue.labels();
              availableIssues.push({
                id: issue.id,
                number: issue.number,
                title: issue.title,
                priority: issue.priority,
                state: state?.name,
                url: issue.url,
                labels: labels.nodes.map((l) => l.name),
              });

              if (availableIssues.length >= limit) break;
            }
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                availableIssues,
                count: availableIssues.length,
                message: `Found ${availableIssues.length} issue(s) ready to start`,
              }, null, 2),
            }],
          };
        }

        case "get_issue_dependencies": {
          const { issueId } = args as any;
          const issue = await linear.issue(issueId);
          const relations = await issue.relations();

          const blockedBy = [];
          const blocks = [];

          for (const relation of relations.nodes) {
            const relatedIssue = await relation.relatedIssue;
            const relatedState = await relatedIssue.state;

            const issueInfo = {
              id: relatedIssue.id,
              number: relatedIssue.number,
              title: relatedIssue.title,
              state: relatedState?.name,
              stateType: relatedState?.type,
              url: relatedIssue.url,
            };

            if (relation.type === "blocks") blockedBy.push(issueInfo);
            else if (relation.type === "blockedBy") blocks.push(issueInfo);
          }

          const isBlocked = blockedBy.some(
            (b) => b.stateType !== "completed" && b.stateType !== "canceled"
          );

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                issue: { id: issue.id, number: issue.number, title: issue.title },
                blockedBy,
                blocks,
                isBlocked,
                canStart: !isBlocked,
              }, null, 2),
            }],
          };
        }

        case "link_issues": {
          const { issueId, relatedIssueId, relationshipType = "blocks" } = args as any;

          await linear.createIssueRelation({
            issueId,
            relatedIssueId,
            type: relationshipType,
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Created ${relationshipType} relationship`,
                relationship: { type: relationshipType, fromIssue: issueId, toIssue: relatedIssueId },
              }, null, 2),
            }],
          };
        }

        case "create_issues_with_dependencies": {
          const { teamId, projectId, issues } = args as any;

          const team = await linear.team(teamId);
          const repoLabel = `glenn-frank/${team.name.toLowerCase().replace(/\s+/g, "-")}`;

          const createdIssues: any[] = [];
          const issueIdByIndex: Record<number, string> = {};

          for (let idx = 0; idx < issues.length; idx++) {
            const issueData = issues[idx];
            const { title, description, priority = 2, labels = [] } = issueData;
            const allLabels = [...labels, repoLabel];

            const labelIds: string[] = [];
            for (const labelName of allLabels) {
              const labelsQuery = await linear.issueLabels({
                filter: { name: { eq: labelName }, team: { id: { eq: teamId } } },
              });

              let labelId = labelsQuery.nodes[0]?.id;
              if (!labelId) {
                const newLabel = await linear.createIssueLabel({ name: labelName, teamId });
                const createdLabel = await newLabel.issueLabel;
                labelId = createdLabel?.id;
              }
              if (labelId) labelIds.push(labelId);
            }

            const issuePayload: any = { teamId, title, description, priority };
            if (labelIds.length > 0) issuePayload.labelIds = labelIds;
            if (projectId) issuePayload.projectId = projectId;

            const issueResponse = await linear.createIssue(issuePayload);
            const createdIssue = await issueResponse.issue;

            if (!createdIssue) throw new Error(`Failed to create issue: ${title}`);

            issueIdByIndex[idx] = createdIssue.id;
            createdIssues.push({
              index: idx,
              id: createdIssue.id,
              number: createdIssue.number,
              title: createdIssue.title,
              url: createdIssue.url,
            });
          }

          // Create blocking relationships
          for (let idx = 0; idx < issues.length; idx++) {
            const issueData = issues[idx];
            if (issueData.blockedBy && Array.isArray(issueData.blockedBy)) {
              const currentIssueId = issueIdByIndex[idx];
              for (const blockerIndex of issueData.blockedBy) {
                const blockerIssueId = issueIdByIndex[blockerIndex];
                if (blockerIssueId) {
                  try {
                    await linear.createIssueRelation({
                      issueId: currentIssueId,
                      relatedIssueId: blockerIssueId,
                      type: "blocks" as any,
                    });
                  } catch (error) {
                    console.error(`Failed to create dependency: ${blockerIndex} blocks ${idx}`);
                  }
                }
              }
            }
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                created: createdIssues,
                count: createdIssues.length,
                message: `Created ${createdIssues.length} issue(s) with dependencies`,
              }, null, 2),
            }],
          };
        }

        case "get_team_projects": {
          const { teamId } = args as any;
          const team = await linear.team(teamId);
          const projects = await team.projects();

          const projectList = projects.nodes.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            state: p.state,
          }));

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, projects: projectList, count: projectList.length }, null, 2),
            }],
          };
        }

        case "get_team_labels": {
          const { teamId } = args as any;
          const labels = await linear.issueLabels({
            filter: { team: { id: { eq: teamId } } },
          });

          const labelList = labels.nodes.map((l) => ({
            id: l.id,
            name: l.name,
            color: l.color,
          }));

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, labels: labelList, count: labelList.length }, null, 2),
            }],
          };
        }

        // === FORGE TOOL HANDLERS ===
        case "list_forge_servers": {
          if (!forgeApi) throw new Error("Forge API not configured");

          const response = await forgeApi.get("/servers");
          const servers = response.data.servers.map((s: any) => ({
            id: s.id,
            name: s.name,
            ipAddress: s.ip_address,
            region: s.region,
            provider: s.provider,
            phpVersion: s.php_version,
          }));

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, servers, count: servers.length }, null, 2),
            }],
          };
        }

        case "list_server_sites": {
          if (!forgeApi) throw new Error("Forge API not configured");
          const { serverId } = args as any;

          const response = await forgeApi.get(`/servers/${serverId}/sites`);
          const sites = response.data.sites.map((s: any) => ({
            id: s.id,
            name: s.name,
            directory: s.directory,
            status: s.status,
            repository: s.repository,
            quickDeploy: s.quick_deploy,
          }));

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, sites, count: sites.length }, null, 2),
            }],
          };
        }

        case "deploy_site": {
          if (!forgeApi) throw new Error("Forge API not configured");
          const { serverId, siteId } = args as any;

          await forgeApi.post(`/servers/${serverId}/sites/${siteId}/deployment/deploy`);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, message: "Deployment triggered" }, null, 2),
            }],
          };
        }

        case "get_deployment_status": {
          if (!forgeApi) throw new Error("Forge API not configured");
          const { serverId, siteId } = args as any;

          const response = await forgeApi.get(`/servers/${serverId}/sites/${siteId}/deployment-history`);
          const latest = response.data.deployments[0];

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                deployment: {
                  id: latest?.id,
                  status: latest?.status,
                  startedAt: latest?.started_at,
                  endedAt: latest?.ended_at,
                  commitHash: latest?.commit_hash,
                  commitMessage: latest?.commit_message,
                },
              }, null, 2),
            }],
          };
        }

        case "get_deployment_log": {
          if (!forgeApi) throw new Error("Forge API not configured");
          const { serverId, siteId } = args as any;

          const response = await forgeApi.get(`/servers/${serverId}/sites/${siteId}/deployment/log`);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, log: response.data }, null, 2),
            }],
          };
        }

        case "restart_nginx": {
          if (!forgeApi) throw new Error("Forge API not configured");
          const { serverId } = args as any;

          await forgeApi.post(`/servers/${serverId}/nginx/restart`);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, message: "Nginx restart initiated" }, null, 2),
            }],
          };
        }

        case "restart_php": {
          if (!forgeApi) throw new Error("Forge API not configured");
          const { serverId, version = "php82" } = args as any;

          await forgeApi.post(`/servers/${serverId}/${version}/restart`);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: true, message: `${version} restart initiated` }, null, 2),
            }],
          };
        }

        default:
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: false, error: `Unknown tool: ${name}` }),
            }],
          };
      }
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack,
          }, null, 2),
        }],
        isError: true,
      };
    }
  });

  return server;
}

// Start HTTP server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🚀 MCP Cloud Server Running                                   ║
║═══════════════════════════════════════════════════════════════║
║  URL: http://localhost:${PORT}                                    ║
║  SSE Endpoint: /sse                                            ║
║  Messages Endpoint: /messages                                  ║
║  Health Check: /health                                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Connected Services:                                           ║
║  • Linear API: ${LINEAR_API_KEY ? "✅ Connected" : "❌ Not configured"}                           ║
║  • Forge API: ${FORGE_API_KEY ? " ✅ Connected" : " ❌ Not configured"}                           ║
║  • OpenAI API: ${OPENAI_API_KEY ? "✅ Connected" : "❌ Not configured"}                           ║
║  • Auth: ${MCP_API_KEY ? "     ✅ Enabled" : "     ⚠️  Disabled (open access)"}                       ║
╚═══════════════════════════════════════════════════════════════╝

Add to Cursor MCP settings (~/.cursor/mcp.json):

{
  "mcpServers": {
    "linear-forge-cloud": {
      "url": "https://mcp.on-forge.com/sse"${MCP_API_KEY ? `,
      "headers": {
        "Authorization": "Bearer ${MCP_API_KEY}"
      }` : ""}
    }
  }
}
`);
});
