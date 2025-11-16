import { LinearClient } from "@linear/sdk";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface BackupConfig {
  sourceTeamId: string;
  backupTeamName: string;
  includeIssues: boolean;
  includeProjects: boolean;
  includeLabels: boolean;
  includeMilestones: boolean;
  includeWorkflows: boolean;
  backupFilePath?: string;
}

class TeamBackup {
  private linear: LinearClient;
  private config: BackupConfig;

  constructor(linear: LinearClient) {
    this.linear = linear;
  }

  async backupTeam(): Promise<void> {
    console.log("📦 Linear Team Backup Tool");
    console.log("==========================");

    // Get configuration from user
    this.config = await this.getConfiguration();

    // Create backup directory
    const backupDir = path.join(
      process.cwd(),
      "backups",
      this.config.backupTeamName,
    );
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(`📁 Backup directory: ${backupDir}`);

    // Get source team
    const sourceTeam = await this.linear.team(this.config.sourceTeamId);
    console.log(`📋 Backing up team: ${sourceTeam.name}`);

    // Backup team data
    const backupData = await this.collectTeamData(sourceTeam);

    // Save backup to file
    const backupFile = path.join(
      backupDir,
      `${this.config.backupTeamName}-backup.json`,
    );
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`💾 Backup saved to: ${backupFile}`);

    // Create new team if requested
    if (this.config.backupTeamName !== sourceTeam.name) {
      console.log(`🔄 Creating new team: ${this.config.backupTeamName}`);
      await this.createNewTeam(backupData);
    }

