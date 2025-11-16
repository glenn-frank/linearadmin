import { LinearClient } from "@linear/sdk";
import { Logger } from "../utils/logger";
import { LaravelForgeAppConfig } from "./ConfigurationManager";

/**
 * Issue with dependencies for Linear project creation
 */
export interface IssueWithDependencies {
  title: string;
  description: string;
  priority: number;
  labels: string[];
  dependencies: string[];
  category: string;
  complexity: "low" | "medium" | "high";
  requirements?: string[];
  acceptanceCriteria?: string[];
  technicalNotes?: string;
}

/**
 * Handles Linear project and issue management
 */
export class LinearIntegration {
  private linear: LinearClient;
  private logger: Logger;
  private config: LaravelForgeAppConfig;
  private repoPath: string;

  constructor(
    linear: LinearClient,
    config: LaravelForgeAppConfig,
    repoPath: string,
    logger: Logger,
  ) {
    this.linear = linear;
    this.config = config;
    this.repoPath = repoPath;
    this.logger = logger;
  }

  /**
   * Create Linear project and issues
   * @returns Object with teamId, projectId, and created issue IDs
   */
  async createLinearProject(): Promise<{
    teamId: string;
    projectId: string;
    issueIds: string[];
    labelIds: string[];
  }> {
    this.logger.info("Creating Linear project and issues");
    console.log("📋 Creating Linear project and issues...");

    let teamId = this.config.teamId;
    let project;

    // Handle team creation or selection
    if (this.config.createNewTeam) {
      this.logger.info("Creating new Linear team", {
        teamName: this.config.newTeamName,
      });
      console.log(`🏗️  Creating new Linear team: ${this.config.newTeamName}`);
      const newTeam = await this.retryLinearCall(() =>
        this.linear.createTeam({
          name: this.config.newTeamName!,
          description: `Team for ${this.config.appName} development`,
        }),
      );
      teamId = newTeam.id;
      console.log(`✅ Created new Linear team: ${newTeam.name}`);
    } else {
      const team = await this.retryLinearCall(() => this.linear.team(teamId));
      console.log(`✅ Using existing Linear team: ${team.name}`);
    }

    // Create or use existing project
    if (
      this.config.createNewProject ||
      this.config.existingProjectId === "new"
    ) {
      project = await this.retryLinearCall(() =>
        this.linear.createProject({
          name: `${this.config.appName} - Development`,
          description: this.config.description,
          teamIds: [teamId],
          state: "planned",
        }),
      );
      this.logger.info("Created Linear project", { projectId: project.id });
      console.log(`✅ Created new Linear project: ${project.name}`);
    } else if (this.config.existingProjectId) {
      project = await this.retryLinearCall(() =>
        this.linear.project(this.config.existingProjectId),
      );
      console.log(`✅ Using existing Linear project: ${project.name}`);
    } else {
      throw new Error("No project selected");
    }

    // Print a quick project analysis (counts, orphans, ordering hints)
    await this.reportProjectsSummary(teamId);

    // Optional: auto-bucket orphan issues into version projects (V1, V1.1, V2)
    await this.bucketOrphansIntoVersionProjects(teamId);

    // Reassign any remaining orphans to the selected/created project
    await this.reassignOrphanIssues(teamId, project.id);

    // Create development issues
    // CRITICAL: Generate repo label from team name - agents use this to know which repo to work in
    // Format: glenn-frank/[team-name]
    const team = await this.retryLinearCall(() => this.linear.team(teamId));
    const repoLabel = `glenn-frank/${team.name.toLowerCase().replace(/\s+/g, "-")}`;

    console.log(`📁 Using repo label: ${repoLabel}`);

    const baseIssues: IssueWithDependencies[] = [
      {
        title: "Setup Development Environment",
        description:
          "Configure local development environment with Laravel backend and React frontend",
        priority: 1,
        labels: ["setup", "development", repoLabel],
        dependencies: [],
        category: "infrastructure",
        complexity: "low",
      },
      {
        title: "Setup Database Schema",
        description: "Create and run database migrations",
        priority: 2,
        labels: ["database", "backend", repoLabel],
        dependencies: [],
        category: "backend",
        complexity: "medium",
      },
      {
        title: "Implement Authentication System",
        description:
          "Create Sanctum-based authentication with login, registration, and password reset",
        priority: 3,
        labels: ["auth", "backend", "frontend", repoLabel],
        dependencies: [],
        category: "backend",
        complexity: "high",
      },
      {
        title: "Build Dashboard Page",
        description: "Create dashboard with basic stats and navigation",
        priority: 4,
        labels: ["frontend", "dashboard", repoLabel],
        dependencies: [],
        category: "frontend",
        complexity: "medium",
      },
      {
        title: "Implement Profile Management",
        description: "Add profile management with photo upload functionality",
        priority: 4,
        labels: ["profile", "upload", "frontend", repoLabel],
        dependencies: [],
        category: "frontend",
        complexity: "high",
      },
      {
        title: "Configure Build Pipeline",
        description: "Setup Vite build configuration and deployment pipeline",
        priority: 4,
        labels: ["build", "deployment", repoLabel],
        dependencies: [],
        category: "deployment",
        complexity: "medium",
      },
    ];

    // Apply intelligent dependency detection
    const issues = this.config.enableAIDependencies
      ? await this.detectDependenciesWithAI(baseIssues)
      : this.detectDependenciesWithRules(baseIssues);

    // Create issues
    const result = await this.createIssues(issues, teamId, project.id);

    // Create blocked-by relations
    await this.createIssueRelations(issues, result.titleToId);

    // If auto-start, move only the first unblocked issue to In Progress
    if (this.config.startDevelopment) {
      const first = this.selectFirstUnblockedIssue(issues);
      if (first) {
        const firstId = result.titleToId[first.title];
        try {
          await this.retryLinearCall(() =>
            this.linear.updateIssue(firstId, { state: "inProgress" }),
          );
        } catch (error) {
          this.logger.warn(
            "Failed to move first issue to In Progress",
            error as Error,
            { firstId },
          );
        }
      }
    }

    return {
      teamId,
      projectId: project.id,
      ...result,
    };
  }

