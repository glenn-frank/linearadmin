import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { LinearClient } from "@linear/sdk";
import inquirer from "inquirer";
import { TemplateLoader } from "./utils/template-loader";
import { Logger, LogLevel } from "./utils/logger";
import { AutoSetup } from "./modules/AutoSetup";

interface LaravelForgeAppConfig {
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
  githubRepo: string;
  repoSubfolder?: string;
  enableAIDependencies: boolean;
  customDependencyRules?: string[];
  startDevelopment: boolean;
  rerunExistingIssues: boolean;
  autoStartServers: boolean;
}

interface ProjectStructure {
  backend: string[];
  frontend: string[];
  config: string[];
  docs: string[];
}

interface IssueWithDependencies {
  title: string;
  description: string;
  priority: number;
  labels: string[];
  dependencies: string[];
  category: string;
  complexity: "low" | "medium" | "high";
}

/**
 * State tracking for rollback functionality
 */
interface RollbackState {
  /** Path to created project directory */
  projectDirectory?: string;
  /** Whether git was initialized */
  gitInitialized?: boolean;
  /** ID of created Linear team */
  linearTeamCreated?: string;
  /** ID of created Linear project */
  linearProjectCreated?: string;
  /** IDs of created Linear issues */
  linearIssuesCreated?: string[];
  /** IDs of created Linear labels */
  linearLabelsCreated?: string[];
  /** Whether GitHub remote was added */
  githubRemoteAdded?: boolean;
  /** ID of created Forge team */
  forgeTeamCreated?: string;
}

/**
 * Laravel Forge App Creator - Main orchestrator class
 *
 * Creates a complete Laravel + React + TypeScript application with:
 * - Laravel 11.x backend with Sanctum authentication
 * - React 18.x frontend with TypeScript
 * - Vite build tooling
 * - TailwindCSS v3 styling
 * - Linear project management integration
 * - Optional Laravel Forge deployment
 * - Automatic GitHub repository setup
 *
 * @example
 * ```typescript
 * const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
 * const creator = new LaravelForgeAppCreator(linear);
 * await creator.createApp();
 * ```
 */
class LaravelForgeAppCreator {
  private linear: LinearClient;
  private config: LaravelForgeAppConfig;
  private projectPath: string = "";
  private preferencesFile: string = "";
  private linearAvailable: boolean = true;
  private rollbackState: RollbackState = {};
  private templateLoader: TemplateLoader;
  private logger: Logger;

  /**
   * Creates a new Laravel Forge App Creator instance
   *
   * @param linear - Initialized LinearClient for API interactions
   */
  constructor(linear: LinearClient) {
    this.linear = linear;
    this.templateLoader = new TemplateLoader();
    this.logger = new Logger(
      LogLevel.INFO,
      path.join(require("os").homedir(), ".laravel-forge-creator.log"),
      true,
    );
    this.preferencesFile = path.join(
      require("os").homedir(),
      ".laravel-forge-creator-preferences.json",
    );
  }

  /**
   * Main entry point - Creates a complete Laravel + React + TypeScript application
   *
   * This method orchestrates the entire application creation process:
   * 1. Tests Linear API connection
   * 2. Collects configuration from user
   * 3. Creates project directory structure
   * 4. Initializes Laravel backend with Sanctum auth
   * 5. Sets up React frontend with TypeScript
   * 6. Configures Vite build tools
   * 7. Sets up database and migrations
   * 8. Publishes to GitHub
   * 9. Creates Linear project with issues
   * 10. Generates comprehensive documentation
   * 11. (Optional) Creates Laravel Forge site
   * 12. Finalizes setup and creates git repository
   *
   * @throws {Error} If any step fails, automatic rollback is triggered
   * @returns Promise that resolves when app creation is complete
   *
   * @example
   * ```typescript
   * await creator.createApp();
   * // Project created at ~/Documents/apps/my-app
   * // Linear issues created and assigned
   * // GitHub repository initialized
   * ```
   */
  async createApp(): Promise<void> {
    console.log("🚀 Laravel Forge App Creator");
    console.log("=====================================");

    try {
      // Test Linear connection first
      await this.testLinearConnection();

      // Get configuration from user
      this.config = await this.getConfiguration();

      // Create project directory
      await this.createProjectDirectory();
      this.rollbackState.projectDirectory = this.projectPath;

      // Initialize Laravel backend
      await this.initializeLaravelBackend();

      // Setup React frontend
      await this.setupReactFrontend();

      // Configure build tools
      await this.configureBuildTools();

      // Setup database
      await this.setupDatabase();

      // Publish to GitHub automatically
      await this.publishToGitHub();
      this.rollbackState.githubRemoteAdded = true;

      // Create Linear project and issues (if Linear is available)
      if (this.linearAvailable) {
        // Backup team before making changes
        await this.backupTeamBeforeChanges();
        await this.createLinearProject();
      } else {
        console.log("⏭️  Skipping Linear integration due to connection issues");
      }

      // Generate documentation
      await this.generateDocumentation();

      // Create Forge site if requested
      if (this.config.createForgeSite && this.config.forgeApiKey) {
        await this.createForgeSite();
      }

      // Finalize setup
      await this.finalizeSetup();
      this.rollbackState.gitInitialized = true;

      console.log(
        `✅ Laravel Forge app "${this.config.appName}" created successfully!`,
      );
      console.log(`📁 Project location: ${this.projectPath}`);
      console.log("");
      console.log("💾 Team backup created:");
      console.log("   - All existing team data backed up");
      console.log("   - Backup location: ~/linear-backups/");
      console.log("   - Use 'npm run backup-team' to restore if needed");

      // Always start the local server when done
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      const autoSetup = new AutoSetup(this.projectPath, this.logger);

      // Check prerequisites first
      if (!autoSetup.verifyPrerequisites()) {
        console.log(
          "\n⚠️  Skipping automatic setup due to missing prerequisites",
        );
        console.log("   You can manually run:");
        console.log(
          `   cd ${this.projectPath}/backend && composer install && php artisan migrate && php artisan serve`,
        );
        console.log(
          `   cd ${this.projectPath}/frontend && npm install && npm run dev`,
        );
      } else {
        await autoSetup.runCompleteSetup(true);
      }
    } catch (error) {
      this.logger.error("Error during app creation", error as Error, {
        appName: this.config?.appName,
        projectPath: this.projectPath,
        rollbackState: this.rollbackState,
      });
      console.error("\n❌ Error during app creation:", error.message);
      console.error("📋 Rolling back changes...\n");
      console.error(
        "📝 Check log file for detailed error information:",
        this.logger["logFile"],
      );
      await this.rollback();
      throw error;
    }
  }

  private async importRequirementsIntoLinear(filePath: string): Promise<void> {
    try {
      console.log(`📥 Importing requirements from: ${filePath}`);
      const mod = require(path.join(__dirname, "./requirements-to-issues"));
      if (typeof mod.runImport === "function") {
        await mod.runImport(this.linear, this.config);
      } else if (typeof mod.default === "function") {
        await mod.default(this.linear, this.config);
      } else {
        console.log(
          "⚠️  Requirements importer not found. You can run it manually: npx tsx src/requirements-to-issues.ts",
        );
      }
    } catch (error) {
      console.log("⚠️  Requirements import failed:", (error as any).message);
    }
  }

  /**
   * Rollback all changes made during app creation
   */
  private async rollback(): Promise<void> {
    this.logger.info("Starting rollback process", {
      rollbackState: this.rollbackState,
    });
    console.log("🔄 Starting rollback process...");

    // Remove project directory
    if (
      this.rollbackState.projectDirectory &&
      fs.existsSync(this.rollbackState.projectDirectory)
    ) {
      try {
        console.log(
          `📁 Removing project directory: ${this.rollbackState.projectDirectory}`,
        );
        this.logger.info("Removing project directory", {
          directory: this.rollbackState.projectDirectory,
        });
        fs.rmSync(this.rollbackState.projectDirectory, {
          recursive: true,
          force: true,
        });
        console.log("✅ Project directory removed");
        this.logger.info("Project directory removed successfully");
      } catch (error) {
        this.logger.error(
          "Failed to remove project directory",
          error as Error,
          { directory: this.rollbackState.projectDirectory },
        );
        console.error(
          `⚠️  Could not remove project directory: ${error.message}`,
        );
      }
    }

    // Clean up Linear resources
    if (this.linearAvailable) {
      // Delete created issues
      if (
        this.rollbackState.linearIssuesCreated &&
        this.rollbackState.linearIssuesCreated.length > 0
      ) {
        console.log(
          `🗑️  Deleting ${this.rollbackState.linearIssuesCreated.length} created issues...`,
        );
        for (const issueId of this.rollbackState.linearIssuesCreated) {
          try {
            await this.retryLinearCall(() => this.linear.deleteIssue(issueId));
          } catch (error) {
            console.error(
              `⚠️  Could not delete issue ${issueId}: ${error.message}`,
            );
          }
        }
      }

      // Delete created labels
      if (
        this.rollbackState.linearLabelsCreated &&
        this.rollbackState.linearLabelsCreated.length > 0
      ) {
        console.log(
          `🗑️  Deleting ${this.rollbackState.linearLabelsCreated.length} created labels...`,
        );
        for (const labelId of this.rollbackState.linearLabelsCreated) {
          try {
            await this.retryLinearCall(() =>
              this.linear.deleteIssueLabel(labelId),
            );
          } catch (error) {
            console.error(
              `⚠️  Could not delete label ${labelId}: ${error.message}`,
            );
          }
        }
      }

      // Archive created project (Linear doesn't support project deletion)
      if (this.rollbackState.linearProjectCreated) {
        console.log(`🗑️  Archiving created project...`);
        try {
          await this.retryLinearCall(() =>
            this.linear.updateProject(
              this.rollbackState.linearProjectCreated!,
              {
                state: "canceled",
              },
            ),
          );
        } catch (error) {
          console.error(`⚠️  Could not archive project: ${error.message}`);
        }
      }

      // Note: Cannot delete teams via Linear API
      if (this.rollbackState.linearTeamCreated) {
        console.log(
          `⚠️  Note: Team ${this.rollbackState.linearTeamCreated} was created but cannot be deleted via API`,
        );
        console.log(`   Please manually archive it from Linear if needed`);
      }
    }

    console.log("✅ Rollback completed");
    console.log("💡 If you encounter any issues, please manually check:");
    if (this.rollbackState.projectDirectory) {
      console.log(
        `   - Project directory: ${this.rollbackState.projectDirectory}`,
      );
    }
    if (this.rollbackState.linearTeamCreated) {
      console.log(`   - Linear team: ${this.rollbackState.linearTeamCreated}`);
    }
  }

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

  private savePreferences(preferences: any): void {
    try {
      fs.writeFileSync(
        this.preferencesFile,
        JSON.stringify(preferences, null, 2),
      );
    } catch (error) {
      console.log("⚠️  Could not save preferences:", error.message);
    }
  }

