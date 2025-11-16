#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { LinearClient } from "@linear/sdk";
import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!LINEAR_API_KEY) {
  console.error("❌ LINEAR_API_KEY is required in .env file");
  process.exit(1);
}

const linear = new LinearClient({ apiKey: LINEAR_API_KEY });

const server = new Server(
  {
    name: "linear-admin",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_linear_issue",
        description:
          "Create a new issue in Linear. Returns the created issue ID and URL.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Linear team ID (e.g., from LINEAR_TEAM_ID env var)",
            },
            title: {
              type: "string",
              description: "Issue title",
            },
            description: {
              type: "string",
              description: "Issue description in markdown format",
            },
            priority: {
              type: "number",
              description:
                "Priority: 0=None, 1=Low, 2=Medium, 3=High, 4=Urgent",
              minimum: 0,
              maximum: 4,
            },
            labels: {
              type: "array",
              items: { type: "string" },
              description: "Array of label names to add to the issue",
            },
            projectId: {
              type: "string",
              description: "Optional project ID to assign the issue to",
            },
          },
          required: ["teamId", "title"],
        },
      },
      {
        name: "list_linear_teams",
        description:
          "List all available Linear teams. Returns team IDs, names, and keys.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_team_issues",
        description:
          "Get all issues for a specific team. Optionally filter by project.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Linear team ID",
            },
            projectId: {
              type: "string",
              description: "Optional: filter by project ID",
            },
            limit: {
              type: "number",
              description: "Maximum number of issues to return (default: 50)",
              default: 50,
            },
          },
          required: ["teamId"],
        },
      },
      {
        name: "create_bulk_issues",
        description:
          "Create multiple issues at once from an array of issue data. Useful for creating issues from requirements or analysis.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Linear team ID",
            },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "number", minimum: 0, maximum: 4 },
                  labels: { type: "array", items: { type: "string" } },
                },
                required: ["title"],
              },
              description: "Array of issues to create",
            },
          },
          required: ["teamId", "issues"],
        },
      },
      {
        name: "parse_requirements_to_issues",
        description:
          "Parse a requirements document and create structured Linear issues with AI. Returns created issue IDs.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Linear team ID",
            },
            requirementsText: {
              type: "string",
              description: "Requirements document text to parse",
            },
            projectId: {
              type: "string",
              description: "Optional: project ID to assign issues to",
            },
          },
          required: ["teamId", "requirementsText"],
        },
      },
      {
        name: "get_team_projects",
        description: "List all projects for a specific team.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Linear team ID",
            },
          },
          required: ["teamId"],
        },
      },
      {
        name: "get_team_labels",
        description: "List all labels for a specific team.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Linear team ID",
            },
          },
          required: ["teamId"],
        },
      },
      {
        name: "find_orphan_issues",
        description:
          "Find all issues in a team that are not assigned to any project.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Linear team ID",
            },
          },
          required: ["teamId"],
        },
      },
      {
        name: "update_issue",
        description:
          "Update an existing Linear issue. Can modify title, description, priority, state, labels, assignee, or project.",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description: "Linear issue ID to update",
            },
            title: {
              type: "string",
              description: "New title for the issue",
            },
            description: {
              type: "string",
              description: "New description for the issue",
            },
            priority: {
              type: "number",
              description: "New priority (0-4)",
              minimum: 0,
              maximum: 4,
            },
            stateId: {
              type: "string",
              description: "New state ID (e.g., for moving to In Progress)",
            },
            labelIds: {
              type: "array",
              items: { type: "string" },
              description: "Array of label IDs to set (replaces existing)",
            },
            assigneeId: {
              type: "string",
              description: "User ID to assign the issue to",
            },
            projectId: {
              type: "string",
              description: "Project ID to assign the issue to",
            },
          },
          required: ["issueId"],
        },
      },
      {
        name: "add_issue_comment",
        description: "Add a comment to an existing Linear issue.",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description: "Linear issue ID",
            },
            body: {
              type: "string",
              description: "Comment text (markdown supported)",
            },
          },
          required: ["issueId", "body"],
        },
      },
      {
        name: "get_issue_by_id",
        description:
          "Get detailed information about a specific Linear issue by its ID.",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description: "Linear issue ID",
            },
          },
          required: ["issueId"],
        },
      },
      {
        name: "search_issues",
        description:
          "Search for issues in a team by keyword, label, or other criteria.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Linear team ID",
            },
            query: {
              type: "string",
              description: "Search query (searches in title and description)",
            },
            labelNames: {
              type: "array",
              items: { type: "string" },
              description: "Filter by label names",
            },
            projectId: {
              type: "string",
              description: "Filter by project ID",
            },
            stateType: {
              type: "string",
              description:
                "Filter by state type: started, unstarted, completed, canceled",
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 50)",
              default: 50,
            },
          },
          required: ["teamId"],
        },
      },
      {
        name: "add_labels_to_issue",
        description: "Add labels to an existing issue (keeps existing labels).",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description: "Linear issue ID",
            },
            teamId: {
              type: "string",
              description: "Team ID (needed to find/create labels)",
            },
            labelNames: {
              type: "array",
              items: { type: "string" },
              description: "Array of label names to add",
            },
          },
          required: ["issueId", "teamId", "labelNames"],
        },
      },
      {
        name: "assign_issue",
        description: "Assign an issue to a team member.",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description: "Linear issue ID",
            },
            assigneeId: {
              type: "string",
              description: "User ID to assign to (or null to unassign)",
            },
          },
          required: ["issueId"],
        },
      },
      {
        name: "link_issues",
        description:
          "Create a dependency relationship between issues. Use 'blocks' when issueId must be completed BEFORE relatedIssueId can start. Use 'related' for non-blocking relationships. Use 'duplicate' to mark duplicates.",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description:
                "The issue ID that blocks or relates to another issue",
            },
            relatedIssueId: {
              type: "string",
              description: "The issue ID that is blocked or related",
            },
            relationshipType: {
              type: "string",
              description:
                "Relationship type:\n- 'blocks': issueId must be done BEFORE relatedIssueId\n- 'related': Issues are related but not blocking\n- 'duplicate': Issues are duplicates",
              enum: ["blocks", "related", "duplicate"],
              default: "blocks",
            },
          },
          required: ["issueId", "relatedIssueId"],
        },
      },
      {
        name: "close_issue",
        description:
          "Close or complete an issue (moves to completed/canceled state).",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description: "Linear issue ID",
            },
            completed: {
              type: "boolean",
              description:
                "True to mark as completed, false to mark as canceled (default: true)",
              default: true,
            },
          },
          required: ["issueId"],
        },
      },
      {
        name: "create_project",
        description: "Create a new project in Linear.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Team ID to create the project in",
            },
            name: {
              type: "string",
              description: "Project name",
            },
            description: {
              type: "string",
              description: "Project description",
            },
            state: {
              type: "string",
              description:
                "Project state: planned, started, completed, canceled",
              enum: ["planned", "started", "completed", "canceled"],
              default: "planned",
            },
          },
          required: ["teamId", "name"],
        },
      },
      {
        name: "check_issue_blockers",
        description:
          "ALWAYS use this before starting work on an issue. Checks if an issue has any blocking dependencies that must be completed first. Returns whether the issue is safe to start and lists all blockers.",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description: "Issue ID to check for blockers",
            },
          },
          required: ["issueId"],
        },
      },
      {
        name: "get_next_available_issues",
        description:
          "Get all issues that are ready to work on (have no incomplete blockers). Use this to find what work can be started immediately without dependency issues.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Team ID to search in",
            },
            projectId: {
              type: "string",
              description: "Optional: filter by specific project",
            },
            limit: {
              type: "number",
              description: "Maximum number of issues to return (default: 20)",
              default: 20,
            },
          },
          required: ["teamId"],
        },
      },
      {
        name: "get_issue_dependencies",
        description:
          "Get the complete dependency chain for an issue. Shows what must be completed before this issue, and what depends on this issue. Use this to understand the full context and order of work.",
        inputSchema: {
          type: "object",
          properties: {
            issueId: {
              type: "string",
              description: "Issue ID to get dependencies for",
            },
          },
          required: ["issueId"],
        },
      },
      {
        name: "create_issues_with_dependencies",
        description:
          "Create multiple issues and automatically set up their dependencies in the correct order. ALWAYS use this when creating related issues that must be done in sequence. Provide issues array where each issue can reference others by their index in the array.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: {
              type: "string",
              description: "Team ID",
            },
            projectId: {
              type: "string",
              description: "Optional: Project ID to assign all issues to",
            },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "number", minimum: 0, maximum: 4 },
                  labels: { type: "array", items: { type: "string" } },
                  blockedBy: {
                    type: "array",
                    items: { type: "number" },
                    description:
                      "Array of issue indexes from this array that must be completed first (0-based)",
                  },
                },
                required: ["title"],
              },
              description:
                "Array of issues. Use blockedBy to reference other issues by their array index.",
            },
          },
          required: ["teamId", "issues"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_linear_issue": {
        const {
          teamId,
          title,
          description,
          priority = 2,
          labels = [],
          projectId,
        } = args as any;

        // CRITICAL: Auto-add repo label (glenn-frank/team-name) to every issue
        const team = await linear.team(teamId);
        const repoLabel = `glenn-frank/${team.name.toLowerCase().replace(/\s+/g, "-")}`;

        // Combine user labels + repo label
        const allLabels = [...labels, repoLabel];

        const labelIds: string[] = [];
        for (const labelName of allLabels) {
          const labelsQuery = await linear.issueLabels({
            filter: {
              name: { eq: labelName },
              team: { id: { eq: teamId } },
            },
          });

          let labelId = labelsQuery.nodes[0]?.id;

          if (!labelId) {
            const newLabel = await linear.createIssueLabel({
              name: labelName,
              teamId: teamId,
            });
            labelId = newLabel.id;
          }

          if (labelId) {
            labelIds.push(labelId);
          }
        }

        const issueData: any = {
          teamId,
          title,
          description,
          priority,
        };

        if (labelIds.length > 0) {
          issueData.labelIds = labelIds;
        }

        if (projectId) {
          issueData.projectId = projectId;
        }

        const issuePayload = await linear.createIssue(issueData);

        if (!issuePayload.success) {
          throw new Error("Failed to create issue");
        }

        // Try to fetch the created issue details, with fallback
        let issueDetails;
        try {
          issueDetails = await issuePayload.issue;
        } catch (fetchError) {
          // If fetching fails, query for the issue directly
          const lastIssueId = (issuePayload as any).lastSyncId;
          if (lastIssueId) {
            issueDetails = await linear.issue(lastIssueId);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  issueId: issueDetails?.id,
                  issueNumber: issueDetails?.number,
                  url: issueDetails?.url,
                  title: issueDetails?.title || title,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "list_linear_teams": {
        const teams = await linear.teams();
        const teamList = teams.nodes.map((team) => ({
          id: team.id,
          name: team.name,
          key: team.key,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  teams: teamList,
                  count: teamList.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_team_issues": {
        const { teamId, projectId, limit = 50 } = args as any;

        const filter: any = {
          team: { id: { eq: teamId } },
        };

        if (projectId) {
          filter.project = { id: { eq: projectId } };
        }

        const issues = await linear.issues({ filter, first: limit });

        const issueList = issues.nodes.map((issue) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          state: issue.state?.name,
          url: issue.url,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  issues: issueList,
                  count: issueList.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "create_bulk_issues": {
        const { teamId, issues } = args as any;

        // CRITICAL: Auto-add repo label to all issues
        const team = await linear.team(teamId);
        const repoLabel = `glenn-frank/${team.name.toLowerCase().replace(/\s+/g, "-")}`;

        const createdIssues = [];

        for (const issueData of issues) {
          const { title, description, priority = 2, labels = [] } = issueData;

          // Add repo label to this issue's labels
          const allLabels = [...labels, repoLabel];

          const labelIds: string[] = [];
          for (const labelName of allLabels) {
            const labelsQuery = await linear.issueLabels({
              filter: {
                name: { eq: labelName },
                team: { id: { eq: teamId } },
              },
            });

            let labelId = labelsQuery.nodes[0]?.id;

            if (!labelId) {
              const newLabel = await linear.createIssueLabel({
                name: labelName,
                teamId: teamId,
              });
              labelId = newLabel.id;
            }

            if (labelId) {
              labelIds.push(labelId);
            }
          }

          const issuePayload = await linear.createIssue({
            teamId,
            title,
            description,
            priority,
            labelIds: labelIds.length > 0 ? labelIds : undefined,
          });

          if (!issuePayload.success) {
            console.error(`Failed to create issue: ${title}`);
            continue;
          }

          let issue;
          try {
            issue = await issuePayload.issue;
          } catch (fetchError) {
            const lastIssueId = (issuePayload as any).lastSyncId;
            if (lastIssueId) {
              issue = await linear.issue(lastIssueId);
            }
          }

          if (!issue) {
            console.error(`Failed to fetch created issue: ${title}`);
            continue;
          }

          createdIssues.push({
            id: issue.id,
            number: issue.number,
            title: issue.title,
            url: issue.url,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  created: createdIssues,
                  count: createdIssues.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "parse_requirements_to_issues": {
        if (!OPENAI_API_KEY) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    error: "OPENAI_API_KEY is required for AI-powered parsing",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const { teamId, requirementsText, projectId } = args as any;

        // CRITICAL: Auto-add repo label to all issues
        const team = await linear.team(teamId);
        const repoLabel = `glenn-frank/${team.name.toLowerCase().replace(/\s+/g, "-")}`;

        const prompt = `Parse this requirements document and extract actionable issues. Return a JSON array of issues with this structure:
[
  {
    "title": "Issue title",
    "description": "Detailed description",
    "priority": 2,
    "labels": ["feature", "backend"]
  }
]

Requirements:
${requirementsText}

Return ONLY the JSON array, no other text.`;

        const response = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a technical project manager that extracts actionable issues from requirements.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.2,
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          },
        );

        const aiResponse = response.data.choices?.[0]?.message?.content;
        const issues = JSON.parse(aiResponse);

        const createdIssues = [];

        for (const issueData of issues) {
          const { title, description, priority = 2, labels = [] } = issueData;

          // Add repo label to this issue's labels
          const allLabels = [...labels, repoLabel];

          const labelIds: string[] = [];
          for (const labelName of allLabels) {
            const labelsQuery = await linear.issueLabels({
              filter: {
                name: { eq: labelName },
                team: { id: { eq: teamId } },
              },
            });

            let labelId = labelsQuery.nodes[0]?.id;

            if (!labelId) {
              const newLabel = await linear.createIssueLabel({
                name: labelName,
                teamId: teamId,
              });
              labelId = newLabel.id;
            }

            if (labelId) {
              labelIds.push(labelId);
            }
          }

          const issuePayload: any = {
            teamId,
            title,
            description,
            priority,
          };

          if (labelIds.length > 0) {
            issuePayload.labelIds = labelIds;
          }

          if (projectId) {
            issuePayload.projectId = projectId;
          }

          const issueResponse = await linear.createIssue(issuePayload);

          if (!issueResponse.success) {
            console.error(`Failed to create issue: ${title}`);
            continue;
          }

          let issue;
          try {
            issue = await issueResponse.issue;
          } catch (fetchError) {
            const lastIssueId = (issueResponse as any).lastSyncId;
            if (lastIssueId) {
              issue = await linear.issue(lastIssueId);
            }
          }

          if (!issue) {
            console.error(`Failed to fetch created issue: ${title}`);
            continue;
          }

          createdIssues.push({
            id: issue.id,
            number: issue.number,
            title: issue.title,
            url: issue.url,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  created: createdIssues,
                  count: createdIssues.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_team_projects": {
        const { teamId } = args as any;

        const team = await linear.team(teamId);
        const projects = await team.projects();

        const projectList = projects.nodes.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          state: project.state,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  projects: projectList,
                  count: projectList.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_team_labels": {
        const { teamId } = args as any;

        const labels = await linear.issueLabels({
          filter: {
            team: { id: { eq: teamId } },
          },
        });

        const labelList = labels.nodes.map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  labels: labelList,
                  count: labelList.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "find_orphan_issues": {
        const { teamId } = args as any;

        const issues = await linear.issues({
          filter: {
            team: { id: { eq: teamId } },
            project: { null: true },
          },
          first: 100,
        });

        const orphanList = issues.nodes.map((issue) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          priority: issue.priority,
          url: issue.url,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  orphans: orphanList,
                  count: orphanList.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "update_issue": {
        const { issueId, ...updateData } = args as any;

        const issue = await linear.updateIssue(issueId, updateData);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Issue updated successfully",
                  issueId: issue.id,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "add_issue_comment": {
        const { issueId, body } = args as any;

        const comment = await linear.createComment({
          issueId,
          body,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Comment added successfully",
                  commentId: comment.id,
                },
                null,
                2,
              ),
            },
          ],
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
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
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
                    createdAt: issue.createdAt,
                    updatedAt: issue.updatedAt,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "search_issues": {
        const {
          teamId,
          query,
          labelNames,
          projectId,
          stateType,
          limit = 50,
        } = args as any;

        const filter: any = {
          team: { id: { eq: teamId } },
        };

        if (query) {
          filter.or = [
            { title: { containsIgnoreCase: query } },
            { description: { containsIgnoreCase: query } },
          ];
        }

        if (labelNames && labelNames.length > 0) {
          filter.labels = { some: { name: { in: labelNames } } };
        }

        if (projectId) {
          filter.project = { id: { eq: projectId } };
        }

        if (stateType) {
          filter.state = { type: { eq: stateType } };
        }

        const issues = await linear.issues({ filter, first: limit });

        const issueList = await Promise.all(
          issues.nodes.map(async (issue) => {
            const state = await issue.state;
            const labels = await issue.labels();
            return {
              id: issue.id,
              number: issue.number,
              title: issue.title,
              description: issue.description,
              priority: issue.priority,
              state: state?.name,
              url: issue.url,
              labels: labels.nodes.map((l) => l.name),
            };
          }),
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  issues: issueList,
                  count: issueList.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "add_labels_to_issue": {
        const { issueId, teamId, labelNames } = args as any;

        const issue = await linear.issue(issueId);
        const existingLabels = await issue.labels();
        const existingLabelIds = existingLabels.nodes.map((l) => l.id);

        const newLabelIds: string[] = [];

        for (const labelName of labelNames) {
          const labelsQuery = await linear.issueLabels({
            filter: {
              name: { eq: labelName },
              team: { id: { eq: teamId } },
            },
          });

          let labelId = labelsQuery.nodes[0]?.id;

          if (!labelId) {
            const newLabel = await linear.createIssueLabel({
              name: labelName,
              teamId: teamId,
            });
            labelId = newLabel.id;
          }

          if (labelId && !existingLabelIds.includes(labelId)) {
            newLabelIds.push(labelId);
          }
        }

        const allLabelIds = [...existingLabelIds, ...newLabelIds];

        await linear.updateIssue(issueId, { labelIds: allLabelIds });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Added ${newLabelIds.length} label(s) to issue`,
                  addedLabels: labelNames.filter(
                    (_, i) => i < newLabelIds.length,
                  ),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "assign_issue": {
        const { issueId, assigneeId } = args as any;

        await linear.updateIssue(issueId, { assigneeId });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: assigneeId
                    ? "Issue assigned successfully"
                    : "Issue unassigned successfully",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "link_issues": {
        const {
          issueId,
          relatedIssueId,
          relationshipType = "blocks",
        } = args as any;

        await linear.createIssueRelation({
          issueId,
          relatedIssueId,
          type: relationshipType,
        });

        const relationshipMessages: Record<string, string> = {
          blocks: `✅ Dependency created: Issue #${issueId} must be completed BEFORE issue #${relatedIssueId} can start`,
          related: `✅ Issues linked as related (no blocking)`,
          duplicate: `✅ Issues marked as duplicates`,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message:
                    relationshipMessages[relationshipType] ||
                    `Created ${relationshipType} relationship`,
                  relationship: {
                    type: relationshipType,
                    fromIssue: issueId,
                    toIssue: relatedIssueId,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "close_issue": {
        const { issueId, completed = true } = args as any;

        const issue = await linear.issue(issueId);
        const team = await issue.team;
        const states = await team.states();

        const targetState = states.nodes.find((s) =>
          completed ? s.type === "completed" : s.type === "canceled",
        );

        if (!targetState) {
          throw new Error(
            `No ${completed ? "completed" : "canceled"} state found`,
          );
        }

        await linear.updateIssue(issueId, { stateId: targetState.id });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Issue ${completed ? "completed" : "canceled"} successfully`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "create_project": {
        const { teamId, name, description, state = "planned" } = args as any;

        const project = await linear.createProject({
          teamIds: [teamId],
          name,
          description,
          state,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  project: {
                    id: project.id,
                    name: project.name,
                  },
                },
                null,
                2,
              ),
            },
          ],
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
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  isBlocked,
                  canStart: !isBlocked,
                  blockers,
                  message: isBlocked
                    ? `⛔ Cannot start. Blocked by ${blockers.length} incomplete issue(s)`
                    : "✅ Ready to start - no blockers",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_next_available_issues": {
        const { teamId, projectId, limit = 20 } = args as any;

        const filter: any = {
          team: { id: { eq: teamId } },
          state: { type: { nin: ["completed", "canceled"] } },
        };

        if (projectId) {
          filter.project = { id: { eq: projectId } };
        }

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
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  availableIssues,
                  count: availableIssues.length,
                  message: `Found ${availableIssues.length} issue(s) ready to start`,
                },
                null,
                2,
              ),
            },
          ],
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

          if (relation.type === "blocks") {
            blockedBy.push(issueInfo);
          } else if (relation.type === "blockedBy") {
            blocks.push(issueInfo);
          }
        }

        const isBlocked = blockedBy.some(
          (b) => b.stateType !== "completed" && b.stateType !== "canceled",
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  issue: {
                    id: issue.id,
                    number: issue.number,
                    title: issue.title,
                  },
                  blockedBy,
                  blocks,
                  isBlocked,
                  canStart: !isBlocked,
                  dependencyChain: {
                    mustCompleteBefore: blockedBy.map((b) => ({
                      number: b.number,
                      title: b.title,
                      state: b.state,
                    })),
                    thisWillUnblock: blocks.map((b) => ({
                      number: b.number,
                      title: b.title,
                      state: b.state,
                    })),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "create_issues_with_dependencies": {
        const { teamId, projectId, issues } = args as any;

        // CRITICAL: Auto-add repo label to all issues
        const team = await linear.team(teamId);
        const repoLabel = `glenn-frank/${team.name.toLowerCase().replace(/\s+/g, "-")}`;

        const createdIssues: any[] = [];
        const issueIdByIndex: Record<number, string> = {};

        for (let idx = 0; idx < issues.length; idx++) {
          const issueData = issues[idx];
          const { title, description, priority = 2, labels = [] } = issueData;

          // Add repo label to this issue's labels
          const allLabels = [...labels, repoLabel];

          const labelIds: string[] = [];
          for (const labelName of allLabels) {
            const labelsQuery = await linear.issueLabels({
              filter: {
                name: { eq: labelName },
                team: { id: { eq: teamId } },
              },
            });

            let labelId = labelsQuery.nodes[0]?.id;

            if (!labelId) {
              const newLabel = await linear.createIssueLabel({
                name: labelName,
                teamId: teamId,
              });
              labelId = newLabel.id;
            }

            if (labelId) {
              labelIds.push(labelId);
            }
          }

          const issuePayload: any = {
            teamId,
            title,
            description,
            priority,
          };

          if (labelIds.length > 0) {
            issuePayload.labelIds = labelIds;
          }

          if (projectId) {
            issuePayload.projectId = projectId;
          }

          const issueResponse = await linear.createIssue(issuePayload);
          const createdIssue = await issueResponse.issue;

          if (!createdIssue) {
            throw new Error(`Failed to create issue: ${title}`);
          }

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
                  // FIX: Swap parameters - Linear's API expects:
                  // issueId: the one that WILL BE blocked
                  // relatedIssueId: the one that DOES THE blocking
                  // type: "blocks" means relatedIssueId blocks issueId
                  await linear.createIssueRelation({
                    issueId: currentIssueId, // Issue being blocked
                    relatedIssueId: blockerIssueId, // Issue doing the blocking
                    type: "blocks",
                  });
                } catch (error) {
                  console.error(
                    `Failed to create dependency: ${blockerIndex} blocks ${idx}`,
                  );
                }
              }
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  created: createdIssues,
                  count: createdIssues.length,
                  message: `Created ${createdIssues.length} issue(s) with dependencies`,
                },
                null,
                2,
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
              stack: error.stack,
            },
            null,
            2,
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
  console.error("Linear Admin MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