    console.log("✅ Team backup completed successfully!");
  }

  private async getConfiguration(): Promise<BackupConfig> {
    // Get all teams
    const teams = await this.linear.teams();
    const teamChoices = teams.nodes.map((team) => ({
      name: team.name,
      value: team.id,
    }));

    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "sourceTeamId",
        message: "Select team to backup:",
        choices: teamChoices,
      },
      {
        type: "input",
        name: "backupTeamName",
        message: "Name for the backup team:",
        default: (answers: any) => {
          const selectedTeam = teams.nodes.find(
            (team) => team.id === answers.sourceTeamId,
          );
          return selectedTeam ? `${selectedTeam.name} - Backup` : "Team Backup";
        },
        validate: (input: string) => {
          if (!input.trim()) return "Team name is required";
          return true;
        },
      },
      {
        type: "checkbox",
        name: "backupOptions",
        message: "Select what to backup:",
        choices: [
          { name: "Issues", value: "issues", checked: true },
          { name: "Projects", value: "projects", checked: true },
          { name: "Labels", value: "labels", checked: true },
          { name: "Milestones", value: "milestones", checked: true },
          { name: "Workflows", value: "workflows", checked: true },
        ],
      },
      {
        type: "input",
        name: "backupFilePath",
        message: "Backup file path (optional):",
        default: "",
      },
    ]);

    return {
      sourceTeamId: answers.sourceTeamId,
      backupTeamName: answers.backupTeamName,
      includeIssues: answers.backupOptions.includes("issues"),
      includeProjects: answers.backupOptions.includes("projects"),
      includeLabels: answers.backupOptions.includes("labels"),
      includeMilestones: answers.backupOptions.includes("milestones"),
      includeWorkflows: answers.backupOptions.includes("workflows"),
      backupFilePath: answers.backupFilePath || undefined,
    };
  }

  private async collectTeamData(team: any): Promise<any> {
    console.log("📊 Collecting team data...");

    const backupData = {
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        key: team.key,
        settings: team.settings,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      },
      labels: [],
      projects: [],
      issues: [],
      milestones: [],
      workflows: [],
    };

    // Backup labels
    if (this.config.includeLabels) {
      console.log("🏷️  Backing up labels...");
      const labels = await this.linear.issueLabels({
        filter: { team: { id: { eq: team.id } } },
      });
      backupData.labels = labels.nodes.map((label) => ({
        id: label.id,
        name: label.name,
        description: label.description,
        color: label.color,
        createdAt: label.createdAt,
        updatedAt: label.updatedAt,
      }));
    }

    // Backup projects
    if (this.config.includeProjects) {
      console.log("📁 Backing up projects...");
      const projects = await this.linear.projects({
        filter: { team: { id: { eq: team.id } } },
      });
      for (const project of projects.nodes) {
        const projectData = {
          id: project.id,
          name: project.name,
          description: project.description,
          state: project.state,
          progress: project.progress,
          startDate: project.startDate,
          targetDate: project.targetDate,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        };

        // Backup project milestones
        if (this.config.includeMilestones) {
          const milestones = await this.linear.milestones({
            filter: { project: { id: { eq: project.id } } },
          });
          projectData.milestones = milestones.nodes.map((milestone) => ({
            id: milestone.id,
            name: milestone.name,
            description: milestone.description,
            targetDate: milestone.targetDate,
            createdAt: milestone.createdAt,
            updatedAt: milestone.updatedAt,
          }));
        }

        backupData.projects.push(projectData);
      }
    }

    // Backup issues
    if (this.config.includeIssues) {
      console.log("📝 Backing up issues...");
      const issues = await this.linear.issues({
        filter: { team: { id: { eq: team.id } } },
      });
      for (const issue of issues.nodes) {
        const state = await issue.state;
        const issueData = {
          id: issue.id,
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          state: state?.name || null,
          stateId: state?.id || null,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          labels: [],
          assignee: null,
          project: null,
        };

        // Backup issue labels
        try {
          const issueLabels = await issue.labels();
          issueData.labels = issueLabels.nodes.map((label) => ({
            id: label.id,
            name: label.name,
            color: label.color,
          }));
        } catch (error) {
          issueData.labels = [];
        }

        // Backup issue assignee
        try {
          const assignee = await issue.assignee;
          if (assignee) {
            issueData.assignee = {
              id: assignee.id,
              name: assignee.name,
              email: assignee.email,
            };
          }
        } catch (error) {
          issueData.assignee = null;
        }

        // Backup issue project
        try {
          const project = await issue.project;
          if (project) {
            issueData.project = {
              id: project.id,
              name: project.name,
            };
          }
        } catch (error) {
          issueData.project = null;
        }

        backupData.issues.push(issueData);
      }
    }

    // Backup workflows
    if (this.config.includeWorkflows) {
      console.log("⚙️  Backing up workflows...");
      try {
        const workflows = await this.linear.workflows({
          filter: { team: { id: { eq: team.id } } },
        });
        backupData.workflows = workflows.nodes.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          type: workflow.type,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        }));
      } catch (error) {
        console.log("⚠️  Could not backup workflows:", error.message);
        backupData.workflows = [];
      }
    }

    return backupData;
  }

  private async createNewTeam(backupData: any): Promise<void> {
    try {
      // Create new team
      const newTeam = await this.linear.createTeam({
        name: this.config.backupTeamName,
        description: backupData.team.description,
        key: backupData.team.key + "-BACKUP",
      });
      console.log(`✅ Created new team: ${newTeam.name}`);

      // Map old label names to new label IDs
      const labelMap = new Map<string, string>();

      // Restore labels
      if (this.config.includeLabels && backupData.labels.length > 0) {
        console.log("🏷️  Restoring labels...");
        for (const label of backupData.labels) {
          try {
            const newLabel = await this.linear.createIssueLabel({
              name: label.name,
              description: label.description,
              color: label.color,
              teamId: newTeam.id,
            });
            labelMap.set(label.name, newLabel.id);
          } catch (error) {
            console.log(
              `⚠️  Could not restore label "${label.name}":`,
              error.message,
            );
          }
        }
      }

      // Map old project names to new project IDs
      const projectMap = new Map<string, string>();

      // Restore projects
      if (this.config.includeProjects && backupData.projects.length > 0) {
        console.log("📁 Restoring projects...");
        for (const project of backupData.projects) {
          try {
            const newProject = await this.linear.createProject({
              name: project.name,
              description: project.description,
              state: project.state,
              teamIds: [newTeam.id],
            });
            const createdProject = await newProject.project;
            if (createdProject) {
              projectMap.set(project.name, createdProject.id);
              console.log(`✅ Restored project: ${project.name}`);
            }
          } catch (error) {
            console.log(
              `⚠️  Could not restore project "${project.name}":`,
              error.message,
            );
          }
        }
      }

      // Get the default workflow state for the new team
      const teamStates = await this.linear.workflowStates({
        filter: { team: { id: { eq: newTeam.id } } },
      });
      const defaultState = teamStates.nodes[0]; // Use first state (usually "Backlog" or "Todo")

      // Restore issues
      if (this.config.includeIssues && backupData.issues.length > 0) {
        console.log("📝 Restoring issues...");
        for (const issue of backupData.issues) {
          try {
            // Prepare issue data
            const issueData: any = {
              title: issue.title,
              description: issue.description,
              priority: issue.priority,
              teamId: newTeam.id,
              stateId: defaultState?.id,
            };

            // Map labels
            if (issue.labels && issue.labels.length > 0) {
              const labelIds = issue.labels
                .map((label) => labelMap.get(label.name))
                .filter((id) => id !== undefined);
              if (labelIds.length > 0) {
                issueData.labelIds = labelIds;
              }
            }

            // Map project
            if (issue.project && issue.project.name) {
              const projectId = projectMap.get(issue.project.name);
              if (projectId) {
                issueData.projectId = projectId;
              }
            }

            const newIssue = await this.linear.createIssue(issueData);
            console.log(`✅ Restored issue: ${issue.title}`);
          } catch (error) {
            console.log(
              `⚠️  Could not restore issue "${issue.title}":`,
              error.message,
            );
          }
        }
      }

      console.log(`🎉 Team backup and restoration completed!`);
      console.log(`📋 New team: ${newTeam.name}`);
      console.log(`🔗 Team URL: https://linear.app/team/${newTeam.key}`);
    } catch (error: any) {
      console.error("❌ Team duplication failed:", error.message);
      if (error.data) {
        console.error("Error details:", JSON.stringify(error.data, null, 2));
      }
      throw error;
    }
  }
}

async function main() {
  const linear = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY,
  });

  const backup = new TeamBackup(linear);
  await backup.backupTeam();
}

main().catch((error) => {
  console.error("❌ Error backing up team:", error);
  process.exit(1);
});