  private async getConfiguration(): Promise<LaravelForgeAppConfig> {
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
        type: "list",
        name: "teamOption",
        message: "Linear team option:",
        choices: [
          { name: "Create new team", value: "new" },
          { name: "Select existing team", value: "existing" },
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

          const teams = await this.retryLinearCall(() => this.linear.teams());
          return teams.nodes.map((team) => ({
            name: team.name,
            value: team.id,
          }));
        },
        when: (answers: any) => answers.teamOption === "existing",
      },
      {
        type: "confirm",
        name: "autoStartServers",
        message:
          "Automatically install dependencies and start servers when done?",
        default: true,
      },
    ]);

    // Build configuration with smart defaults
    const config = {
      ...answers,
      createNewTeam: answers.teamOption === "new",
      forgeApiKey: process.env.FORGE_API_KEY,
      githubRepo: "", // Empty - user creates repo manually after
      // Smart defaults for removed prompts
      enableAIDependencies: true, // Always use AI (fallback to rules)
      customDependencyRules: undefined, // Not needed with AI
      createNewProject: true, // Always create new Linear project
      existingProjectId: undefined, // Not selecting existing
      startDevelopment: true, // Always assign to Cursor agent
      rerunExistingIssues: false, // Don't rerun existing
      createForgeSite: false, // Manual Forge deploy later
      deploymentTarget: "both", // Create both local & production configs
      localDatabaseType: "sqlite", // Easiest for local dev
      databaseType: "forge-postgresql", // Best for production
      forgeDatabaseName: answers.appName
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_"),
      useForgeStorage: !!process.env.FORGE_API_KEY, // Use if Forge available
      forgeStorageBucket: `${answers.appName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")}-storage`,
      repoSubfolder: undefined, // Not needed
      features: ["auth", "profile", "dashboard", "upload", "email", "docs"], // Include everything
      teamOption: answers.teamOption,
      backupFile: undefined, // Not restoring from backup
    };

    console.log("\n🎯 Auto-configured with smart defaults:");
    console.log("   ✅ Database: SQLite (local), PostgreSQL (production)");
    console.log(
      "   ✅ Features: All included (auth, profile, dashboard, upload, email, docs)",
    );
    console.log("   ✅ Dependencies: AI-powered (with rule-based fallback)");
    console.log("   ✅ Repo label: glenn-frank/[team-name] (auto-generated)");
    console.log("   ✅ Linear: New project with Cursor agent assigned");
    console.log("");

    // Save minimal preferences
    this.savePreferences({
      projectDirectory: config.projectDirectory,
    });

    return config as LaravelForgeAppConfig;
  }

  private async createProjectDirectory(): Promise<void> {
    console.log("📁 Creating project directory...");

    // Use the specified project directory
    this.projectPath = path.join(
      this.config.projectDirectory,
      this.config.appName,
    );

    if (fs.existsSync(this.projectPath)) {
      throw new Error(`Directory ${this.projectPath} already exists`);
    }

    fs.mkdirSync(this.projectPath, { recursive: true });
    process.chdir(this.projectPath);

    console.log(`✅ Project will be created at: ${this.projectPath}`);
  }

  private async initializeLaravelBackend(): Promise<void> {
    console.log("🔧 Initializing Laravel backend...");

    // Create Laravel project
    execSync("composer create-project laravel/laravel backend --prefer-dist", {
      stdio: "inherit",
    });

    // Install additional packages
    const packages = [
      "laravel/sanctum",
      "spatie/laravel-permission",
      "intervention/image",
      "league/flysystem-aws-s3-v3",
    ];

    if (this.config.features.includes("email")) {
      packages.push("laravel/horizon");
    }

    execSync(`cd backend && composer require ${packages.join(" ")}`, {
      stdio: "inherit",
    });

    // Generate Sanctum config
    execSync(
      'cd backend && php artisan vendor:publish --provider="Laravel\\Sanctum\\SanctumServiceProvider"',
      { stdio: "inherit" },
    );

    // Create custom controllers
    await this.createLaravelControllers();

    // Create models
    await this.createLaravelModels();

    // Create Form Requests used by AuthController
    await this.createLaravelRequests();

    // Setup routes
    await this.setupLaravelRoutes();

    // Ensure API routes are registered in Laravel 11/12 (bootstrap/app.php)
    try {
      const bootstrapPath = path.join(
        this.projectPath,
        "backend",
        "bootstrap",
        "app.php",
      );
      if (fs.existsSync(bootstrapPath)) {
        let content = fs.readFileSync(bootstrapPath, "utf8");
        if (!content.includes("api:")) {
          // Laravel 12 format: __DIR__.'/../routes/web.php'
          const laravel12 = /web:\s*__DIR__\.'\/\.\.\/routes\/web\.php',/s;
          const laravel11 =
            /web:\s*__DIR__\s*\.\s*['"](?:\/)?\.\.\/(?:\/)?routes\/web\.php['"],/s;
          if (laravel12.test(content)) {
            content = content.replace(
              laravel12,
              `web: __DIR__.'/../routes/web.php',\n        api: __DIR__.'/../routes/api.php',`,
            );
          } else if (laravel11.test(content)) {
            content = content.replace(
              laravel11,
              `web: __DIR__ . '/../routes/web.php',\n        api: __DIR__ . '/../routes/api.php',`,
            );
          }
          fs.writeFileSync(bootstrapPath, content);
        }
      }
    } catch (e) {
      // non-fatal; user can still add manually
    }

    // Create migrations
    await this.createLaravelMigrations();

    // Setup Forge storage configuration
    if (this.config.useForgeStorage) {
      await this.setupForgeStorage();
    }
  }

  private async setupReactFrontend(): Promise<void> {
    console.log("⚛️ Setting up React frontend...");

    // Create React app with TypeScript
    execSync("npx create-react-app frontend --template typescript", {
      stdio: "inherit",
    });

    // Install additional packages
    const packages = [
      "react-router-dom",
      "@tanstack/react-query",
      "axios",
      "zod",
      "react-hook-form",
      "@hookform/resolvers",
      "@types/react-router-dom",
    ];

    execSync(`cd frontend && npm install ${packages.join(" ")}`, {
      stdio: "inherit",
    });

    // Install TailwindCSS v3 and dependencies
    console.log("📦 Installing TailwindCSS v3...");
    execSync(
      `cd frontend && npm install --save-dev tailwindcss@^3 postcss@^8 autoprefixer@^10 --legacy-peer-deps`,
      {
        stdio: "inherit",
      },
    );

    // Install Vite and React plugin as dev dependencies
    console.log("📦 Installing Vite and React plugin...");
    execSync(
      `cd frontend && npm install --save-dev vite @vitejs/plugin-react --legacy-peer-deps`,
      {
        stdio: "inherit",
      },
    );

    // Setup project structure
    await this.createReactStructure();

    // Configure TailwindCSS
    await this.configureTailwindCSS();

    // Create components
    await this.createReactComponents();
  }

  private async configureBuildTools(): Promise<void> {
    console.log("🔨 Configuring build tools...");

    // Create Vite config
    const viteConfig = this.templateLoader.loadTemplate(
      "config/vite.config.ts.template",
    );
    fs.writeFileSync(
      path.join(this.projectPath, "frontend", "vite.config.ts"),
      viteConfig,
    );

    // Update package.json scripts
    const packageJsonPath = path.join(
      this.projectPath,
      "frontend",
      "package.json",
    );
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    packageJson.scripts = {
      ...packageJson.scripts,
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview",
    };

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  }

  private async setupDatabase(): Promise<void> {
    console.log("🗄️ Setting up database...");

    const envPath = path.join(this.projectPath, "backend", ".env");
    let envContent = fs.readFileSync(envPath, "utf8");

    // Generate APP_KEY if not present
    if (
      !envContent.includes("APP_KEY=${appKey}") ||
      (envContent.includes("APP_KEY=${appKey}") &&
        !envContent.includes("base64:"))
    ) {
      console.log("🔑 Generating application key...");
      try {
        execSync("cd backend && php artisan key:generate", {
          stdio: "inherit",
        });
        // Re-read the .env file after key generation
        envContent = fs.readFileSync(envPath, "utf8");
      } catch (error) {
        console.log(
          "⚠️  Could not generate APP_KEY automatically, please run 'php artisan key:generate' manually",
        );
      }
    }

    // Use SQLite for initial setup ONLY if not using PostgreSQL locally
    // If PostgreSQL is selected, we'll set it up in createEnvironmentFiles()
    if (this.config.localDatabaseType !== "postgresql") {
      envContent = envContent.replace(
        "DB_DATABASE=laravel",
        "DB_DATABASE=" +
          path.join(this.projectPath, "backend", "database", "database.sqlite"),
      );

      fs.writeFileSync(envPath, envContent);

      // Run migrations for local development (only for SQLite/MySQL)
      execSync("cd backend && php artisan migrate", { stdio: "inherit" });
    }

    // Create environment files for different deployment targets
    await this.createEnvironmentFiles();
  }

  /**
   * Setup PostgreSQL database for local development
   */
  private async setupPostgreSQLDatabase(): Promise<void> {
    console.log("🐘 Setting up PostgreSQL database...");

    try {
      // Check if PostgreSQL is installed
      execSync("which psql", { stdio: "ignore" });

      const dbName = this.config.appName;
      const dbUser = process.env.USER || "postgres";

      // Try to create the database (uses current system user on macOS)
      try {
        execSync(`createdb ${dbName}`, { stdio: "ignore" });
        console.log(`✅ Created PostgreSQL database: ${dbName}`);
        console.log(`   Using user: ${dbUser}`);
      } catch (error) {
        // Database might already exist, which is fine
        console.log(
          `ℹ️  Database ${dbName} already exists or couldn't be created`,
        );
      }

      // Run migrations with PostgreSQL
      console.log("🔄 Running migrations with PostgreSQL...");
      execSync("cd backend && php artisan migrate", { stdio: "inherit" });
    } catch (error) {
      console.log(
        "⚠️  PostgreSQL setup skipped - ensure PostgreSQL is installed and running",
      );
      console.log("   You can set it up manually or use SQLite instead");
    }
  }

  private async createEnvironmentFiles(): Promise<void> {
    console.log(
      "📝 Creating environment files for different deployment targets...",
    );

    // Generate APP_KEY for all environment files
    const appKey = this.generateAppKey();

    const backendDir = path.join(this.projectPath, "backend");

    // Create .env.local for local development
    if (
      this.config.deploymentTarget === "local" ||
      this.config.deploymentTarget === "both"
    ) {
      const localEnvContent = `APP_NAME="${this.config.appName}"
APP_ENV=local
APP_KEY=${appKey}
APP_DEBUG=true
APP_URL=http://localhost:8000

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

# Local Database Configuration
DB_CONNECTION=${
        this.config.localDatabaseType === "postgresql"
          ? "pgsql"
          : this.config.localDatabaseType
      }
${
  this.config.localDatabaseType === "mysql"
    ? `DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=${this.config.appName}
DB_USERNAME=root
DB_PASSWORD=`
    : this.config.localDatabaseType === "postgresql"
      ? `DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=${this.config.appName}
DB_USERNAME=${process.env.USER || "postgres"}
DB_PASSWORD=`
      : `DB_DATABASE=${path.join(
          this.projectPath,
          "backend",
          "database",
          "database.sqlite",
        )}`
}

# Local Storage Configuration
FILESYSTEM_DISK=local

BROADCAST_DRIVER=log
CACHE_DRIVER=file
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

MEMCACHED_HOST=127.0.0.1

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS="hello@example.com"
MAIL_FROM_NAME="${this.config.appName}"

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=
AWS_USE_PATH_STYLE_ENDPOINT=false

PUSHER_APP_ID=
PUSHER_APP_KEY=${appKey}
PUSHER_APP_SECRET=
PUSHER_HOST=
PUSHER_PORT=443
PUSHER_SCHEME=https
PUSHER_APP_CLUSTER=mt1

VITE_APP_NAME="${this.config.appName}"
VITE_PUSHER_APP_KEY=${appKey}""
VITE_PUSHER_HOST=""
VITE_PUSHER_PORT="443"
VITE_PUSHER_SCHEME="https"
VITE_PUSHER_APP_CLUSTER="mt1"
`;

      fs.writeFileSync(path.join(backendDir, ".env.local"), localEnvContent);

      // Copy .env.local to .env for local development
      fs.copyFileSync(
        path.join(backendDir, ".env.local"),
        path.join(backendDir, ".env"),
      );

      // Setup PostgreSQL database if needed
      if (this.config.localDatabaseType === "postgresql") {
        await this.setupPostgreSQLDatabase();
      }
    }

    // Create .env.production for Forge deployment
    if (
      this.config.deploymentTarget === "forge" ||
      this.config.deploymentTarget === "both"
    ) {
      const productionEnvContent = `APP_NAME="${this.config.appName}"
APP_ENV=production
APP_KEY=${appKey}
APP_DEBUG=false
APP_URL=https://your-domain.com

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=error

# Production Database Configuration (Laravel Forge)
DB_CONNECTION=${this.config.databaseType === "forge-mysql" ? "mysql" : "pgsql"}
DB_HOST=\${FORGE_DB_HOST}
DB_PORT=${this.config.databaseType === "forge-mysql" ? "3306" : "5432"}
DB_DATABASE=${this.config.forgeDatabaseName}
DB_USERNAME=\${FORGE_DB_USERNAME}
DB_PASSWORD=\${FORGE_DB_PASSWORD}

# Production Storage Configuration (Laravel Forge)
FILESYSTEM_DISK=s3
AWS_ACCESS_KEY_ID=\${FORGE_STORAGE_KEY}
AWS_SECRET_ACCESS_KEY=\${FORGE_STORAGE_SECRET}
AWS_DEFAULT_REGION=\${FORGE_STORAGE_REGION}
AWS_BUCKET=${this.config.forgeStorageBucket}
AWS_ENDPOINT=\${FORGE_STORAGE_ENDPOINT}
AWS_USE_PATH_STYLE_ENDPOINT=true

BROADCAST_DRIVER=log
CACHE_DRIVER=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis
SESSION_LIFETIME=120

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS="noreply@your-domain.com"
MAIL_FROM_NAME="${this.config.appName}"

VITE_APP_NAME="${this.config.appName}"
`;

      fs.writeFileSync(
        path.join(backendDir, ".env.production"),
        productionEnvContent,
      );
    }

    // Create deployment script
    const deployScript = `#!/bin/bash

# Laravel Forge Deployment Script
# This script helps you deploy your Laravel app to Forge

echo "🚀 Deploying ${this.config.appName} to Laravel Forge..."

# Copy production environment file
cp .env.production .env

# Install dependencies
composer install --no-dev --optimize-autoloader

# Generate application key
php artisan key:generate

# Run migrations
php artisan migrate --force

# Clear and cache config
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Build frontend assets
cd ../frontend
npm install
npm run build

echo "✅ Deployment complete!"
echo "📝 Don't forget to:"
echo "   1. Set up your domain in Laravel Forge"
echo "   2. Configure SSL certificate"
echo "   3. Set up database and storage credentials"
echo "   4. Configure email settings"
`;

    fs.writeFileSync(path.join(backendDir, "deploy.sh"), deployScript);
    execSync(`chmod +x ${path.join(backendDir, "deploy.sh")}`);

    console.log("✅ Environment files created:");
    if (
      this.config.deploymentTarget === "local" ||
      this.config.deploymentTarget === "both"
    ) {
      console.log("   📄 .env.local - Local development configuration");
    }
    if (
      this.config.deploymentTarget === "forge" ||
      this.config.deploymentTarget === "both"
    ) {
      console.log("   📄 .env.production - Production configuration");
      console.log("   📄 deploy.sh - Deployment script");
    }
  }

  private async createLinearProject(): Promise<void> {
    if (!this.linearAvailable) {
      console.log("⏭️  Skipping Linear project creation - Linear unavailable");
      return;
    }

    console.log("📋 Creating Linear project and issues...");

    let teamId = this.config.teamId;
    let project;

    // Handle team creation or selection
    if (this.config.createNewTeam) {
      console.log(`🏗️  Creating new Linear team: ${this.config.newTeamName}`);
      const newTeam = await this.retryLinearCall(() =>
        this.linear.createTeam({
          name: this.config.newTeamName!,
          description: `Team for ${this.config.appName} development`,
        }),
      );
      teamId = newTeam.id;
      this.rollbackState.linearTeamCreated = teamId;
      console.log(`✅ Created new Linear team: ${newTeam.name}`);
    } else {
      const team = await this.retryLinearCall(() =>
        this.linear.team(this.config.teamId),
      );
      console.log(`✅ Using existing Linear team: ${team.name}`);

      // Analyze existing team for integration opportunities
      await this.analyzeExistingTeam(team);
    }

    // Handle existing project or create new one
    if (
      this.config.createNewProject ||
      this.config.existingProjectId === "new"
    ) {
      // Create new project in Linear
      project = await this.retryLinearCall(() =>
        this.linear.createProject({
          name: `${this.config.appName} - Development`,
          description: this.config.description,
          teamIds: [teamId],
          state: "planned",
        }),
      );
      this.rollbackState.linearProjectCreated = project.id;
      console.log(`✅ Created new Linear project: ${project.name}`);
    } else if (this.config.existingProjectId) {
      // Use existing project
      project = await this.retryLinearCall(() =>
        this.linear.project(this.config.existingProjectId),
      );
      console.log(`✅ Using existing Linear project: ${project.name}`);

      // Analyze existing project for integration opportunities
      await this.analyzeExistingProject(project);
    } else {
      throw new Error("No project selected");
    }

    // Create development issues
    // CRITICAL: Generate repo label from team name - agents use this to know which repo to work in
    // Format: glenn-frank/[team-name]
    const team = await this.retryLinearCall(() => this.linear.team(teamId));
    const repoLabel = `glenn-frank/${team.name
      .toLowerCase()
      .replace(/\s+/g, "-")}`;

    console.log(`📁 Using repo label for all issues: ${repoLabel}`);
    console.log(`   (This tells agents which repository to work in)`);

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
        labels: ["database", "Backend", repoLabel],
        dependencies: [],
        category: "backend",
        complexity: "medium",
      },
      {
        title: "Implement Authentication System",
        description:
          "Create Sanctum-based authentication with login, registration, and password reset",
        priority: 3,
        labels: ["auth", "Backend", "Frontend", repoLabel],
        dependencies: [],
        category: "backend",
        complexity: "high",
      },
      {
        title: "Build Dashboard Page",
        description: "Create dashboard with basic stats and navigation",
        priority: 4,
        labels: ["Frontend", "dashboard", repoLabel],
        dependencies: [],
        category: "frontend",
        complexity: "medium",
      },
      {
        title: "Implement Profile Management",
        description: "Add profile management with photo upload functionality",
        priority: 4,
        labels: ["profile", "upload", "Frontend", repoLabel],
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

    // Check if issues already exist before creating new ones
    const existingIssues = await this.retryLinearCall(() =>
      this.linear.issues({
        filter: { project: { id: { eq: project.id } } },
      }),
    );

    const existingTitles = existingIssues.nodes.map((issue) =>
      issue.title.toLowerCase(),
    );

    // Create issues in dependency order
    const createdIssues: { [key: string]: string } = {}; // title -> id mapping

    for (const issue of issues) {
      // Skip if issue already exists
      if (existingTitles.includes(issue.title.toLowerCase())) {
        console.log(`⏭️  Skipping existing issue: ${issue.title}`);
        // Find the existing issue ID for dependency mapping
        const existingIssue = existingIssues.nodes.find(
          (existing) =>
            existing.title.toLowerCase() === issue.title.toLowerCase(),
        );
        if (existingIssue) {
          createdIssues[issue.title] = existingIssue.id;
        }
        continue;
      }

      // Get label IDs for the issue
      const labelIds: string[] = [];
      for (const labelName of issue.labels) {
        try {
          // Search for labels with TEAM filter to avoid workspace conflicts
          const labels = await this.retryLinearCall(() =>
            this.linear.issueLabels({
              filter: {
                name: { eq: labelName },
                team: { id: { eq: teamId } },
              },
            }),
          );

          // Also try with capitalized first letter
          const capitalizedName =
            labelName.charAt(0).toUpperCase() + labelName.slice(1);
          const capitalizedLabels = await this.retryLinearCall(() =>
            this.linear.issueLabels({
              filter: {
                name: { eq: capitalizedName },
                team: { id: { eq: teamId } },
              },
            }),
          );

          let foundLabel = null;
          if (labels.nodes.length > 0) {
            foundLabel = labels.nodes[0];
          } else if (capitalizedLabels.nodes.length > 0) {
            foundLabel = capitalizedLabels.nodes[0];
          }

          if (foundLabel && foundLabel.id) {
            labelIds.push(foundLabel.id);
          } else {
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

                // Track for rollback
                if (!this.rollbackState.linearLabelsCreated) {
                  this.rollbackState.linearLabelsCreated = [];
                }
                this.rollbackState.linearLabelsCreated.push(newLabel.id);
              }
            } catch (createError) {
              // If label creation fails (workspace conflict), just skip this label
              console.log(
                `⚠️  Skipping label "${labelName}" (workspace conflict)`,
              );
            }
          }
        } catch (error) {
          console.log(
            `⚠️  Could not create/find label "${labelName}":`,
            error.message,
          );
        }
      }

      // Build issue data
      const issueData: any = {
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        projectId: project.id,
        teamId: teamId,
      };

      // Add enhanced description with dependencies
      if (issue.dependencies && issue.dependencies.length > 0) {
        issueData.description += `\n\n**Dependencies:** Must be completed after: ${issue.dependencies.join(
          ", ",
        )}`;
      }

      // Only add labelIds if we have valid ones
      if (labelIds.length > 0) {
        issueData.labelIds = labelIds;
      }

      const createdIssue = await this.retryLinearCall(() =>
        this.linear.createIssue(issueData),
      );
      createdIssues[issue.title] = createdIssue.id;

      // Track for rollback
      if (!this.rollbackState.linearIssuesCreated) {
        this.rollbackState.linearIssuesCreated = [];
      }
      this.rollbackState.linearIssuesCreated.push(createdIssue.id);

      console.log(`✅ Created issue: ${issue.title}`);

      // Add dependencies to the issue
      if (issue.dependencies && issue.dependencies.length > 0) {
        const dependencyIds = issue.dependencies
          .map((depTitle) => createdIssues[depTitle])
          .filter((id) => id); // Only include valid IDs

        if (dependencyIds.length > 0) {
          try {
            await this.retryLinearCall(() =>
              this.linear.updateIssue(createdIssue.id, {
                dependsOn: dependencyIds,
              }),
            );
            console.log(`🔗 Added dependencies to: ${issue.title}`);
          } catch (error) {
            console.log(
              `⚠️  Could not add dependencies to "${issue.title}":`,
              error.message,
            );
          }
        }
      }
    }

    console.log(`📋 Created ${issues.length} development issues`);

    // Assign all issues to Cursor agent if requested
    if (this.config.startDevelopment) {
      console.log("🤖 Assigning all issues to Cursor agent...");

      // Get Cursor agent (assuming it exists in the team)
      try {
        const team = await this.retryLinearCall(() => this.linear.team(teamId));
        const users = await team.users();
        const cursorAgent = users.nodes.find(
          (user: any) =>
            user.name.toLowerCase().includes("cursor") ||
            user.email?.toLowerCase().includes("cursor"),
        );

        if (cursorAgent) {
          // Get all issues in the project (including existing ones)
          const allProjectIssues = await this.retryLinearCall(() =>
            this.linear.issues({
              filter: { project: { id: { eq: project.id } } },
            }),
          );

          // Filter issues to assign
          const issuesToAssign = this.config.rerunExistingIssues
            ? allProjectIssues.nodes // Include existing issues for rerun
            : Object.values(createdIssues)
                .map((id) =>
                  allProjectIssues.nodes.find((issue) => issue.id === id),
                )
                .filter(Boolean); // Only newly created issues

          // Assign issues to Cursor agent
          for (const issue of issuesToAssign) {
            try {
              await this.retryLinearCall(() =>
                this.linear.updateIssue(issue.id, {
                  assigneeId: cursorAgent.id,
                  state: "inProgress", // Set to in progress for rerun
                }),
              );
              console.log(`✅ Assigned "${issue.title}" to Cursor agent`);
            } catch (error) {
              console.log(
                `⚠️  Could not assign "${issue.title}" to Cursor agent:`,
                error.message,
              );
            }
          }

          if (this.config.rerunExistingIssues) {
            console.log(
              "🔄 All issues (including existing) assigned to Cursor agent for rerun!",
            );
          } else {
            console.log(
              "🎯 All new issues assigned to Cursor agent - development can begin!",
            );
          }
        } else {
          console.log(
            "⚠️  Cursor agent not found in team. Please assign issues manually.",
          );
          console.log(
            "   Look for a user with 'cursor' in their name or email.",
          );
        }
      } catch (error) {
        console.log(
          "⚠️  Could not assign issues to Cursor agent:",
          error.message,
        );
        console.log("   Please assign issues manually to start development.");
      }
    } else {
      console.log(
        "📝 Issues created but not assigned. Assign manually to start development.",
      );
    }
  }

  private async backupTeamBeforeChanges(): Promise<void> {
    if (!this.linearAvailable) {
      return;
    }

    console.log("💾 Creating team backup before making changes...");

    try {
      // Get team info
      const teamId = this.config.createNewTeam ? null : this.config.teamId;

      if (!teamId) {
        console.log("⏭️  Skipping backup - creating new team");
        return;
      }

      const team = await this.retryLinearCall(() => this.linear.team(teamId));
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupName = `${team.name} - Pre-App-Creation - ${timestamp}`;

      console.log(`📦 Backing up team: ${team.name}`);

      // Create backup directory
      const backupDir = path.join(
        require("os").homedir(),
        "linear-backups",
        backupName,
      );

      if (!require("fs").existsSync(backupDir)) {
        require("fs").mkdirSync(backupDir, { recursive: true });
      }

      // Backup team data
      const backupData = {
        team: {
          id: team.id,
          name: team.name,
          description: team.description,
          key: team.key,
        },
        timestamp: new Date().toISOString(),
        appName: this.config.appName,
        backupReason: "Pre-app creation backup",
      };

      // Get all team data
      console.log("📊 Collecting team data...");

      // Backup projects
      const projects = await team.projects();
      backupData.projects = projects.nodes.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        state: project.state,
        progress: project.progress,
      }));

      // Backup issues
      const issues = await this.retryLinearCall(() =>
        this.linear.issues({
          filter: { team: { id: { eq: team.id } } },
        }),
      );
      backupData.issues = issues.nodes.map((issue) => ({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        state: issue.state,
        projectId: issue.project?.id,
        assigneeId: issue.assignee?.id,
        labelIds: issue.labels?.nodes?.map((label) => label.id) || [],
      }));

      // Backup labels
      const labels = await this.retryLinearCall(() =>
        this.linear.issueLabels({
          filter: { team: { id: { eq: team.id } } },
        }),
      );
      backupData.labels = labels.nodes.map((label) => ({
        id: label.id,
        name: label.name,
        description: label.description,
        color: label.color,
      }));

      // Save backup file
      const backupFile = path.join(backupDir, `${backupName}-backup.json`);
      require("fs").writeFileSync(
        backupFile,
        JSON.stringify(backupData, null, 2),
      );

      console.log(`✅ Team backup created successfully!`);
      console.log(`📁 Backup location: ${backupFile}`);
      console.log(`📊 Backed up:`);
      console.log(`   - ${backupData.projects.length} projects`);
      console.log(`   - ${backupData.issues.length} issues`);
      console.log(`   - ${backupData.labels.length} labels`);
      console.log("");

      // Ask for confirmation before proceeding
      const { proceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: "Team backup complete. Proceed with creating new issues?",
          default: true,
        },
      ]);

      if (!proceed) {
        throw new Error("App creation cancelled by user");
      }
    } catch (error) {
      console.log("⚠️  Could not create team backup:", error.message);
      console.log("   Continuing with app creation...");
      console.log("");
    }
  }

  private async restoreTeamFromBackup(): Promise<void> {
    if (!this.linearAvailable || !this.config.backupFile) {
      console.log(
        "⏭️  Skipping team restore - Linear unavailable or no backup file",
      );
      return;
    }

    console.log("🔄 Restoring team from backup...");

    try {
      // Find backup file in the selected directory
      const backupDir = this.config.backupFile;
      const files = require("fs").readdirSync(backupDir);
      const backupFile = files.find((file: string) =>
        file.endsWith("-backup.json"),
      );

      if (!backupFile) {
        throw new Error("No backup file found in selected directory");
      }

      const backupPath = path.join(backupDir, backupFile);
      const backupData = JSON.parse(
        require("fs").readFileSync(backupPath, "utf8"),
      );

      console.log(`📦 Restoring team: ${backupData.team.name}`);
      console.log(`📅 Backup date: ${backupData.timestamp}`);

      // Create new team with backup name
      const newTeam = await this.retryLinearCall(() =>
        this.linear.createTeam({
          name: backupData.team.name + " - Restored",
          description: backupData.team.description + " (Restored from backup)",
          key: backupData.team.key + "-RESTORED",
        }),
      );

      console.log(`✅ Created restored team: ${newTeam.name}`);

      // Restore labels
      console.log("🏷️  Restoring labels...");
      const labelMap: { [oldId: string]: string } = {};
      for (const label of backupData.labels) {
        const newLabel = await this.retryLinearCall(() =>
          this.linear.createIssueLabel({
            name: label.name,
            description: label.description,
            color: label.color,
            teamId: newTeam.id,
          }),
        );
        labelMap[label.id] = newLabel.id;
        console.log(`✅ Restored label: ${label.name}`);
      }

      // Restore projects
      console.log("📁 Restoring projects...");
      const projectMap: { [oldId: string]: string } = {};
      for (const project of backupData.projects) {
        const newProject = await this.retryLinearCall(() =>
          this.linear.createProject({
            name: project.name,
            description: project.description,
            state: project.state,
            teamId: newTeam.id,
          }),
        );
        projectMap[project.id] = newProject.id;
        console.log(`✅ Restored project: ${project.name}`);
      }

      // Restore issues
      console.log("📝 Restoring issues...");
      const issueMap: { [oldId: string]: string } = {};
      for (const issue of backupData.issues) {
        const issueData: any = {
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          teamId: newTeam.id,
        };

        // Map project ID
        if (issue.projectId && projectMap[issue.projectId]) {
          issueData.projectId = projectMap[issue.projectId];
        }

        // Map label IDs
        if (issue.labelIds && issue.labelIds.length > 0) {
          issueData.labelIds = issue.labelIds
            .map((oldId: string) => labelMap[oldId])
            .filter((id: string) => id);
        }

        const newIssue = await this.retryLinearCall(() =>
          this.linear.createIssue(issueData),
        );
        issueMap[issue.id] = newIssue.id;
        console.log(`✅ Restored issue: ${issue.title}`);
      }

      // Restore dependencies
      console.log("🔗 Restoring issue dependencies...");
      for (const issue of backupData.issues) {
        if (issue.dependsOn && issue.dependsOn.length > 0) {
          const dependencyIds = issue.dependsOn
            .map((oldId: string) => issueMap[oldId])
            .filter((id: string) => id);

          if (dependencyIds.length > 0) {
            try {
              await this.retryLinearCall(() =>
                this.linear.updateIssue(issueMap[issue.id], {
                  dependsOn: dependencyIds,
                }),
              );
              console.log(`🔗 Restored dependencies for: ${issue.title}`);
            } catch (error) {
              console.log(
                `⚠️  Could not restore dependencies for "${issue.title}":`,
                error.message,
              );
            }
          }
        }
      }

      console.log("🎉 Team restoration completed!");
      console.log(`📋 Restored team: ${newTeam.name}`);
      console.log(`🔗 Team URL: https://linear.app/${newTeam.key}`);
      console.log(`📊 Restored:`);
      console.log(`   - ${backupData.projects.length} projects`);
      console.log(`   - ${backupData.issues.length} issues`);
      console.log(`   - ${backupData.labels.length} labels`);
    } catch (error) {
      console.log("❌ Could not restore team from backup:", error.message);
      console.log("   Continuing with app creation...");
      console.log("");
    }
  }

  /**
   * Test Linear API connection with retry logic
   *
   * Attempts to connect to Linear API and offers graceful degradation if connection fails.
   * Sets linearAvailable flag to false if user chooses to continue without Linear.
   *
   * @throws {Error} If connection fails and user chooses not to continue
   * @private
   */
  private async testLinearConnection(): Promise<void> {
    console.log("🔗 Testing Linear connection...");

    try {
      // Test with retry mechanism
      await this.retryLinearCall(() => this.linear.teams());
      console.log("✅ Linear connection successful");
    } catch (error) {
      console.log("❌ Linear connection failed");
      console.log("   Error:", error.message);
      console.log("   Possible causes:");
      console.log("   - Network connectivity issues");
      console.log("   - Invalid LINEAR_API_KEY");
      console.log("   - Linear API service unavailable");
      console.log("   - Firewall blocking HTTPS requests");
      console.log("");
      console.log("   Troubleshooting steps:");
      console.log("   1. Check your internet connection");
      console.log("   2. Verify LINEAR_API_KEY in .env file");
      console.log("   3. Try again in a few minutes");
      console.log("   4. Check if Linear is accessible in browser");
      console.log("");

      const { continueAnyway } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueAnyway",
          message: "Continue without Linear integration?",
          default: false,
        },
      ]);

      if (!continueAnyway) {
        throw new Error("Linear connection required for app creation");
      }

      console.log("⚠️  Continuing without Linear integration...");
      this.linearAvailable = false;
    }
  }

  /**
   * Retry Linear API calls with exponential backoff
   *
   * Implements a robust retry mechanism for Linear API calls that may fail due to:
   * - Network transient issues
   * - Rate limiting
   * - Temporary service unavailability
   *
   * Uses exponential backoff: delays double after each retry (1s, 2s, 4s, etc.)
   *
   * @template T - Return type of the operation
   * @param operation - Async operation to retry
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @param delayMs - Initial delay in milliseconds (default: 1000)
   * @returns Promise that resolves with operation result
   * @throws {Error} The last error if all retries fail
   * @private
   *
   * @example
   * ```typescript
   * const team = await this.retryLinearCall(() => this.linear.team(teamId));
   * ```
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
        lastError = error;

        if (attempt === maxRetries) {
          throw error;
        }

        console.log(
          `   ⚠️  Attempt ${attempt} failed, retrying in ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      }
    }

    throw lastError!;
  }

  private generateAppKey(): string {
    // Generate a random 32-byte key and encode it as base64
    const crypto = require("crypto");
    const key = crypto.randomBytes(32);
    return "base64:" + key.toString("base64");
  }

  private extractRepoPath(githubUrl: string | undefined): string {
    // Handle empty or undefined GitHub URL
    if (!githubUrl || !githubUrl.trim()) {
      return this.config.appName; // Use app name as fallback
    }

    try {
      // Handle various GitHub URL formats
      // https://github.com/owner/repo.git
      // https://github.com/owner/repo
      // git@github.com:owner/repo.git
      // owner/repo

      let repoPath = githubUrl;

      // Remove protocol and domain
      if (repoPath.includes("github.com/")) {
        repoPath = repoPath.split("github.com/")[1];
      } else if (repoPath.includes("github.com:")) {
        repoPath = repoPath.split("github.com:")[1];
      }

      // Remove .git suffix
      repoPath = repoPath.replace(/\.git$/, "");

      // Extract owner/repo
      const parts = repoPath.split("/");
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }

      // Fallback for simple owner/repo format
      if (parts.length === 1 && repoPath.includes("/")) {
        return repoPath;
      }

      return repoPath;
    } catch (error) {
      console.log(`⚠️  Could not extract repo path from: ${githubUrl}`);
      return this.config.appName; // Use app name as fallback
    }
  }

  private async detectDependenciesWithAI(
    issues: IssueWithDependencies[],
  ): Promise<IssueWithDependencies[]> {
    console.log("🤖 Analyzing dependencies with AI...");

    try {
      const OpenAI = require("openai");
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `You are an expert software architect analyzing development tasks for dependency relationships.

Project: ${this.config.appName}
Description: ${this.config.description}
Framework: Laravel + React + TypeScript

Tasks to analyze:
${issues
  .map(
    (issue, index) =>
      `${index + 1}. ${issue.title}
   Description: ${issue.description}
   Category: ${issue.category}
   Complexity: ${issue.complexity}`,
  )
  .join("\n")}

Please analyze these tasks and determine logical dependencies. Consider:
1. Infrastructure tasks (setup, environment) should come first
2. Backend tasks (database, auth) before frontend tasks
3. Core functionality before advanced features
4. Development before deployment

Return ONLY a JSON array with this exact format:
[
  {
    "title": "Task Title",
    "dependencies": ["Dependency Title 1", "Dependency Title 2"]
  }
]

Rules:
- Use exact task titles from the input
- Include only logical, necessary dependencies
- Don't create circular dependencies
- Keep dependencies minimal but meaningful
- Infrastructure tasks should have no dependencies`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("No response from AI");
      }

      // Parse AI response
      const dependencyMap = JSON.parse(aiResponse);

      // Apply AI-detected dependencies
      const enhancedIssues = issues.map((issue) => {
        const aiTask = dependencyMap.find(
          (task: any) => task.title === issue.title,
        );
        return {
          ...issue,
          dependencies: aiTask?.dependencies || [],
        };
      });

      console.log("✅ AI dependency analysis completed");
      return enhancedIssues;
    } catch (error) {
      console.log(
        "⚠️  AI dependency detection failed, falling back to rule-based detection",
      );
      console.log(`   Error: ${error.message}`);
      return this.detectDependenciesWithRules(issues);
    }
  }

  private detectDependenciesWithRules(
    issues: IssueWithDependencies[],
  ): IssueWithDependencies[] {
    console.log("📋 Analyzing dependencies with rules...");

    // Define dependency rules
    const dependencyRules = {
      // Infrastructure dependencies
      "Setup Development Environment": [],

      // Backend dependencies
      "Setup Database Schema": ["Setup Development Environment"],
      "Implement Authentication System": ["Setup Database Schema"],

      // Frontend dependencies
      "Build Dashboard Page": ["Implement Authentication System"],
      "Implement Profile Management": ["Build Dashboard Page"],

      // Deployment dependencies
      "Configure Build Pipeline": ["Implement Profile Management"],
    };

    // Apply custom rules if provided
    if (
      this.config.customDependencyRules &&
      this.config.customDependencyRules.length > 0
    ) {
      console.log("🔧 Applying custom dependency rules");
      // Parse custom rules and merge with default rules
      // Format: "Task A depends on Task B, Task C"
    }

    // Apply rule-based dependencies
    const enhancedIssues = issues.map((issue) => {
      const dependencies =
        dependencyRules[issue.title as keyof typeof dependencyRules] || [];
      return {
        ...issue,
        dependencies,
      };
    });

    console.log("✅ Rule-based dependency analysis completed");
    return enhancedIssues;
  }

  private async analyzeExistingTeam(team: any): Promise<void> {
    console.log(
      "🔍 Analyzing existing Linear team for integration opportunities...",
    );

    try {
      // Get team issues
      const issues = await team.issues();
      const existingIssues = issues.nodes;

      console.log(`📊 Found ${existingIssues.length} existing issues in team`);

      if (existingIssues.length > 0) {
        // Analyze issue labels and priorities
        const labelCounts: { [key: string]: number } = {};
        const priorityCounts: { [key: string]: number } = {};
        const projectCounts: { [key: string]: number } = {};

        existingIssues.forEach((issue: any) => {
          // Count labels
          issue.labels?.nodes?.forEach((label: any) => {
            labelCounts[label.name] = (labelCounts[label.name] || 0) + 1;
          });

          // Count priorities
          const priority = issue.priority || "No Priority";
          priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;

          // Count projects
          if (issue.project) {
            projectCounts[issue.project.name] =
              (projectCounts[issue.project.name] || 0) + 1;
          }
        });

        console.log("📈 Existing team analysis:");
        console.log(
          "   Labels:",
          Object.entries(labelCounts)
            .map(([label, count]) => `${label}: ${count}`)
            .join(", "),
        );
        console.log(
          "   Priorities:",
          Object.entries(priorityCounts)
            .map(([priority, count]) => `${priority}: ${count}`)
            .join(", "),
        );
        console.log(
          "   Projects:",
          Object.entries(projectCounts)
            .map(([project, count]) => `${project}: ${count}`)
            .join(", "),
        );

        // Suggest integration points
        const suggestions = this.generateTeamIntegrationSuggestions(
          labelCounts,
          priorityCounts,
          projectCounts,
        );
        if (suggestions.length > 0) {
          console.log("💡 Team integration suggestions:");
          suggestions.forEach((suggestion) =>
            console.log(`   - ${suggestion}`),
          );
        }
      }

      // Check for existing projects
      const projects = await team.projects();
      if (projects.nodes.length > 0) {
        console.log(
          `🎯 Found ${projects.nodes.length} existing projects in team`,
        );
        console.log(
          "   Consider aligning Laravel app development with existing project structure",
        );
      }
    } catch (error) {
      console.log("⚠️  Could not analyze existing team:", error.message);
    }
  }

  private generateTeamIntegrationSuggestions(
    labelCounts: { [key: string]: number },
    priorityCounts: { [key: string]: number },
    projectCounts: { [key: string]: number },
  ): string[] {
    const suggestions: string[] = [];

    // Check for common Laravel/React related labels
    const laravelLabels = ["backend", "api", "database", "auth", "laravel"];
    const reactLabels = ["frontend", "ui", "react", "typescript", "component"];

    const hasLaravelWork = laravelLabels.some(
      (label) => labelCounts[label] > 0,
    );
    const hasReactWork = reactLabels.some((label) => labelCounts[label] > 0);

    if (hasLaravelWork && hasReactWork) {
      suggestions.push(
        "Team has both backend and frontend work - perfect fit for Laravel + React app",
      );
    } else if (hasLaravelWork) {
      suggestions.push(
        "Team has backend work - consider integrating with existing Laravel components",
      );
    } else if (hasReactWork) {
      suggestions.push(
        "Team has frontend work - consider integrating with existing React components",
      );
    }

    // Check for high priority issues
    const highPriorityCount =
      priorityCounts["High"] || priorityCounts["Urgent"] || 0;
    if (highPriorityCount > 0) {
      suggestions.push(
        `${highPriorityCount} high priority issues exist - consider addressing these first`,
      );
    }

    // Check for specific feature labels
    const featureLabels = ["dashboard", "profile", "auth", "upload", "email"];
    const existingFeatures = featureLabels.filter(
      (label) => labelCounts[label] > 0,
    );
    if (existingFeatures.length > 0) {
      suggestions.push(
        `Existing work on: ${existingFeatures.join(
          ", ",
        )} - align Laravel app features accordingly`,
      );
    }

    // Check for multiple projects
    const projectCount = Object.keys(projectCounts).length;
    if (projectCount > 1) {
      suggestions.push(
        `Team has ${projectCount} active projects - consider project organization and dependencies`,
      );
    }

    return suggestions;
  }

  private async analyzeExistingProject(project: any): Promise<void> {
    console.log(
      "🔍 Analyzing existing Linear project for integration opportunities...",
    );

    try {
      // Get existing issues
      const issues = await project.issues();
      const existingIssues = issues.nodes;

      console.log(
        `📊 Found ${existingIssues.length} existing issues in project`,
      );

      if (existingIssues.length > 0) {
        // Analyze issue labels and priorities
        const labelCounts: { [key: string]: number } = {};
        const priorityCounts: { [key: string]: number } = {};

        existingIssues.forEach((issue: any) => {
          // Count labels
          issue.labels?.nodes?.forEach((label: any) => {
            labelCounts[label.name] = (labelCounts[label.name] || 0) + 1;
          });

          // Count priorities
          const priority = issue.priority || "No Priority";
          priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
        });

        console.log("📈 Existing project analysis:");
        console.log(
          "   Labels:",
          Object.entries(labelCounts)
            .map(([label, count]) => `${label}: ${count}`)
            .join(", "),
        );
        console.log(
          "   Priorities:",
          Object.entries(priorityCounts)
            .map(([priority, count]) => `${priority}: ${count}`)
            .join(", "),
        );

        // Suggest integration points
        const suggestions = this.generateIntegrationSuggestions(
          labelCounts,
          priorityCounts,
        );
        if (suggestions.length > 0) {
          console.log("💡 Integration suggestions:");
          suggestions.forEach((suggestion) =>
            console.log(`   - ${suggestion}`),
          );
        }
      }

      // Skip milestones check for now - API method not available
      console.log("   Skipping milestones analysis (API method not available)");
    } catch (error) {
      console.log("⚠️  Could not analyze existing project:", error.message);
    }
  }

  private generateIntegrationSuggestions(
    labelCounts: { [key: string]: number },
    priorityCounts: { [key: string]: number },
  ): string[] {
    const suggestions: string[] = [];

    // Check for common Laravel/React related labels
    const laravelLabels = ["backend", "api", "database", "auth", "laravel"];
    const reactLabels = ["frontend", "ui", "react", "typescript", "component"];

    const hasLaravelWork = laravelLabels.some(
      (label) => labelCounts[label] > 0,
    );
    const hasReactWork = reactLabels.some((label) => labelCounts[label] > 0);

    if (hasLaravelWork && hasReactWork) {
      suggestions.push(
        "Existing project has both backend and frontend work - perfect fit for Laravel + React app",
      );
    } else if (hasLaravelWork) {
      suggestions.push(
        "Existing project has backend work - consider integrating with existing Laravel components",
      );
    } else if (hasReactWork) {
      suggestions.push(
        "Existing project has frontend work - consider integrating with existing React components",
      );
    }

    // Check for high priority issues
    const highPriorityCount =
      priorityCounts["High"] || priorityCounts["Urgent"] || 0;
    if (highPriorityCount > 0) {
      suggestions.push(
        `${highPriorityCount} high priority issues exist - consider addressing these first`,
      );
    }

    // Check for specific feature labels
    const featureLabels = ["dashboard", "profile", "auth", "upload", "email"];
    const existingFeatures = featureLabels.filter(
      (label) => labelCounts[label] > 0,
    );
    if (existingFeatures.length > 0) {
      suggestions.push(
        `Existing work on: ${existingFeatures.join(
          ", ",
        )} - align Laravel app features accordingly`,
      );
    }

    return suggestions;
  }

  private async generateDocumentation(): Promise<void> {
    console.log("📚 Generating documentation...");

    const readmeContent = `# ${this.config.appName}

${this.config.description}

## Technology Stack

- **Backend**: Laravel 11.x with Sanctum authentication
- **Frontend**: React 18.x with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS v4
- **State Management**: React Query (TanStack Query)
- **Form Validation**: Zod schemas
- **Database**: ${this.config.databaseType}${
      this.config.databaseType.startsWith("forge-") ? ` (Laravel Forge)` : ""
    }${
      this.config.forgeDatabaseName ? ` - ${this.config.forgeDatabaseName}` : ""
    }

## Features

${this.config.features.map((feature) => `- ${feature}`).join("\n")}

## Quick Start

### Local Development

\`\`\`bash
# Backend Setup
cd backend
composer install
cp .env.local .env
php artisan key:generate
php artisan migrate
php artisan serve

# Frontend Setup (in another terminal)
cd frontend
npm install
npm run dev
\`\`\`

### GitHub Repository Setup

After your app is created, you can connect it to GitHub:

\`\`\`bash
# Create a new repository on GitHub, then:
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
\`\`\`

### Production Deployment

\`\`\`bash
# Deploy to Laravel Forge
cd backend
./deploy.sh
\`\`\`

## Development

- Backend runs on: http://localhost:8000
- Frontend runs on: http://localhost:3000
- API endpoints: http://localhost:8000/api

## Deployment

${
  this.config.deploymentTarget === "forge"
    ? "This project is configured for Laravel Forge deployment only."
    : this.config.deploymentTarget === "local"
      ? "This project is configured for local development only."
      : "This project supports both local development and Laravel Forge deployment."
}

## Laravel Forge Configuration

${
  this.config.databaseType.startsWith("forge-") || this.config.useForgeStorage
    ? `### Database
${
  this.config.databaseType.startsWith("forge-")
    ? `- **Type**: ${this.config.databaseType
        .replace("forge-", "")
        .toUpperCase()}
- **Name**: ${this.config.forgeDatabaseName}
- **Environment Variables**: FORGE_DB_HOST, FORGE_DB_USERNAME, FORGE_DB_PASSWORD`
    : "Using local database"
}

### Storage
${
  this.config.useForgeStorage
    ? `- **Type**: Laravel Forge Storage (S3-compatible)
- **Bucket**: ${this.config.forgeStorageBucket}
- **Environment Variables**: FORGE_STORAGE_KEY, FORGE_STORAGE_SECRET, FORGE_STORAGE_REGION, FORGE_STORAGE_ENDPOINT`
    : "Using local storage"
}

### Environment Setup
Add the following environment variables to your Laravel Forge server:
${
  this.config.databaseType.startsWith("forge-")
    ? `
\`\`\`bash
# Database Configuration
FORGE_DB_HOST=your-forge-db-host
FORGE_DB_USERNAME=your-forge-db-username
FORGE_DB_PASSWORD=your-forge-db-password
\`\`\``
    : ""
}${
        this.config.useForgeStorage
          ? `
\`\`\`bash
# Storage Configuration (Laravel Forge provides these automatically)
FORGE_STORAGE_KEY=your-forge-storage-key
FORGE_STORAGE_SECRET=your-forge-storage-secret
FORGE_STORAGE_REGION=us-east-1
FORGE_STORAGE_ENDPOINT=https://your-forge-storage-endpoint.com
\`\`\``
          : ""
      }`
    : "No Laravel Forge configuration required."
}

## Project Structure

\`\`\`
${this.config.appName}/
├── backend/                 # Laravel backend
│   ├── app/
│   ├── config/
│   ├── database/
│   └── routes/
├── frontend/               # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── .cursorrules            # AI agent dependency rules
└── README.md
\`\`\`

## AI Agent Integration (Cursor/Claude)

This project includes dependency management rules for AI agents in \`.cursorrules\`.

### MCP Server Connection

To connect Cursor to the Linear Admin MCP server for issue management:

1. **Start the MCP server** (in linearadmin directory):
\`\`\`bash
cd ~/Documents/apps/linearadmin
npm run mcp:server
\`\`\`

2. **Configure Cursor** (Settings → MCP):
\`\`\`json
{
  "mcpServers": {
    "linear-admin": {
      "command": "node",
      "args": [
        "/Users/glennrenda/Documents/apps/linearadmin/node_modules/.bin/tsx",
        "/Users/glennrenda/Documents/apps/linearadmin/src/mcp-server.ts"
      ],
      "env": {
        "LINEAR_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key",
        "LINEAR_TEAM_ID": "your-team-id"
      }
    }
  }
}
\`\`\`

3. **Reload Cursor**: \`Cmd+Shift+P\` → "Developer: Reload Window"

### Available Commands

Once connected, you can use natural language:

\`\`\`
"Create an issue for this bug"
"Search for authentication issues"
"What can I work on next?"
"Check if issue #123 has blockers"
"Create these issues in order: Setup, Build, Test"
"Add Security label to issue #456"
"Close issue #789 as completed"
\`\`\`

The AI agent will:
- ✅ Check for blockers before starting work
- ✅ Search for duplicates before creating issues
- ✅ Create issues with proper dependencies
- ✅ Only suggest unblocked work
- ✅ Report what's unblocked after completion

## Contributing

1. Create a feature branch
2. Make your changes
3. Test your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.
`;

    fs.writeFileSync(path.join(this.projectPath, "README.md"), readmeContent);
  }

  private async finalizeSetup(): Promise<void> {
    console.log("🎯 Finalizing setup...");

    // Copy .cursorrules for dependency-aware agent behavior
    console.log("🤖 Setting up AI agent rules...");
    const cursorrulesSrc = path.join(__dirname, "..", ".cursorrules.template");
    const cursorrulesDest = path.join(this.projectPath, ".cursorrules");

    if (fs.existsSync(cursorrulesSrc)) {
      fs.copyFileSync(cursorrulesSrc, cursorrulesDest);
      console.log("✅ AI agent rules configured for dependency management");
    } else {
      console.log(
        "⚠️  .cursorrules.template not found, skipping agent rules setup",
      );
    }

    // Create .gitignore
    const gitignoreContent = `# Laravel
backend/.env
backend/vendor/
backend/storage/logs/
backend/storage/framework/cache/
backend/storage/framework/sessions/
backend/storage/framework/views/
backend/bootstrap/cache/

# React
frontend/node_modules/
frontend/build/
frontend/dist/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# nyc test coverage
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test
.env.production

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/
`;

    fs.writeFileSync(
      path.join(this.projectPath, ".gitignore"),
      gitignoreContent,
    );

    // Initialize git repository
    execSync("git init", { stdio: "inherit" });

    // Set default branch to main
    execSync("git branch -M main", { stdio: "inherit" });

    execSync("git add .", { stdio: "inherit" });
    execSync(
      'git commit -m "Initial commit: Laravel + React + TypeScript setup"',
      { stdio: "inherit" },
    );

    console.log("✅ Git repository initialized with main branch");
    console.log("✅ Project setup complete!");
  }

  private async publishToGitHub(): Promise<void> {
    console.log("📤 Publishing to GitHub...");

    if (!this.config.githubRepo) {
      console.log(
        "⚠️  No GitHub repository URL provided, skipping GitHub publish",
      );
      return;
    }

    try {
      // Extract username and repo from the GitHub URL
      const githubUrl = this.config.githubRepo;
      const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);

      if (!urlMatch) {
        console.log("⚠️  Invalid GitHub URL format, skipping GitHub publish");
        return;
      }

      const [, username, repo] = urlMatch;
      const remoteUrl = `https://github.com/${username}/${repo}.git`;

      console.log(`🔗 Setting up GitHub remote: ${remoteUrl}`);
      execSync(`git remote add origin ${remoteUrl}`, {
        cwd: this.projectPath,
        stdio: "inherit",
      });

      console.log("📤 Pushing to GitHub...");
      execSync("git push -u origin main", {
        cwd: this.projectPath,
        stdio: "inherit",
      });

      console.log("✅ Published to GitHub successfully!");
      console.log(`🔗 Repository URL: https://github.com/${username}/${repo}`);
      console.log(
        "💡 Your code is now on GitHub with 'main' as the default branch",
      );
    } catch (error) {
      console.log("⚠️  Could not publish to GitHub:", error.message);
      console.log("   You can publish manually later using:");
      console.log(`   cd ${this.config.appName}`);
      console.log(`   git remote add origin ${this.config.githubRepo}`);
      console.log("   git push -u origin main");
    }
  }

  private async setupGitHubRemote(): Promise<void> {
    try {
      const { githubUsername, githubRepo } = await inquirer.prompt([
        {
          type: "input",
          name: "githubUsername",
          message: "GitHub username:",
          validate: (input: string) => {
            if (!input.trim()) return "GitHub username is required";
            return true;
          },
        },
        {
          type: "input",
          name: "githubRepo",
          message: "GitHub repository name:",
          default: this.config.appName,
          validate: (input: string) => {
            if (!input.trim()) return "Repository name is required";
            return true;
          },
        },
      ]);

      const remoteUrl = `https://github.com/${githubUsername}/${githubRepo}.git`;

      console.log("🔗 Setting up GitHub remote...");
      execSync(`git remote add origin ${remoteUrl}`, {
        cwd: this.projectPath,
        stdio: "inherit",
      });

      console.log("📤 Pushing to GitHub...");
      execSync("git push -u origin main", {
        cwd: this.projectPath,
        stdio: "inherit",
      });

      console.log("✅ GitHub remote configured successfully!");
      console.log(
        `🔗 Repository URL: https://github.com/${githubUsername}/${githubRepo}`,
      );
      console.log(
        "💡 Your code is now on GitHub with 'main' as the default branch",
      );
    } catch (error) {
      console.log("⚠️  Could not set up GitHub remote:", error.message);
      console.log(
        "   You can set it up manually later using the commands shown above",
      );
    }
  }

  private async setupGitHubRemoteFromConfig(): Promise<void> {
    try {
      console.log("🔗 Setting up GitHub remote from configuration...");

      // Extract username and repo from the GitHub URL
      const githubUrl = this.config.githubRepo;
      const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);

      if (!urlMatch) {
        throw new Error("Invalid GitHub URL format");
      }

      const [, username, repo] = urlMatch;
      const remoteUrl = `https://github.com/${username}/${repo}.git`;

      execSync(`git remote add origin ${remoteUrl}`, {
        cwd: this.projectPath,
        stdio: "inherit",
      });

      console.log("📤 Pushing to GitHub...");
      execSync("git push -u origin main", {
        cwd: this.projectPath,
        stdio: "inherit",
      });

      console.log("✅ GitHub remote configured successfully!");
      console.log(`🔗 Repository URL: https://github.com/${username}/${repo}`);
      console.log(
        "💡 Your code is now on GitHub with 'main' as the default branch",
      );
    } catch (error) {
      console.log("⚠️  Could not set up GitHub remote:", error.message);
      console.log(
        "   You can set it up manually later using the commands shown above",
      );
    }
  }

  private async createForgeSite(): Promise<void> {
    console.log("🚀 Creating Laravel Forge site...");

    if (!this.config.forgeApiKey) {
      console.log("❌ No Forge API key found in environment variables");
      console.log("   Please add FORGE_API_KEY to your .env file");
      return;
    }

    if (!this.config.githubRepo || !this.config.githubRepo.trim()) {
      console.log("❌ No GitHub repository URL configured");
      console.log("   Forge deployment requires a GitHub repository");
      console.log(
        "   Create your GitHub repo first, then manually deploy to Forge",
      );
      return;
    }

    try {
      // Extract repository info from GitHub URL
      const githubUrl = this.config.githubRepo;
      const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);

      if (!urlMatch) {
        throw new Error("Invalid GitHub URL format for Forge integration");
      }

      const [, username, repo] = urlMatch;
      const repository = `${username}/${repo}`;

      console.log(`📦 Repository: ${repository}`);
      console.log(
        `🔑 Using Forge API key: ${this.config.forgeApiKey?.substring(0, 8)}...`,
      );

      // Forge API endpoints
      const forgeApiBase = "https://forge.laravel.com/api/v1";
      const headers = {
        Authorization: `Bearer ${this.config.forgeApiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      // Get servers and let user select one
      console.log("🔍 Fetching Forge servers...");
      const serversResponse = await fetch(`${forgeApiBase}/servers`, {
        headers,
      });

      if (!serversResponse.ok) {
        throw new Error(
          `Failed to fetch servers: ${serversResponse.statusText}`,
        );
      }

      const servers = await serversResponse.json();

      if (!servers.servers || servers.servers.length === 0) {
        throw new Error("No servers found in your Forge account");
      }

      // Let user select server
      const { selectedServer } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedServer",
          message: "Select Forge server:",
          choices: servers.servers.map((server: any) => ({
            name: `${server.name} (${server.ip_address})`,
            value: server,
          })),
        },
      ]);

      const server = selectedServer;
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

      const siteResponse = await fetch(
        `${forgeApiBase}/servers/${server.id}/sites`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(siteData),
        },
      );

      if (!siteResponse.ok) {
        const errorText = await siteResponse.text();
        throw new Error(
          `Failed to create site: ${siteResponse.statusText} - ${errorText}`,
        );
      }

      const site = await siteResponse.json();

      console.log("✅ Forge site created successfully!");
      console.log(`🌐 Site URL: https://${siteData.domain}`);
      console.log(
        `🔗 Forge Dashboard: https://forge.laravel.com/servers/${server.id}/sites/${site.site.id}`,
      );
      console.log(`📊 Site ID: ${site.site.id}`);

      // Enable SSL
      console.log("🔒 Enabling SSL certificate...");
      try {
        const sslResponse = await fetch(
          `${forgeApiBase}/servers/${server.id}/sites/${site.site.id}/ssl`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              type: "letsencrypt",
            }),
          },
        );

        if (sslResponse.ok) {
          console.log("✅ SSL certificate enabled");
        } else {
          console.log(
            "⚠️  SSL certificate setup failed (you can enable it manually)",
          );
        }
      } catch (sslError) {
        console.log("⚠️  SSL certificate setup failed:", sslError.message);
      }

      // Deploy the site
      console.log("🚀 Deploying site...");
      try {
        const deployResponse = await fetch(
          `${forgeApiBase}/servers/${server.id}/sites/${site.site.id}/deploy`,
          {
            method: "POST",
            headers,
          },
        );

        if (deployResponse.ok) {
          console.log("✅ Site deployment initiated");
        } else {
          console.log(
            "⚠️  Deployment failed (you can deploy manually from Forge dashboard)",
          );
        }
      } catch (deployError) {
        console.log("⚠️  Deployment failed:", deployError.message);
      }

      console.log("");
      console.log("🎉 Laravel Forge site setup complete!");
      console.log(`📋 Next steps:`);
      console.log(`1. Wait for deployment to complete`);
      console.log(`2. Visit https://${siteData.domain}`);
      console.log(`3. Configure environment variables in Forge dashboard`);
      console.log(`4. Set up domain DNS if needed`);
    } catch (error) {
      console.log("❌ Could not create Forge site:", error.message);
      console.log("   You can create it manually from the Forge dashboard");
      console.log("   Make sure your GitHub repository is accessible");
    }
  }

  // Helper methods for creating specific files
  private async createLaravelControllers(): Promise<void> {
    const controllersDir = path.join(
      this.projectPath,
      "backend",
      "app",
      "Http",
      "Controllers",
    );

    // Load controller templates
    const authController = this.templateLoader.loadTemplate(
      "laravel/AuthController.php.template",
    );
    fs.writeFileSync(
      path.join(controllersDir, "AuthController.php"),
      authController,
    );

    // DashboardController
    const dashboardController = this.templateLoader.loadTemplate(
      "laravel/DashboardController.php.template",
    );
    fs.writeFileSync(
      path.join(controllersDir, "DashboardController.php"),
      dashboardController,
    );

    // ProfileController
    const profileController = this.templateLoader.loadTemplate(
      "laravel/ProfileController.php.template",
    );
    fs.writeFileSync(
      path.join(controllersDir, "ProfileController.php"),
      profileController,
    );
  }

  private async createLaravelModels(): Promise<void> {
    const modelsDir = path.join(this.projectPath, "backend", "app", "Models");

    const userModel = this.templateLoader.loadTemplate(
      "laravel/User.php.template",
    );
    fs.writeFileSync(path.join(modelsDir, "User.php"), userModel);
  }

  private async createLaravelRequests(): Promise<void> {
    const requestsDir = path.join(
      this.projectPath,
      "backend",
      "app",
      "Http",
      "Requests",
      "Auth",
    );
    fs.mkdirSync(requestsDir, { recursive: true });

    const loginRequest = this.templateLoader.loadTemplate(
      "laravel/LoginRequest.php.template",
    );
    fs.writeFileSync(path.join(requestsDir, "LoginRequest.php"), loginRequest);

    const registerRequest = this.templateLoader.loadTemplate(
      "laravel/RegisterRequest.php.template",
    );
    fs.writeFileSync(
      path.join(requestsDir, "RegisterRequest.php"),
      registerRequest,
    );
  }

  private async setupLaravelRoutes(): Promise<void> {
    const routesPath = path.join(
      this.projectPath,
      "backend",
      "routes",
      "api.php",
    );

    const apiRoutes = this.templateLoader.loadTemplate(
      "laravel/api.php.template",
    );
    fs.writeFileSync(routesPath, apiRoutes);
  }

  private async createLaravelMigrations(): Promise<void> {
    console.log("📄 Updating existing migrations...");

    const migrationsDir = path.join(
      this.projectPath,
      "backend",
      "database",
      "migrations",
    );

    // Find and update the existing users migration
    const migrationFiles = fs.readdirSync(migrationsDir);
    const usersMigrationFile = migrationFiles.find(
      (file) => file.includes("create_users_table") || file.includes("users"),
    );

    if (usersMigrationFile) {
      const migrationPath = path.join(migrationsDir, usersMigrationFile);
      let migrationContent = fs.readFileSync(migrationPath, "utf8");

      // Check if username field already exists
      if (migrationContent.includes("username")) {
        console.log(
          `✅ Migration already has username field: ${usersMigrationFile}`,
        );
        return;
      }

      // Add username field after email field
      // Match both Laravel 11 and 12 formats
      const patterns = [
        // Laravel 11/12 style: $table->string('email')->unique();
        /(\$table->string\(['"]email['"]\)->unique\(\);)/,
        // Alternative style
        /(\$table->string\(['"]email['"]\)->unique\(\)->nullable\(\);)/,
      ];

      let updated = false;
      for (const pattern of patterns) {
        if (pattern.test(migrationContent)) {
          migrationContent = migrationContent.replace(
            pattern,
            `$1\n            $table->string('username')->unique();`,
          );
          updated = true;
          break;
        }
      }

      // Also add other custom fields before rememberToken
      if (migrationContent.includes("rememberToken")) {
        const customFields = `
            $table->string('profile_photo_url')->nullable();
            $table->enum('role', ['admin', 'user'])->default('user');
            $table->boolean('is_active')->default(true);
            $table->boolean('sms_consent')->default(false);
            $table->string('calendar_link')->nullable();`;

        migrationContent = migrationContent.replace(
          /(\$table->rememberToken\(\);)/,
          `${customFields}\n            $1`,
        );
      }

      if (updated) {
        fs.writeFileSync(migrationPath, migrationContent);
        console.log(`✅ Updated migration: ${usersMigrationFile}`);
        console.log(
          `   Added: username, profile_photo_url, role, is_active, sms_consent, calendar_link`,
        );
      } else {
        console.log(
          `⚠️  Could not update migration format - manual update may be needed`,
        );
      }
    } else {
      console.log("⚠️  No users migration found, skipping migration update");
    }
  }

  private async setupForgeStorage(): Promise<void> {
    console.log("☁️ Setting up Laravel Forge storage configuration...");

    // Update filesystems.php config
    const filesystemsPath = path.join(
      this.projectPath,
      "backend",
      "config",
      "filesystems.php",
    );
    let filesystemsContent = fs.readFileSync(filesystemsPath, "utf8");

    // Add S3 configuration for Laravel Forge storage
    const s3Config = `
        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', true),
            'throw' => false,
        ],
`;

    // Insert S3 config before the closing bracket
    filesystemsContent = filesystemsContent.replace(
      /(\s+)(\]\s*\)\s*;)/,
      `$1$s3Config$1$2`,
    );

    fs.writeFileSync(filesystemsPath, filesystemsContent);

    // Create storage service
    const storageServicePath = path.join(
      this.projectPath,
      "backend",
      "app",
      "Services",
      "StorageService.php",
    );
    const storageService = `<?php

namespace App\\Services;

use Illuminate\\Support\\Facades\\Storage;
use Illuminate\\Http\\UploadedFile;

class StorageService
{
    public function storeFile(UploadedFile $file, string $path = 'uploads'): string
    {
        $filename = time() . '_' . $file->getClientOriginalName();
        $filePath = $path . '/' . $filename;
        
        Storage::disk('s3')->put($filePath, file_get_contents($file));
        
        return Storage::disk('s3')->url($filePath);
    }

    public function deleteFile(string $filePath): bool
    {
        $relativePath = str_replace(Storage::disk('s3')->url(''), '', $filePath);
        
        return Storage::disk('s3')->delete($relativePath);
    }

    public function getFileUrl(string $filePath): string
    {
        return Storage::disk('s3')->url($filePath);
    }

    public function fileExists(string $filePath): bool
    {
        $relativePath = str_replace(Storage::disk('s3')->url(''), '', $filePath);
        
        return Storage::disk('s3')->exists($relativePath);
    }
}`;

    // Create Services directory if it doesn't exist
    const servicesDir = path.join(
      this.projectPath,
      "backend",
      "app",
      "Services",
    );
    if (!fs.existsSync(servicesDir)) {
      fs.mkdirSync(servicesDir, { recursive: true });
    }

    fs.writeFileSync(storageServicePath, storageService);

    // Update ProfileController to use StorageService
    const profileControllerPath = path.join(
      this.projectPath,
      "backend",
      "app",
      "Http",
      "Controllers",
      "ProfileController.php",
    );
    let profileControllerContent = fs.readFileSync(
      profileControllerPath,
      "utf8",
    );

    // Add StorageService import
    profileControllerContent = profileControllerContent.replace(
      "use Illuminate\\Support\\Facades\\Storage;",
      "use Illuminate\\Support\\Facades\\Storage;\nuse App\\Services\\StorageService;",
    );

    // Update constructor to inject StorageService
    profileControllerContent = profileControllerContent.replace(
      "class ProfileController extends Controller\n{",
      "class ProfileController extends Controller\n{\n    protected StorageService $storageService;\n\n    public function __construct(StorageService $storageService)\n    {\n        $this->storageService = $storageService;\n    }",
    );

    // Update uploadPhoto method
    profileControllerContent = profileControllerContent.replace(
      /public function uploadPhoto\(Request \$request\): Response\n\s*{\n\s*\$request->validate\(\[\n\s*'photo' => 'required\|image\|max:2048',\n\s*\]\);\n\n\s*\$user = \$request->user\(\);\n\s*\n\s*if \(\$user->profile_photo_url\) \{\n\s*Storage::disk\('public'\)->delete\(\$user->profile_photo_url\);\n\s*\}\n\n\s*\$path = \$request->file\('photo'\)->store\('profile-photos', 'public'\);\n\s*\n\s*\$user->update\(\['profile_photo_url' => \$path\]\);\n\n\s*return response\(\)->json\(\[\n\s*'success' => true,\n\s*'data' => \[\n\s*'profile_photo_url' => Storage::url\(\$path\),\n\s*\],\n\s*'message' => 'Photo uploaded successfully',\n\s*\]\);\n\s*\}/s,
      `public function uploadPhoto(Request $request): Response
    {
        $request->validate([
            'photo' => 'required|image|max:2048',
        ]);

        $user = $request->user();
        
        if ($user->profile_photo_url) {
            $this->storageService->deleteFile($user->profile_photo_url);
        }

        $fileUrl = $this->storageService->storeFile($request->file('photo'), 'profile-photos');
        
        $user->update(['profile_photo_url' => $fileUrl]);

        return response()->json([
            'success' => true,
            'data' => [
                'profile_photo_url' => $fileUrl,
            ],
            'message' => 'Photo uploaded successfully',
        ]);
    }`,
    );

    // Update deletePhoto method
    profileControllerContent = profileControllerContent.replace(
      /public function deletePhoto\(Request \$request\): Response\n\s*{\n\s*\$user = \$request->user\(\);\n\s*\n\s*if \(\$user->profile_photo_url\) \{\n\s*Storage::disk\('public'\)->delete\(\$user->profile_photo_url\);\n\s*\$user->update\(\['profile_photo_url' => null\]\);\n\s*\}\n\n\s*return response\(\)->json\(\[\n\s*'success' => true,\n\s*'message' => 'Photo deleted successfully',\n\s*\]\);\n\s*\}/s,
      `public function deletePhoto(Request $request): Response
    {
        $user = $request->user();
        
        if ($user->profile_photo_url) {
            $this->storageService->deleteFile($user->profile_photo_url);
            $user->update(['profile_photo_url' => null]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Photo deleted successfully',
        ]);
    }`,
    );

    fs.writeFileSync(profileControllerPath, profileControllerContent);

    console.log("✅ Laravel Forge storage configuration completed");
  }

  private async createReactStructure(): Promise<void> {
    const srcDir = path.join(this.projectPath, "frontend", "src");

    // Create directory structure
    const directories = [
      "components/layouts",
      "components/common",
      "components/Notification",
      "pages/Dashboard",
      "pages/Profile",
      "pages/SignIn",
      "pages/SignUp",
      "hooks",
      "services",
      "schemas",
      "types",
      "constants",
    ];

    directories.forEach((dir) => {
      fs.mkdirSync(path.join(srcDir, dir), { recursive: true });
    });
  }

  private async configureTailwindCSS(): Promise<void> {
    const frontendDir = path.join(this.projectPath, "frontend");

    // Create tailwind.config.js
    const tailwindConfig = this.templateLoader.loadTemplate(
      "config/tailwind.config.js.template",
    );
    fs.writeFileSync(
      path.join(frontendDir, "tailwind.config.js"),
      tailwindConfig,
    );

    // Create postcss.config.js
    const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`;

    fs.writeFileSync(
      path.join(frontendDir, "postcss.config.js"),
      postcssConfig,
    );

    // Update src/index.css
    const indexCss = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Inter', sans-serif;
  }
}

@layer components {
  .btn-primary {
    @apply bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200;
  }
  
  .btn-secondary {
    @apply bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200;
  }
  
  .input-field {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent;
  }
}`;

    fs.writeFileSync(path.join(frontendDir, "src", "index.css"), indexCss);
  }

  private async createReactComponents(): Promise<void> {
    this.logger.info("Creating React components");
    const srcDir = path.join(this.projectPath, "frontend", "src");

    // Create contexts directory
    const contextsDir = path.join(srcDir, "contexts");
    if (!fs.existsSync(contextsDir)) {
      fs.mkdirSync(contextsDir, { recursive: true });
    }

    // Create AuthContext
    const authContext = this.templateLoader.loadTemplate(
      "react/AuthContext.tsx.template",
    );
    fs.writeFileSync(path.join(contextsDir, "AuthContext.tsx"), authContext);

    // Create API client service
    const apiService = this.templateLoader.loadTemplate(
      "react/api.ts.template",
    );
    fs.writeFileSync(path.join(srcDir, "services", "api.ts"), apiService);

    // Create Layout component
    const layoutComponent = this.templateLoader.loadTemplate(
      "react/Layout.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "components", "layouts", "Layout.tsx"),
      layoutComponent,
    );

    // Create Header component
    const headerComponent = this.templateLoader.loadTemplate(
      "react/Header.tsx.template",
      { appName: this.config.appName },
    );
    fs.writeFileSync(
      path.join(srcDir, "components", "layouts", "Header.tsx"),
      headerComponent,
    );

    // Create Footer component
    const footerComponent = this.templateLoader.loadTemplate(
      "react/Footer.tsx.template",
      { appName: this.config.appName },
    );
    fs.writeFileSync(
      path.join(srcDir, "components", "layouts", "Footer.tsx"),
      footerComponent,
    );

    // Create ProtectedRoute component
    const protectedRoute = this.templateLoader.loadTemplate(
      "react/ProtectedRoute.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "components", "common", "ProtectedRoute.tsx"),
      protectedRoute,
    );

    // Create page components
    const signInPage = this.templateLoader.loadTemplate(
      "react/SignIn.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "pages", "SignIn", "SignIn.tsx"),
      signInPage,
    );

    const signUpPage = this.templateLoader.loadTemplate(
      "react/SignUp.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "pages", "SignUp", "SignUp.tsx"),
      signUpPage,
    );

    const dashboardPage = this.templateLoader.loadTemplate(
      "react/Dashboard.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "pages", "Dashboard", "Dashboard.tsx"),
      dashboardPage,
    );

    const profilePage = this.templateLoader.loadTemplate(
      "react/Profile.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "pages", "Profile", "Profile.tsx"),
      profilePage,
    );

    // Create App.tsx
    const appComponent = this.templateLoader.loadTemplate(
      "react/App.tsx.template",
    );
    fs.writeFileSync(path.join(srcDir, "App.tsx"), appComponent);

    // Create index.tsx
    const indexFile = this.templateLoader.loadTemplate(
      "react/index.tsx.template",
    );
    fs.writeFileSync(path.join(srcDir, "index.tsx"), indexFile);

    // Create index.html (Vite entry point) in frontend root
    const indexHtml = this.templateLoader.loadTemplate(
      "react/index.html.template",
      { appName: this.config.appName },
    );
    fs.writeFileSync(
      path.join(this.projectPath, "frontend", "index.html"),
      indexHtml,
    );

    this.logger.info("React components created - fully functional app!");
    console.log("✅ Created complete React application with:");
    console.log("   - Authentication system");
    console.log("   - Sign In/Sign Up pages");
    console.log("   - Dashboard with stats");
    console.log("   - Profile with photo upload");
    console.log("   - Protected routes");
    console.log("   - API client configured");
  }
}

export default LaravelForgeAppCreator;
