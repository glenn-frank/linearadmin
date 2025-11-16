import * as fs from "fs";
import * as path from "path";
import inquirer from "inquirer";
import { LinearClient } from "@linear/sdk";
import { Logger } from "../utils/logger";
import { ConfigValidator, CONFIG_DEFAULTS } from "../schemas/ConfigValidation";

export interface LaravelForgeAppConfig {
  appName: string;
  description: string;
  teamId: string;
  databaseType:
    | "mysql"
    | "postgresql"
    | "sqlite"
    | "forge-mysql"
    | "forge-postgresql";
  features: string[];
  deploymentTarget: "local" | "forge" | "both";
  existingProjectId?: string;
  createNewProject: boolean;
  createNewTeam: boolean;
  newTeamName?: string;
  teamOption: "new" | "existing";
  backupFile?: string;
  forgeApiKey?: string;
  createForgeSite: boolean;
  useForgeStorage: boolean;
  forgeDatabaseName?: string;
  forgeStorageBucket?: string;
  projectDirectory: string;
  localDatabaseType: "mysql" | "postgresql" | "sqlite";
  githubRepo?: string;
  repoSubfolder?: string;
  enableAIDependencies: boolean;
  customDependencyRules?: string[];
  startDevelopment: boolean;
  rerunExistingIssues: boolean;
  autoStartServers: boolean;
}

/**
 * Manages configuration for Laravel app creation
 */
export class ConfigurationManager {
  private linear: LinearClient;
  private logger: Logger;
  private preferencesFile: string;

  constructor(linear: LinearClient, logger: Logger) {
    this.linear = linear;
    this.logger = logger;
    this.preferencesFile = path.join(
      require("os").homedir(),
      ".laravel-forge-creator-preferences.json",
    );
  }