  /**
   * Find issues in the team without a project and assign them to projectId
   */
  private async reassignOrphanIssues(teamId: string, projectId: string) {
    try {
      const orphanIssues = await this.retryLinearCall(() =>
        this.linear.issues({
          filter: { team: { id: { eq: teamId } }, project: { null: true } },
          first: 500,
        }),
      );

      if (orphanIssues.nodes.length === 0) return;

      console.log(
        `🔄 Reassigning ${orphanIssues.nodes.length} orphan issue(s) to selected project...`,
      );

      for (const issue of orphanIssues.nodes) {
        try {
          await this.retryLinearCall(() =>
            this.linear.updateIssue(issue.id, { projectId }),
          );
          this.logger.info("Reassigned orphan issue", {
            issueId: issue.id,
            title: issue.title,
            projectId,
          });
        } catch (error) {
          this.logger.warn("Failed to reassign orphan issue", error as Error, {
            issueId: issue.id,
          });
        }
      }

      console.log("✅ Orphan issue reassignment complete");
    } catch (error) {
      this.logger.warn("Could not scan/reassign orphan issues", error as Error);
    }
  }

  /**
   * Report existing projects with issue counts and surface orphan issues
   */
  private async reportProjectsSummary(teamId: string): Promise<void> {
    try {
      const team = await this.retryLinearCall(() => this.linear.team(teamId));
      const projects = await this.retryLinearCall(() => team.projects());

      console.log("\n📊 Current team projects and issue counts:");
      if (projects.nodes.length === 0) {
        console.log("  (no projects)");
      }

      for (const p of projects.nodes) {
        const issues = await this.retryLinearCall(() =>
          this.linear.issues({
            filter: { project: { id: { eq: p.id } } },
            first: 200,
          }),
        );
        console.log(`  - ${p.name}: ${issues.nodes.length} issue(s)`);
      }

      const orphan = await this.retryLinearCall(() =>
        this.linear.issues({
          filter: { team: { id: { eq: teamId } }, project: { null: true } },
          first: 200,
        }),
      );
      console.log(`\n🧭 Orphan issues (no project): ${orphan.nodes.length}`);
      if (orphan.nodes.length > 0) {
        console.log(
          "  → Suggest creating/choosing a project to collect these before starting.",
        );
        const sample = orphan.nodes.slice(0, 5).map((i: any) => i.title);
        if (sample.length) console.log("  • Sample:", sample.join(" | "));
      }

      console.log("");
    } catch (error) {
      this.logger.warn("Project summary failed", error as Error);
    }
  }

