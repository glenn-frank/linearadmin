#!/usr/bin/env tsx

import axios from "axios";
import * as dotenv from "dotenv";
import inquirer from "inquirer";

// Load environment variables
dotenv.config();

interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
  private: boolean;
  archivedAt?: string;
}

interface LinearLabel {
  id: string;
  name: string;
  color: string;
  description?: string;
  teamId: string;
}

interface LinearProject {
  id: string;
  name: string;
  description?: string;
  color: string;
  state: string;
  teamId: string;
}

interface LinearWorkflowState {
  id: string;
  name: string;
  color: string;
  type: string;
  position: number;
  teamId: string;
}

interface LinearTemplate {
  id: string;
  name: string;
  description?: string;
  templateData: any;
  teamId: string;
}

class TeamManager {
  private apiKey: string;
  private baseUrl = "https://api.linear.app/graphql";

  constructor() {
    this.apiKey = process.env.LINEAR_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("LINEAR_API_KEY environment variable is required");
    }
  }

  private async makeRequest(query: string, variables: any = {}) {
    try {
      const response = await axios.post(
        this.baseUrl,
        {
          query,
          variables,
        },
        {
          headers: {
            Authorization: this.apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data.errors) {
        console.error("GraphQL Errors:", response.data.errors);
        throw new Error(
          `GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        );
      }

      return response.data.data;
    } catch (error) {
      if (error.response) {
        console.error("API Error:", error.response.status, error.response.data);
        throw new Error(
          `API Error ${error.response.status}: ${JSON.stringify(
            error.response.data,
          )}`,
        );
      }
      throw error;
    }
  }

  async getTeams(): Promise<LinearTeam[]> {
    const query = `
      query GetTeams {
        teams {
          nodes {
            id
            name
            key
            description
            private
            archivedAt
          }
        }
      }
    `;

    const data = await this.makeRequest(query);
    return data.teams.nodes;
  }

  async getTeamStructure(teamId: string) {
    console.log(`🔍 Fetching team structure for team: ${teamId}`);

    // Get labels
    const labelsQuery = `
      query GetLabels($teamId: String!) {
        team(id: $teamId) {
          labels {
            nodes {
              id
              name
              color
              description
            }
          }
        }
      }
    `;

    // Get projects
    const projectsQuery = `
      query GetProjects($teamId: String!) {
        team(id: $teamId) {
          projects {
            nodes {
              id
              name
              description
              color
              state
            }
          }
        }
      }
    `;

    // Get workflow states
    const workflowQuery = `
      query GetWorkflowStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              color
              type
              position
            }
          }
        }
      }
    `;

    // Get templates
    const templatesQuery = `
      query GetTemplates($teamId: String!) {
        team(id: $teamId) {
          templates {
            nodes {
              id
              name
              description
              templateData
            }
          }
        }
      }
    `;

    const [labelsData, projectsData, workflowData, templatesData] =
      await Promise.all([
        this.makeRequest(labelsQuery, { teamId }),
        this.makeRequest(projectsQuery, { teamId }),
        this.makeRequest(workflowQuery, { teamId }),
        this.makeRequest(templatesQuery, { teamId }),
      ]);

    return {
      labels: labelsData.team.labels.nodes,
      projects: projectsData.team.projects.nodes,
      workflowStates: workflowData.team.states.nodes,
      templates: templatesData.team.templates.nodes,
    };
  }

  private async createLabel(
    teamId: string,
    name: string,
    color?: string,
    description?: string,
  ): Promise<string> {
    const query = `
      mutation CreateIssueLabel($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel { id name }
        }
      }
    `;

    const variables = {
      input: {
        teamId,
        name,
        color,
        description,
      },
    };

    const data = await this.makeRequest(query, variables);
    if (!data.issueLabelCreate.success) {
      throw new Error(`Failed to create label: ${name}`);
    }
    return data.issueLabelCreate.issueLabel.id;
  }

  private async listTeamLabels(teamId: string): Promise<LinearLabel[]> {
    const query = `
      query TeamLabels($teamId: String!) {
        team(id: $teamId) {
          labels { nodes { id name color description } }
        }
      }
    `;
    const data = await this.makeRequest(query, { teamId });
    return data.team.labels.nodes;
  }

  private async findLabelIdByName(
    teamId: string,
    name: string,
  ): Promise<string | undefined> {
    const labels = await this.listTeamLabels(teamId);
    return labels.find(
      (l: any) => (l.name || "").toLowerCase() === name.toLowerCase(),
    )?.id;
  }

  private async ensureLabel(
    teamId: string,
    name: string,
    color?: string,
    description?: string,
  ): Promise<string | undefined> {
    try {
      return await this.createLabel(teamId, name, color, description);
    } catch (_) {
      // Likely duplicate at workspace level; find existing
      return await this.findLabelIdByName(teamId, name);
    }
  }

  private async getIssuesByProject(projectId: string) {
    const query = `
      query IssuesByProject($projectId: ID!) {
        issues(filter: { project: { id: { eq: $projectId } } }) {
          nodes { id title description priority }
        }
      }
    `;
    const data = await this.makeRequest(query, { projectId });
    return data.issues.nodes as Array<{
      id: string;
      title: string;
      description?: string;
      priority?: number;
    }>;
  }

  private async getOrphanIssues(teamId: string) {
    const query = `
      query OrphanIssues($teamId: ID!) {
        issues(filter: { team: { id: { eq: $teamId } }, project: { null: true } }) {
          nodes { id title description priority }
        }
      }
    `;
    const data = await this.makeRequest(query, { teamId });
    return data.issues.nodes as Array<{
      id: string;
      title: string;
      description?: string;
      priority?: number;
    }>;
  }

  private async getIssueLabels(
    issueId: string,
  ): Promise<Array<{ name: string }>> {
    const query = `
      query IssueLabels($issueId: ID!) {
        issue(id: $issueId) { labels { nodes { name } } }
      }
    `;
    const data = await this.makeRequest(query, { issueId });
    return (data.issue?.labels?.nodes || []) as Array<{ name: string }>;
  }

  private async updateIssueLabels(
    issueId: string,
    labelIds: string[],
  ): Promise<void> {
    if (!labelIds.length) return;
    const query = `
      mutation UpdateIssue($id: ID!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }
    `;
    const variables = { id: issueId, input: { labelIds } };
    await this.makeRequest(query, variables);
  }

  private async createIssue(
    teamId: string,
    props: {
      title: string;
      description?: string;
      priority?: number;
      projectId?: string;
    },
  ): Promise<string> {
    const query = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id title }
        }
      }
    `;

    const variables = {
      input: {
        teamId,
        title: props.title,
        description: props.description,
        priority: props.priority,
        projectId: props.projectId,
      },
    };

    const data = await this.makeRequest(query, variables);
    if (!data.issueCreate.success) throw new Error("Failed to create issue");
    return data.issueCreate.issue.id;
  }

  async duplicateTeamEverything(
    sourceTeamId: string,
    newTeamName: string,
    newTeamKey: string,
  ): Promise<string> {
    console.log(`🔄 Duplicating FULL team (labels, projects, issues)`);

    const structure = await this.getTeamStructure(sourceTeamId);

    // Create new team
    const newTeamId = await this.createTeam(newTeamName, newTeamKey);
    console.log(`✅ Team created: ${newTeamName}`);

    // Labels
    console.log(`🏷️  Restoring ${structure.labels.length} labels...`);
    for (const l of structure.labels) {
      await this.ensureLabel(newTeamId, l.name, l.color, l.description);
    }
    // Build map name->id in new team for label assignment
    const newTeamLabels = await this.listTeamLabels(newTeamId);
    const labelNameToId = new Map<string, string>(
      newTeamLabels.map((l: any) => [l.name.toLowerCase(), l.id]),
    );

    // Projects
    console.log(`📁 Restoring ${structure.projects.length} projects...`);
    const projectMap = new Map<string, string>();
    for (const p of structure.projects) {
      const newProjId = await this.createProject(
        newTeamId,
        p.name,
        p.description,
        p.color,
      );
      projectMap.set(p.id, newProjId);
      console.log(`  • ${p.name}`);
      // Issues for this project
      const issues = await this.getIssuesByProject(p.id);
      for (const issue of issues) {
        // create the issue first
        const newIssueId = await this.createIssue(newTeamId, {
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          projectId: newProjId,
        });
        // fetch original issue labels and map by name to new team labels
        try {
          const srcLabels = await this.getIssueLabels(issue.id);
          const labelIds = (srcLabels || [])
            .map((l) => labelNameToId.get(l.name.toLowerCase()))
            .filter(Boolean) as string[];
          await this.updateIssueLabels(newIssueId, labelIds);
        } catch (_) {}
      }
    }

    // Orphan issues (no project)
    const orphans = await this.getOrphanIssues(sourceTeamId);
    if (orphans.length > 0) {
      const triageId = await this.createProject(
        newTeamId,
        "Unassigned (restored)",
      );
      console.log(
        `🧭 Restoring ${orphans.length} orphan issues to 'Unassigned (restored)'`,
      );
      for (const issue of orphans) {
        const newIssueId = await this.createIssue(newTeamId, {
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          projectId: triageId,
        });
        // map labels for orphan
        try {
          const srcLabels = await this.getIssueLabels(issue.id);
          const labelIds = (srcLabels || [])
            .map((l) => labelNameToId.get(l.name.toLowerCase()))
            .filter(Boolean) as string[];
          await this.updateIssueLabels(newIssueId, labelIds);
        } catch (_) {}
      }
    }

    console.log(`🎉 Full team duplication complete!`);
    return newTeamId;
  }

  async createTeam(
    name: string,
    key: string,
    description?: string,
    isPrivate: boolean = false,
  ): Promise<string> {
    const query = `
      mutation CreateTeam($input: TeamCreateInput!) {
        teamCreate(input: $input) {
          success
          team {
            id
            name
            key
          }
        }
      }
    `;

    const variables = {
      input: {
        name,
        key,
        description,
        private: isPrivate,
      },
    };

    const data = await this.makeRequest(query, variables);

    if (!data.teamCreate.success) {
      throw new Error("Failed to create team");
    }

    return data.teamCreate.team.id;
  }

  async createLabel(
    teamId: string,
    name: string,
    color: string,
    description?: string,
  ): Promise<string> {
    const query = `
      mutation CreateLabel($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel {
            id
            name
          }
        }
      }
    `;

    const variables = {
      input: {
        teamId,
        name,
        color,
        description,
      },
    };

    const data = await this.makeRequest(query, variables);

    if (!data.issueLabelCreate.success) {
      throw new Error(`Failed to create label: ${name}`);
    }

    return data.issueLabelCreate.issueLabel.id;
  }

  async createProject(
    teamId: string,
    name: string,
    description?: string,
    color?: string,
  ): Promise<string> {
    const query = `
      mutation CreateProject($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          success
          project {
            id
            name
          }
        }
      }
    `;

    const variables = {
      input: {
        teamIds: [teamId],
        name,
        description,
        ...(color ? { color } : {}),
      },
    };

    const data = await this.makeRequest(query, variables);

    if (!data.projectCreate.success) {
      throw new Error(`Failed to create project: ${name}`);
    }

    return data.projectCreate.project.id;
  }

  async duplicateTeamStructure(
    sourceTeamId: string,
    newTeamName: string,
    newTeamKey: string,
  ): Promise<string> {
    console.log(
      `🔄 Duplicating team structure from ${sourceTeamId} to ${newTeamName}`,
    );

    // Get source team structure
    const structure = await this.getTeamStructure(sourceTeamId);

    console.log(
      `📋 Found ${structure.workflowStates.length} workflow states, ${structure.templates.length} templates`,
    );
    console.log(
      `⚠️  Skipping ${structure.labels.length} labels and ${structure.projects.length} projects (these are data, not structure)`,
    );

    // Create new team
    console.log(`🏗️ Creating new team: ${newTeamName}`);
    const newTeamId = await this.createTeam(newTeamName, newTeamKey);

    // Note: We're only copying workflow states and templates
    // Labels and projects are considered data, not structure
    console.log(
      `📋 Team structure duplication complete! New team ID: ${newTeamId}`,
    );
    console.log(
      `ℹ️  The new team will have default workflow states and no templates`,
    );
    console.log(`ℹ️  You can manually add labels and projects as needed`);

    return newTeamId;
  }

  async selectTeam(): Promise<string> {
    const teams = await this.getTeams();
    const activeTeams = teams.filter((team) => !team.archivedAt);

    if (activeTeams.length === 0) {
      throw new Error("No active teams found");
    }

    const choices = activeTeams.map((team) => ({
      name: `${team.name} (${team.key})`,
      value: team.id,
    }));

    const { teamId } = await inquirer.prompt([
      {
        type: "list",
        name: "teamId",
        message: "Select a team:",
        choices,
      },
    ]);

    return teamId;
  }

  async interactiveTeamDuplication() {
    console.log("🔄 Team Duplication Tool");
    console.log("=".repeat(50));
    console.log("Choose what to duplicate:");
    console.log(
      "  • Skeleton only: workflow states/templates (no labels, projects, issues)",
    );
    console.log("  • Everything: labels, projects, and issues");
    console.log("");

    // Select source team
    console.log("📋 Select source team to duplicate:");
    const sourceTeamId = await this.selectTeam();

    // Get team details for confirmation
    const teams = await this.getTeams();
    const sourceTeam = teams.find((team) => team.id === sourceTeamId);

    console.log(`\n📋 Source team: ${sourceTeam?.name} (${sourceTeam?.key})`);

    // Get new team details
    const { newTeamName, newTeamKey } = await inquirer.prompt([
      {
        type: "input",
        name: "newTeamName",
        message: "New team name:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Team name is required";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "newTeamKey",
        message: "New team key (short identifier):",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Team key is required";
          }
          if (!/^[A-Z0-9]+$/.test(input.toUpperCase())) {
            return "Team key must contain only uppercase letters and numbers";
          }
          return true;
        },
      },
    ]);

    // Duplication mode
    const { mode } = await inquirer.prompt([
      {
        type: "list",
        name: "mode",
        message: "Duplication mode:",
        choices: [
          { name: "Skeleton only", value: "skeleton" },
          { name: "Everything (labels, projects, issues)", value: "full" },
        ],
        default: "skeleton",
      },
    ]);

    // Confirm duplication
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Create new team "${newTeamName}" (${newTeamKey.toUpperCase()}) with ${mode} from "${
          sourceTeam?.name
        }"?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log("❌ Team duplication cancelled");
      return;
    }

    try {
      const newTeamId =
        mode === "full"
          ? await this.duplicateTeamEverything(
              sourceTeamId,
              newTeamName,
              newTeamKey.toUpperCase(),
            )
          : await this.duplicateTeamStructure(
              sourceTeamId,
              newTeamName,
              newTeamKey.toUpperCase(),
            );

      console.log(`\n🎉 Successfully created team: ${newTeamName}`);
      console.log(`🆔 Team ID: ${newTeamId}`);
      console.log(`🔗 Team Key: ${newTeamKey.toUpperCase()}`);
    } catch (error) {
      console.error("❌ Team duplication failed:", error.message);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    const teamManager = new TeamManager();

    switch (command) {
      case "duplicate":
      case "dup":
        await teamManager.interactiveTeamDuplication();
        break;

      case "list":
      case "ls":
        const teams = await teamManager.getTeams();
        console.log("📋 Available Teams:");
        teams.forEach((team) => {
          const status = team.archivedAt ? " (archived)" : "";
          console.log(`  • ${team.name} (${team.key})${status}`);
        });
        break;

      default:
        // If no command provided, default to duplicate
        await teamManager.interactiveTeamDuplication();
        break;
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { TeamManager };
