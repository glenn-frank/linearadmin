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

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API_BASE = "https://api.github.com";

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN is required in .env file");
  process.exit(1);
}

const githubApi = axios.create({
  baseURL: GITHUB_API_BASE,
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
});

const server = new Server(
  {
    name: "github-admin",
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
      // Repository Management
      {
        name: "list_repos",
        description:
          "List all repositories for the authenticated user or organization",
        inputSchema: {
          type: "object",
          properties: {
            org: {
              type: "string",
              description:
                "Organization name (optional, defaults to user repos)",
            },
            type: {
              type: "string",
              description:
                "Filter by type: all, owner, public, private, member",
              enum: ["all", "owner", "public", "private", "member"],
              default: "all",
            },
          },
        },
      },
      {
        name: "create_repo",
        description: "Create a new GitHub repository",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Repository name",
            },
            description: {
              type: "string",
              description: "Repository description",
            },
            private: {
              type: "boolean",
              description: "Make repository private",
              default: true,
            },
            autoInit: {
              type: "boolean",
              description: "Initialize with README",
              default: true,
            },
          },
          required: ["name"],
        },
      },

      // Pull Request Management (Focus on Draft PR Workflow)
      {
        name: "list_draft_prs",
        description:
          "List all DRAFT pull requests. Perfect for reviewing PRs created by Cursor agents that need review before merging.",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "list_all_prs",
        description: "List all pull requests (open, closed, merged)",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            state: {
              type: "string",
              description: "Filter by state",
              enum: ["open", "closed", "all"],
              default: "open",
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "get_pr_details",
        description:
          "Get detailed information about a PR including files changed, CI status, and reviewability",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            prNumber: {
              type: "number",
              description: "Pull request number",
            },
          },
          required: ["owner", "repo", "prNumber"],
        },
      },
      {
        name: "mark_pr_ready",
        description:
          "Convert draft PR to ready for review. Use after reviewing/testing draft PRs.",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            prNumber: {
              type: "number",
              description: "Pull request number",
            },
          },
          required: ["owner", "repo", "prNumber"],
        },
      },
      {
        name: "approve_pr",
        description: "Approve a pull request after review",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            prNumber: {
              type: "number",
              description: "Pull request number",
            },
            comment: {
              type: "string",
              description: "Optional review comment",
            },
          },
          required: ["owner", "repo", "prNumber"],
        },
      },
      {
        name: "merge_pr",
        description: "Merge an approved pull request",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            prNumber: {
              type: "number",
              description: "Pull request number",
            },
            mergeMethod: {
              type: "string",
              description: "Merge method",
              enum: ["merge", "squash", "rebase"],
              default: "squash",
            },
          },
          required: ["owner", "repo", "prNumber"],
        },
      },
      {
        name: "get_pr_ci_status",
        description:
          "Get CI/Actions status for a PR. Check if tests passed before merging.",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            prNumber: {
              type: "number",
              description: "Pull request number",
            },
          },
          required: ["owner", "repo", "prNumber"],
        },
      },
      {
        name: "batch_review_draft_prs",
        description:
          "Get a summary of all draft PRs with their status, ready for batch review. Shows which ones are ready to approve/merge.",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
          },
          required: ["owner", "repo"],
        },
      },

      // Branch Management
      {
        name: "list_branches",
        description: "List all branches in a repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "delete_branch",
        description: "Delete a branch (useful after PR merge)",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            branch: {
              type: "string",
              description: "Branch name to delete",
            },
          },
          required: ["owner", "repo", "branch"],
        },
      },

      // Workflow/Actions
      {
        name: "list_workflow_runs",
        description: "List recent GitHub Actions workflow runs",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            status: {
              type: "string",
              description: "Filter by status",
              enum: ["success", "failure", "in_progress", "queued"],
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "trigger_workflow",
        description: "Trigger a GitHub Actions workflow (e.g., for deployment)",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            workflowId: {
              type: "string",
              description: "Workflow file name or ID (e.g., deploy.yml)",
            },
            ref: {
              type: "string",
              description: "Branch or tag to run workflow on",
              default: "main",
            },
          },
          required: ["owner", "repo", "workflowId"],
        },
      },

      // Issues
      {
        name: "create_github_issue",
        description: "Create a GitHub issue (different from Linear issues)",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            title: {
              type: "string",
              description: "Issue title",
            },
            body: {
              type: "string",
              description: "Issue description",
            },
            labels: {
              type: "array",
              items: { type: "string" },
              description: "Labels to add",
            },
          },
          required: ["owner", "repo", "title"],
        },
      },
      {
        name: "list_github_issues",
        description: "List GitHub issues in a repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            state: {
              type: "string",
              description: "Filter by state",
              enum: ["open", "closed", "all"],
              default: "open",
            },
          },
          required: ["owner", "repo"],
        },
      },

      // Commits
      {
        name: "list_commits",
        description: "List recent commits in a repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            branch: {
              type: "string",
              description: "Branch name",
              default: "main",
            },
            limit: {
              type: "number",
              description: "Number of commits to return",
              default: 10,
            },
          },
          required: ["owner", "repo"],
        },
      },

      // Releases
      {
        name: "create_release",
        description: "Create a GitHub release",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            tag: {
              type: "string",
              description: "Tag name (e.g., v1.0.0)",
            },
            name: {
              type: "string",
              description: "Release name",
            },
            body: {
              type: "string",
              description: "Release notes",
            },
          },
          required: ["owner", "repo", "tag"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_repos": {
        const { org, type = "all" } = args as any;

        const url = org ? `/orgs/${org}/repos` : "/user/repos";
        const response = await githubApi.get(url, {
          params: { type, per_page: 100 },
        });

        const repos = response.data.map((repo: any) => ({
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          description: repo.description,
          url: repo.html_url,
          defaultBranch: repo.default_branch,
          language: repo.language,
          stars: repo.stargazers_count,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  repos,
                  count: repos.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "create_repo": {
        const {
          name: repoName,
          description,
          private: isPrivate = true,
          autoInit = true,
        } = args as any;

        const response = await githubApi.post("/user/repos", {
          name: repoName,
          description,
          private: isPrivate,
          auto_init: autoInit,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  repo: {
                    name: response.data.name,
                    fullName: response.data.full_name,
                    url: response.data.html_url,
                    cloneUrl: response.data.clone_url,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "list_draft_prs": {
        const { owner, repo } = args as any;

        const response = await githubApi.get(`/repos/${owner}/${repo}/pulls`, {
          params: { state: "open" },
        });

        const draftPRs = response.data
          .filter((pr: any) => pr.draft)
          .map((pr: any) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user.login,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            branch: pr.head.ref,
            url: pr.html_url,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
          }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  draftPRs,
                  count: draftPRs.length,
                  message:
                    draftPRs.length > 0
                      ? `Found ${draftPRs.length} draft PR(s) ready for review`
                      : "No draft PRs found",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "list_all_prs": {
        const { owner, repo, state = "open" } = args as any;

        const response = await githubApi.get(`/repos/${owner}/${repo}/pulls`, {
          params: { state },
        });

        const prs = response.data.map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          draft: pr.draft,
          author: pr.user.login,
          createdAt: pr.created_at,
          branch: pr.head.ref,
          url: pr.html_url,
          mergeable: pr.mergeable,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  pullRequests: prs,
                  count: prs.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_pr_details": {
        const { owner, repo, prNumber } = args as any;

        const [prResponse, filesResponse, statusResponse] = await Promise.all([
          githubApi.get(`/repos/${owner}/${repo}/pulls/${prNumber}`),
          githubApi.get(`/repos/${owner}/${repo}/pulls/${prNumber}/files`),
          githubApi
            .get(`/repos/${owner}/${repo}/commits/${prNumber}/status`)
            .catch(() => null),
        ]);

        const pr = prResponse.data;
        const files = filesResponse.data;
        const status = statusResponse?.data;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  pr: {
                    number: pr.number,
                    title: pr.title,
                    body: pr.body,
                    state: pr.state,
                    draft: pr.draft,
                    mergeable: pr.mergeable,
                    author: pr.user.login,
                    createdAt: pr.created_at,
                    updatedAt: pr.updated_at,
                    additions: pr.additions,
                    deletions: pr.deletions,
                    changedFiles: pr.changed_files,
                    url: pr.html_url,
                  },
                  files: files.map((f: any) => ({
                    filename: f.filename,
                    status: f.status,
                    additions: f.additions,
                    deletions: f.deletions,
                    patch: f.patch?.substring(0, 500), // First 500 chars of diff
                  })),
                  ciStatus: status
                    ? {
                        state: status.state,
                        totalCount: status.total_count,
                        statuses: status.statuses.map((s: any) => ({
                          context: s.context,
                          state: s.state,
                          description: s.description,
                        })),
                      }
                    : null,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "mark_pr_ready": {
        const { owner, repo, prNumber } = args as any;

        await githubApi.post(
          `/repos/${owner}/${repo}/pulls/${prNumber}/convert-to-ready-for-review`,
          {},
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `PR #${prNumber} marked as ready for review`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "approve_pr": {
        const { owner, repo, prNumber, comment } = args as any;

        await githubApi.post(
          `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
          {
            event: "APPROVE",
            body: comment || "Approved via MCP",
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `PR #${prNumber} approved`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "merge_pr": {
        const { owner, repo, prNumber, mergeMethod = "squash" } = args as any;

        const response = await githubApi.put(
          `/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
          {
            merge_method: mergeMethod,
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  merged: response.data.merged,
                  sha: response.data.sha,
                  message: `PR #${prNumber} merged successfully`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_pr_ci_status": {
        const { owner, repo, prNumber } = args as any;

        // Get PR to get the head SHA
        const prResponse = await githubApi.get(
          `/repos/${owner}/${repo}/pulls/${prNumber}`,
        );
        const headSha = prResponse.data.head.sha;

        // Get check runs for this commit
        const checksResponse = await githubApi.get(
          `/repos/${owner}/${repo}/commits/${headSha}/check-runs`,
        );

        const checks = checksResponse.data.check_runs.map((check: any) => ({
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
          startedAt: check.started_at,
          completedAt: check.completed_at,
          url: check.html_url,
        }));

        const allPassed = checks.every(
          (c: any) => c.conclusion === "success" || c.conclusion === "skipped",
        );
        const anyFailed = checks.some((c: any) => c.conclusion === "failure");
        const inProgress = checks.some((c: any) => c.status === "in_progress");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  ciStatus: {
                    allPassed,
                    anyFailed,
                    inProgress,
                    summary: allPassed
                      ? "✅ All checks passed"
                      : anyFailed
                        ? "❌ Some checks failed"
                        : inProgress
                          ? "⏳ Checks in progress"
                          : "⚠️ No checks configured",
                  },
                  checks,
                  readyToMerge: allPassed && !anyFailed && !inProgress,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "batch_review_draft_prs": {
        const { owner, repo } = args as any;

        // Get all draft PRs
        const prsResponse = await githubApi.get(
          `/repos/${owner}/${repo}/pulls`,
          {
            params: { state: "open" },
          },
        );

        const draftPRs = prsResponse.data.filter((pr: any) => pr.draft);

        // Get CI status for each
        const prDetails = await Promise.all(
          draftPRs.map(async (pr: any) => {
            try {
              const checksResponse = await githubApi.get(
                `/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs`,
              );

              const checks = checksResponse.data.check_runs;
              const allPassed = checks.every(
                (c: any) =>
                  c.conclusion === "success" || c.conclusion === "skipped",
              );
              const anyFailed = checks.some(
                (c: any) => c.conclusion === "failure",
              );

              return {
                number: pr.number,
                title: pr.title,
                author: pr.user.login,
                branch: pr.head.ref,
                url: pr.html_url,
                additions: pr.additions,
                deletions: pr.deletions,
                changedFiles: pr.changed_files,
                ciPassed: allPassed,
                ciFailed: anyFailed,
                readyToMerge: allPassed && !anyFailed && pr.mergeable,
                recommendation: allPassed
                  ? "✅ Ready to approve and merge"
                  : anyFailed
                    ? "❌ Fix failing tests first"
                    : "⏳ Wait for CI to complete",
              };
            } catch (error) {
              return {
                number: pr.number,
                title: pr.title,
                author: pr.user.login,
                branch: pr.head.ref,
                url: pr.html_url,
                recommendation: "⚠️ CI status unavailable",
              };
            }
          }),
        );

        const readyToMerge = prDetails.filter((pr) => pr.readyToMerge);
        const needsFixes = prDetails.filter((pr) => pr.ciFailed);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  summary: {
                    totalDrafts: prDetails.length,
                    readyToMerge: readyToMerge.length,
                    needsFixes: needsFixes.length,
                  },
                  prDetails,
                  quickActions: {
                    readyToMerge: readyToMerge.map((pr) => ({
                      pr: pr.number,
                      action: `mark_pr_ready → approve_pr → merge_pr`,
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

      case "list_branches": {
        const { owner, repo } = args as any;

        const response = await githubApi.get(
          `/repos/${owner}/${repo}/branches`,
        );

        const branches = response.data.map((branch: any) => ({
          name: branch.name,
          protected: branch.protected,
          commitSha: branch.commit.sha,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  branches,
                  count: branches.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "delete_branch": {
        const { owner, repo, branch } = args as any;

        await githubApi.delete(
          `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Branch ${branch} deleted`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "list_workflow_runs": {
        const { owner, repo, status } = args as any;

        const response = await githubApi.get(
          `/repos/${owner}/${repo}/actions/runs`,
          {
            params: status ? { status } : {},
          },
        );

        const runs = response.data.workflow_runs.map((run: any) => ({
          id: run.id,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          branch: run.head_branch,
          event: run.event,
          createdAt: run.created_at,
          url: run.html_url,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  runs,
                  count: runs.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "trigger_workflow": {
        const { owner, repo, workflowId, ref = "main" } = args as any;

        await githubApi.post(
          `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
          {
            ref,
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Workflow ${workflowId} triggered on ${ref}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "create_github_issue": {
        const { owner, repo, title, body, labels = [] } = args as any;

        const response = await githubApi.post(
          `/repos/${owner}/${repo}/issues`,
          {
            title,
            body,
            labels,
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  issue: {
                    number: response.data.number,
                    title: response.data.title,
                    url: response.data.html_url,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "list_github_issues": {
        const { owner, repo, state = "open" } = args as any;

        const response = await githubApi.get(`/repos/${owner}/${repo}/issues`, {
          params: { state },
        });

        // Filter out PRs (GitHub returns PRs in issues endpoint)
        const issues = response.data
          .filter((issue: any) => !issue.pull_request)
          .map((issue: any) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            author: issue.user.login,
            labels: issue.labels.map((l: any) => l.name),
            url: issue.html_url,
          }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  issues,
                  count: issues.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "list_commits": {
        const { owner, repo, branch = "main", limit = 10 } = args as any;

        const response = await githubApi.get(
          `/repos/${owner}/${repo}/commits`,
          {
            params: { sha: branch, per_page: limit },
          },
        );

        const commits = response.data.map((commit: any) => ({
          sha: commit.sha.substring(0, 7),
          message: commit.commit.message,
          author: commit.commit.author.name,
          date: commit.commit.author.date,
          url: commit.html_url,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  commits,
                  count: commits.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "create_release": {
        const { owner, repo, tag, name, body } = args as any;

        const response = await githubApi.post(
          `/repos/${owner}/${repo}/releases`,
          {
            tag_name: tag,
            name: name || tag,
            body: body || "",
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  release: {
                    id: response.data.id,
                    name: response.data.name,
                    tag: response.data.tag_name,
                    url: response.data.html_url,
                  },
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
              details: error.response?.data,
              status: error.response?.status,
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
  console.error("GitHub Admin MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