  /**
   * Create version-based projects (V1, V1.1, V2...) and move orphan issues into them
   * Version is detected from an issue label matching /^v\d(\.\d+)?$/i. Others land in "Unassigned (to triage)".
   */
  private async bucketOrphansIntoVersionProjects(
    teamId: string,
  ): Promise<void> {
    try {
      // Fetch orphan issues (no project)
      const orphan = await this.retryLinearCall(() =>
        this.linear.issues({
          filter: { team: { id: { eq: teamId } }, project: { null: true } },
          first: 200,
        }),
      );
      if (orphan.nodes.length === 0) return;

      // Ensure a map of existing projects by name
      const team = await this.retryLinearCall(() => this.linear.team(teamId));
      const existingProjects = await this.retryLinearCall(() =>
        team.projects(),
      );
      const nameToProjectId = new Map<string, string>();
      existingProjects.nodes.forEach((p: any) =>
        nameToProjectId.set(p.name, p.id),
      );

      const ensureProject = async (name: string): Promise<string> => {
        if (nameToProjectId.has(name)) return nameToProjectId.get(name)!;
        const created = await this.retryLinearCall(() =>
          this.linear.createProject({ name, teamId, state: "planned" }),
        );
        nameToProjectId.set(name, created.id);
        console.log(`📁 Created project bucket: ${name}`);
        return created.id;
      };

      const versionRegex = /^v\d(\.\d+)?$/i;
      // Group orphans by detected version label
      for (const issue of orphan.nodes) {
        let versionLabel: string | undefined;
        try {
          const labels = await this.retryLinearCall(() =>
            this.linear.issueLabels({
              filter: { issue: { id: { eq: issue.id } } },
            }),
          );
          const match = labels.nodes.find((l: any) =>
            versionRegex.test(l.name),
          );
          if (match) versionLabel = match.name.toUpperCase();
        } catch (_) {}

        let targetProjectName = versionLabel
          ? `Version ${versionLabel.replace(/^V/i, "")}`
          : "Unassigned (to triage)";
        const projectId = await ensureProject(targetProjectName);
        try {
          await this.retryLinearCall(() =>
            this.linear.updateIssue(issue.id, { projectId }),
          );
        } catch (e) {
          this.logger.warn(
            "Failed to move orphan into version project",
            e as Error,
            { issueId: issue.id },
          );
        }
      }

      // After bucketing, create rule-based relations and start first task per project
      for (const [projectName, projectId] of nameToProjectId.entries()) {
        if (!/Version|Unassigned/.test(projectName)) continue; // only for buckets we created or used
        await this.createRelationsForExistingProject(projectId);
      }

      console.log("✅ Version bucketing complete");
    } catch (error) {
      this.logger.warn("Version bucketing skipped", error as Error);
    }
  }

  /**
   * Setup dependencies and start development for an existing team
   */
  async setupExistingTeam(teamId: string): Promise<void> {
    this.logger.info("Setting up existing team with dependencies");
    console.log("🔄 Setting up dependencies for existing team...\n");

    // Get team and its projects
    const team = await this.retryLinearCall(() => this.linear.team(teamId));
    const projects = await this.retryLinearCall(() => team.projects());

    console.log(`📁 Found ${projects.nodes.length} project(s)\n`);

    for (const project of projects.nodes) {
      console.log(`\n📋 Setting up project: ${project.name}`);
      await this.createRelationsForExistingProject(project.id);
    }

    console.log("\n✅ All projects configured!");
  }