  /**
   * Get configuration from user via interactive prompts
   */
  async getConfiguration(): Promise<LaravelForgeAppConfig> {
    const savedPreferences = this.loadPreferences();

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "appName",
        message: "What is the name of your Laravel app?",
        validate: (input: string) => {
          if (!input.trim()) return "App name is required";
          if (!/^[a-z0-9-]+$/.test(input))
            return "App name must contain only lowercase letters, numbers, and hyphens";
          return true;
        },
      },
      {
        type: "confirm",
        name: "importRequirements",
        message:
          "Import requirements file into Linear after project selection?",
        default: false,
      },
      {
        type: "input",
        name: "requirementsFile",
        message: "Path to requirements file (.md or .json):",
        when: (answers: any) => answers.importRequirements,
        validate: (input: string) => {
          if (!input || !input.trim()) return "File path is required";
          return true;
        },
      },
      {
        type: "input",
        name: "description",
        message: "Describe your application:",
        default: "A modern Laravel + React + TypeScript application",
      },
      {
        type: "input",
        name: "projectDirectory",
        message: "Where should the project be created?",
        default:
          savedPreferences.projectDirectory ||
          path.join(require("os").homedir(), "Documents", "apps"),
        validate: (input: string) => {
          if (!input.trim()) return "Project directory is required";
          if (!fs.existsSync(input)) return "Directory does not exist";
          if (!fs.statSync(input).isDirectory())
            return "Path must be a directory";
          return true;
        },
      },
      {
        type: "confirm",
        name: "enableAIDependencies",
        message: "Enable AI-powered dependency detection?",
        default:
          savedPreferences.enableAIDependencies !== undefined
            ? savedPreferences.enableAIDependencies
            : true,
      },
      {
        type: "input",
        name: "customDependencyRules",
        message: "Enter custom dependency rules (optional, comma-separated):",
        default: "",
        when: (answers: any) => !answers.enableAIDependencies,
      },
      {
        type: "list",
        name: "teamOption",
        message: "Linear team option:",
        choices: [
          { name: "Create new team", value: "new" },
          { name: "Select existing team", value: "existing" },
          { name: "Restore from backup", value: "restore" },
        ],
        default: "existing",
      },
      {
        type: "input",
        name: "newTeamName",
        message: "What is the name of your new team?",
        validate: (input: string) => {
          if (!input.trim()) return "Team name is required";
          if (input.length < 2)
            return "Team name must be at least 2 characters";
          return true;
        },
        when: (answers: any) => answers.teamOption === "new",
      },
      {
        type: "list",
        name: "teamId",
        message: "Select Linear team:",
        choices: async (answers: any) => {
          if (answers.teamOption !== "existing") return [];
          const teams = await this.linear.teams();
          return teams.nodes.map((team) => ({
            name: team.name,
            value: team.id,
          }));
        },
        when: (answers: any) => answers.teamOption === "existing",
      },
      {
        type: "list",
        name: "backupFile",
        message: "Select backup file to restore:",
        choices: async () => {
          const backupDir = path.join(
            require("os").homedir(),
            "linear-backups",
          );
          if (!fs.existsSync(backupDir)) {
            return [{ name: "No backups found", value: null }];
          }

          const dirs = fs
            .readdirSync(backupDir, { withFileTypes: true })
            .filter((dirent: any) => dirent.isDirectory())
            .map((dirent: any) => dirent.name);

          if (dirs.length === 0) {
            return [{ name: "No backups found", value: null }];
          }

          return dirs.map((dir: string) => ({
            name: dir,
            value: path.join(backupDir, dir),
          }));
        },
        when: (answers: any) => answers.teamOption === "restore",
      },
      {
        type: "confirm",
        name: "createNewProject",
        message:
          "Create a new Linear project for this app? (Yes: create a fresh project and import everything. No: select an existing project to import into)",
        default: true,
      },
      {
        type: "list",
        name: "existingProjectId",
        message: "Select existing Linear project:",
        choices: async (answers: any) => {
          if (answers.createNewProject) return [];

          const team = await this.linear.team(answers.teamId);
          const projects = await team.projects();

          if (projects.nodes.length === 0) {
            console.log(
              "⚠️  No existing projects found. Creating new project instead.",
            );
            return [{ name: "Create New Project", value: "new" }];
          }

          return projects.nodes.map((project) => ({
            name: `${project.name} (${project.state})`,
            value: project.id,
          }));
        },
        when: (answers: any) => !answers.createNewProject,
      },
      {
        type: "confirm",
        name: "startDevelopment",
        message: "Start development and assign all issues to Cursor agent?",
        default: true,
      },
      {
        type: "confirm",
        name: "rerunExistingIssues",
        message: "Rerun existing issues that were started by agents?",
        default: false,
        when: (answers: any) => answers.startDevelopment,
      },
      {
        type: "confirm",
        name: "createForgeSite",
        message: "Create Laravel Forge site automatically?",
        default:
          savedPreferences.createForgeSite !== undefined
            ? savedPreferences.createForgeSite
            : !!process.env.FORGE_API_KEY,
      },
      {
        type: "list",
        name: "deploymentTarget",
        message: "Deployment target:",
        choices: [
          { name: "Both local and Forge", value: "both" },
          { name: "Local development only", value: "local" },
          { name: "Laravel Forge only", value: "forge" },
        ],
        default: savedPreferences.deploymentTarget || "both",
      },
      {
        type: "list",
        name: "localDatabaseType",
        message: "Local database type:",
        choices: [
          { name: "PostgreSQL", value: "postgresql" },
          { name: "MySQL", value: "mysql" },
          { name: "SQLite", value: "sqlite" },
        ],
        default: savedPreferences.localDatabaseType || "postgresql",
      },
      {
        type: "list",
        name: "databaseType",
        message: "Forge database type:",
        choices: [
          { name: "PostgreSQL", value: "forge-postgresql" },
          { name: "MySQL", value: "forge-mysql" },
        ],
        default: savedPreferences.databaseType || "forge-postgresql",
        when: (answers: any) =>
          answers.deploymentTarget === "forge" ||
          answers.deploymentTarget === "both",
      },
      {
        type: "input",
        name: "forgeDatabaseName",
        message: "Forge database name:",
        default: (answers: any) =>
          answers.appName.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        validate: (input: string) => {
          if (!input.trim()) return "Database name is required";
          if (!/^[a-z0-9_]+$/.test(input))
            return "Database name must contain only lowercase letters, numbers, and underscores";
          return true;
        },
        when: (answers: any) =>
          answers.deploymentTarget === "forge" ||
          answers.deploymentTarget === "both",
      },
      {
        type: "confirm",
        name: "useForgeStorage",
        message: "Use Laravel Forge storage (S3-compatible)?",
        default:
          savedPreferences.useForgeStorage !== undefined
            ? savedPreferences.useForgeStorage
            : true,
        when: (answers: any) =>
          answers.deploymentTarget === "forge" ||
          answers.deploymentTarget === "both",
      },
      {
        type: "input",
        name: "forgeStorageBucket",
        message: "Forge storage bucket name:",
        default: (answers: any) =>
          `${answers.appName
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")}-storage`,
        validate: (input: string) => {
          if (!input.trim()) return "Bucket name is required";
          if (!/^[a-z0-9-]+$/.test(input))
            return "Bucket name must contain only lowercase letters, numbers, and hyphens";
          return true;
        },
        when: (answers: any) => answers.useForgeStorage,
      },
      {
        type: "input",
        name: "repoSubfolder",
        message: "Repository subfolder for frontend (optional):",
        default: savedPreferences.repoSubfolder || "frontend",
      },
      {
        type: "checkbox",
        name: "features",
        message: "Select features to include:",
        choices: [
          { name: "Authentication", value: "auth", checked: true },
          { name: "Profile Management", value: "profile", checked: true },
          { name: "Dashboard", value: "dashboard", checked: true },
          { name: "File Upload", value: "upload", checked: true },
          { name: "Email Notifications", value: "email", checked: true },
          { name: "API Documentation", value: "docs", checked: true },
        ],
        validate: (input: string[]) => {
          if (input.length === 0) return "Select at least one feature";
          return true;
        },
      },
      {
        type: "confirm",
        name: "autoStartServers",
        message:
          "Automatically install dependencies and start servers when done?",
        default: true,
      },
    ]);

    // Build configuration from answers
    const config = {
      ...answers,
      createNewTeam: answers.teamOption === "new",
      forgeApiKey: process.env.FORGE_API_KEY,
      githubRepo: "", // Empty by default - user creates repo manually after app creation
    } as LaravelForgeAppConfig;

    // Save preferences for next time
    this.savePreferences({
      projectDirectory: config.projectDirectory,
      enableAIDependencies: config.enableAIDependencies,
      createNewTeam: config.createNewTeam,
      createForgeSite: config.createForgeSite,
      deploymentTarget: config.deploymentTarget,
      databaseType: config.databaseType,
      localDatabaseType: config.localDatabaseType,
      repoSubfolder: config.repoSubfolder,
      useForgeStorage: config.useForgeStorage,
    });

    this.logger.info("Configuration collected", {
      appName: config.appName,
      features: config.features,
      deploymentTarget: config.deploymentTarget,
    });

    // Validate configuration with Zod schema
    const validationResult = ConfigValidator.safeValidateConfig(config);

    if (!validationResult.success) {
      const errors = ConfigValidator.formatErrors(validationResult.errors!);
      this.logger.error("Configuration validation failed", undefined, {
        errors,
      });
      console.error("❌ Configuration validation failed:");
      errors.forEach((error) => console.error(`   - ${error}`));
      throw new Error("Invalid configuration. Please check your inputs.");
    }

    this.logger.info("Configuration validated successfully");
    return config;
  }

  /**
   * Load saved preferences from file
   */
  private loadPreferences(): any {
    try {
      if (fs.existsSync(this.preferencesFile)) {
        const data = fs.readFileSync(this.preferencesFile, "utf8");
        this.logger.debug("Loaded preferences from file", {
          preferencesFile: this.preferencesFile,
        });
        return JSON.parse(data);
      }
    } catch (error) {
      this.logger.warn("Could not load preferences", error as Error, {
        preferencesFile: this.preferencesFile,
      });
      console.log("⚠️  Could not load preferences:", error.message);
    }
    return {};
  }

  /**
   * Save preferences to file
   */
  private savePreferences(preferences: any): void {
    try {
      fs.writeFileSync(
        this.preferencesFile,
        JSON.stringify(preferences, null, 2),
      );
      this.logger.debug("Saved preferences to file", {
        preferencesFile: this.preferencesFile,
      });
    } catch (error) {
      this.logger.warn("Could not save preferences", error as Error, {
        preferencesFile: this.preferencesFile,
      });
      console.log("⚠️  Could not save preferences:", error.message);
    }
  }
}