  /**
   * Build rule-based relations for existing project issues and start first unblocked
   */
  private async createRelationsForExistingProject(
    projectId: string,
  ): Promise<void> {
    try {
      const issuesQuery = await this.retryLinearCall(() =>
        this.linear.issues({
          filter: { project: { id: { eq: projectId } } },
          first: 200,
        }),
      );
      const issues: IssueWithDependencies[] = issuesQuery.nodes.map(
        (n: any) => ({
          title: n.title,
          description: n.description || "",
          priority: n.priority ?? 0,
          labels: [],
          dependencies: [],
          category: "general",
          complexity: "medium",
        }),
      );

      const withDeps = this.detectDependenciesWithRules(issues);

      // Create title→id map
      const titleToId: Record<string, string> = Object.fromEntries(
        issuesQuery.nodes.map((n: any) => [n.title, n.id]),
      );
      await this.createIssueRelations(withDeps, titleToId);

      const first = this.selectFirstUnblockedIssue(withDeps);
      if (first) {
        const firstId = titleToId[first.title];
        try {
          await this.retryLinearCall(() =>
            this.linear.updateIssue(firstId, { state: "inProgress" }),
          );
        } catch (e) {
          this.logger.warn(
            "Failed to move first project issue to In Progress",
            e as Error,
            { firstId },
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        "Could not create relations for existing project",
        error as Error,
        { projectId },
      );
    }
  }

  /**
   * Create issues in Linear
   */
  private async createIssues(
    issues: IssueWithDependencies[],
    teamId: string,
    projectId: string,
  ): Promise<{
    issueIds: string[];
    labelIds: string[];
    titleToId: Record<string, string>;
  }> {
    const createdIssues: { [key: string]: string } = {};
    const createdLabelIds = new Set<string>();

    for (const issue of issues) {
      try {
        // Get label IDs
        const labelIds: string[] = [];
        for (const labelName of issue.labels) {
          // Filter labels by BOTH name AND team to avoid workspace-level conflicts
          const labels = await this.retryLinearCall(() =>
            this.linear.issueLabels({
              filter: {
                name: { eq: labelName },
                team: { id: { eq: teamId } },
              },
            }),
          );

          let foundLabel = labels.nodes[0];

          if (!foundLabel) {
            // Create label if it doesn't exist in this team
            try {
              const newLabel = await this.retryLinearCall(() =>
                this.linear.createIssueLabel({
                  name: labelName,
                  teamId: teamId,
                }),
              );
              if (newLabel.id) {
                labelIds.push(newLabel.id);
                createdLabelIds.add(newLabel.id);
              }
            } catch (error: any) {
              // If label exists but couldn't be created (workspace-level conflict), skip it
              this.logger.warn(
                `Could not create/use label: ${labelName}`,
                error,
              );
            }
          } else {
            labelIds.push(foundLabel.id);
          }
        }

        // Build issue data
        const issueData: any = {
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          projectId: projectId,
          teamId: teamId,
        };

        if (labelIds.length > 0) {
          issueData.labelIds = labelIds;
        }

        const createdIssue = await this.retryLinearCall(() =>
          this.linear.createIssue(issueData),
        );
        createdIssues[issue.title] = createdIssue.id;

        this.logger.info("Created Linear issue", {
          title: issue.title,
          issueId: createdIssue.id,
        });
        console.log(`✅ Created issue: ${issue.title}`);
      } catch (error) {
        this.logger.error("Failed to create issue", error as Error, {
          issueTitle: issue.title,
        });
        console.error(`⚠️  Failed to create issue "${issue.title}"`);
      }
    }

    this.logger.info("Created all Linear issues", {
      totalIssues: Object.keys(createdIssues).length,
    });

    return {
      issueIds: Object.values(createdIssues),
      labelIds: Array.from(createdLabelIds),
      titleToId: createdIssues,
    };
  }

  /**
   * Create Linear issue relations (blocked-by) based on dependency graph
   */
  private async createIssueRelations(
    issues: IssueWithDependencies[],
    titleToId: Record<string, string>,
  ): Promise<void> {
    this.logger.info("Creating Linear issue relations from dependencies");

    for (const issue of issues) {
      const currentId = titleToId[issue.title];
      if (
        !currentId ||
        !issue.dependencies ||
        issue.dependencies.length === 0
      ) {
        continue;
      }

      for (const depTitle of issue.dependencies) {
        const depId = titleToId[depTitle];
        if (!depId) continue;

        try {
          // FIX: Corrected blocking direction
          // Linear API: type "blocks" means relatedIssueId blocks issueId
          // So: issueId = the one being blocked, relatedIssueId = the blocker
          await this.retryLinearCall(() =>
            // @ts-ignore - SDK method name may vary; Linear's API supports creating relations
            this.linear.createIssueRelation({
              type: "blocks",
              issueId: currentId, // The issue being blocked
              relatedIssueId: depId, // The dependency that blocks it
            }),
          );
          this.logger.info("Created relation: blocks", {
            blocker: depTitle,
            blocked: issue.title,
          });
        } catch (error) {
          this.logger.warn("Failed to create issue relation", error as Error, {
            blocker: depTitle,
            blocked: issue.title,
          });
        }
      }
    }
  }

  /**
   * Choose initial unblocked issues and move only the first one to In Progress
   */
  private selectFirstUnblockedIssue(
    issues: IssueWithDependencies[],
  ): IssueWithDependencies | undefined {
    const unblocked = issues
      .filter((i) => (i.dependencies || []).length === 0)
      .sort((a, b) => a.priority - b.priority);
    return unblocked[0];
  }

  /**
   * Assign issues to Cursor agent
   */
  private async assignToCursorAgent(
    teamId: string,
    projectId: string,
    issueIds: string[],
  ): Promise<void> {
    this.logger.info("Assigning issues to Cursor agent");
    console.log("🤖 Assigning all issues to Cursor agent...");

    try {
      const team = await this.retryLinearCall(() => this.linear.team(teamId));
      const users = await team.users();
      const cursorAgent = users.nodes.find(
        (user: any) =>
          user.name.toLowerCase().includes("cursor") ||
          user.email?.toLowerCase().includes("cursor"),
      );

      if (cursorAgent) {
        for (const issueId of issueIds) {
          try {
            await this.retryLinearCall(() =>
              this.linear.updateIssue(issueId, {
                assigneeId: cursorAgent.id,
                state: "inProgress",
              }),
            );
          } catch (error) {
            this.logger.error(
              "Failed to assign issue to Cursor agent",
              error as Error,
              { issueId },
            );
          }
        }

        this.logger.info("Assigned all issues to Cursor agent");
        console.log("✅ All issues assigned to Cursor agent");
      } else {
        this.logger.warn("Cursor agent not found in team");
        console.log("⚠️  Cursor agent not found in team");
      }
    } catch (error) {
      this.logger.error("Failed to assign issues", error as Error);
      console.log("⚠️  Could not assign issues to Cursor agent");
    }
  }

  /**
   * Detect dependencies using AI (OpenAI)
   */
  private async detectDependenciesWithAI(
    issues: IssueWithDependencies[],
  ): Promise<IssueWithDependencies[]> {
    this.logger.info("Analyzing dependencies with AI");
    console.log("🤖 Analyzing dependencies with AI...");

    try {
      const OpenAI = require("openai");
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `Analyze these development tasks for dependencies:

${issues
  .map(
    (issue, idx) =>
      `${idx + 1}. ${issue.title}
   Description: ${issue.description}
   Category: ${issue.category}
   Complexity: ${issue.complexity}`,
  )
  .join("\n")}

Return ONLY a JSON array with this format:
[
  {
    "title": "Task Title",
    "dependencies": ["Dependency Title 1"]
  }
]

Rules:
- Infrastructure tasks first
- Backend before frontend
- Core before advanced features`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (aiResponse) {
        const dependencyMap = JSON.parse(aiResponse);
        const enhancedIssues = issues.map((issue) => {
          const aiTask = dependencyMap.find(
            (task: any) => task.title === issue.title,
          );
          return {
            ...issue,
            dependencies: aiTask?.dependencies || [],
          };
        });

        this.logger.info("AI dependency analysis completed");
        return enhancedIssues;
      }
    } catch (error) {
      this.logger.warn(
        "AI dependency detection failed, using rule-based",
        error as Error,
      );
      console.log(
        "⚠️  AI dependency detection failed, using rule-based detection",
      );
    }

    return this.detectDependenciesWithRules(issues);
  }

  /**
   * Detect dependencies using rules
   */
  private detectDependenciesWithRules(
    issues: IssueWithDependencies[],
  ): IssueWithDependencies[] {
    this.logger.info("Analyzing dependencies with rules");
    console.log("📋 Analyzing dependencies with rules...");

    const dependencyRules: Record<string, string[]> = {
      "Setup Development Environment": [],
      "Setup Database Schema": ["Setup Development Environment"],
      "Implement Authentication System": ["Setup Database Schema"],
      "Build Dashboard Page": ["Implement Authentication System"],
      "Implement Profile Management": ["Build Dashboard Page"],
      "Configure Build Pipeline": ["Implement Profile Management"],
    };

    return issues.map((issue) => ({
      ...issue,
      dependencies: dependencyRules[issue.title] || [],
    }));
  }

  /**
   * Retry Linear API calls with exponential backoff
   */
  private async retryLinearCall<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw error;
        }

        this.logger.warn("Linear API call failed, retrying", error as Error, {
          attempt,
          maxRetries,
          delayMs,
        });
        console.log(
          `⚠️  Attempt ${attempt} failed, retrying in ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      }
    }

    throw lastError!;
  }
}
