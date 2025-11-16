import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { Logger } from "../utils/logger";
import { TemplateLoader } from "../utils/template-loader";
import { CodeModifier } from "../utils/code-modifier";

/**
 * Update configuration for existing projects
 */
export interface UpdateConfig {
  /** Path to existing project */
  projectPath: string;
  /** Features to add */
  addFeatures?: string[];
  /** Packages to install */
  addPackages?: string[];
  /** Update frontend dependencies */
  updateFrontend?: boolean;
  /** Update backend dependencies */
  updateBackend?: boolean;
  /** Run migrations */
  runMigrations?: boolean;
  /** Create backup before updating */
  createBackup?: boolean;
}

/**
 * Handles updating existing Laravel + React projects
 *
 * Allows adding new features, updating dependencies, and applying migrations
 * to existing projects without recreating from scratch.
 *
 * @example
 * ```typescript
 * const updater = new ProjectUpdater(logger, templateLoader);
 * await updater.updateProject({
 *   projectPath: "/path/to/project",
 *   addFeatures: ["email"],
 *   updateFrontend: true,
 *   createBackup: true
 * });
 * ```
 */
export class ProjectUpdater {
  private logger: Logger;
  private templateLoader: TemplateLoader;
  private codeModifier: CodeModifier;

  constructor(logger: Logger, templateLoader: TemplateLoader) {
    this.logger = logger;
    this.templateLoader = templateLoader;
    this.codeModifier = new CodeModifier(logger);
  }

  /**
   * Update an existing project
   *
   * @param config - Update configuration
   * @returns Promise that resolves when update is complete
   */
  async updateProject(config: UpdateConfig): Promise<void> {
    this.logger.info("Starting project update", {
      projectPath: config.projectPath,
    });
    console.log("🔄 Updating project...");
    console.log(`📁 Project: ${config.projectPath}`);

    // Validate project exists
    if (!this.validateProject(config.projectPath)) {
      throw new Error("Invalid project path or project not found");
    }

    // Create backup if requested
    if (config.createBackup) {
      await this.createBackup(config.projectPath);
    }

    // Add features
    if (config.addFeatures && config.addFeatures.length > 0) {
      await this.addFeatures(config.projectPath, config.addFeatures);
    }

    // Update frontend
    if (config.updateFrontend) {
      await this.updateFrontendDependencies(config.projectPath);
    }

    // Update backend
    if (config.updateBackend) {
      await this.updateBackendDependencies(config.projectPath);
    }

    // Run migrations
    if (config.runMigrations) {
      await this.runMigrations(config.projectPath);
    }

    this.logger.info("Project update complete");
    console.log("✅ Project updated successfully!");
  }

  /**
   * Validate that project exists and has correct structure
   */
  private validateProject(projectPath: string): boolean {
    this.logger.debug("Validating project structure", { projectPath });

    // Check if project directory exists
    if (!fs.existsSync(projectPath)) {
      this.logger.error("Project directory not found", undefined, {
        projectPath,
      });
      return false;
    }

    // Check for backend directory
    const backendPath = path.join(projectPath, "backend");
    if (!fs.existsSync(backendPath)) {
      this.logger.error("Backend directory not found", undefined, {
        backendPath,
      });
      return false;
    }

    // Check for frontend directory
    const frontendPath = path.join(projectPath, "frontend");
    if (!fs.existsSync(frontendPath)) {
      this.logger.error("Frontend directory not found", undefined, {
        frontendPath,
      });
      return false;
    }

    // Check for composer.json
    const composerPath = path.join(backendPath, "composer.json");
    if (!fs.existsSync(composerPath)) {
      this.logger.error("composer.json not found", undefined, { composerPath });
      return false;
    }

    // Check for package.json
    const packagePath = path.join(frontendPath, "package.json");
    if (!fs.existsSync(packagePath)) {
      this.logger.error("package.json not found", undefined, { packagePath });
      return false;
    }

    this.logger.info("Project structure validated");
    return true;
  }

  /**
   * Create backup of project before updating
   */
  private async createBackup(projectPath: string): Promise<void> {
    this.logger.info("Creating project backup");
    console.log("💾 Creating backup...");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const projectName = path.basename(projectPath);
    const backupName = `${projectName}-backup-${timestamp}`;
    const backupPath = path.join(
      path.dirname(projectPath),
      "backups",
      backupName
    );

    try {
      // Create backup directory
      if (!fs.existsSync(path.dirname(backupPath))) {
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      }

      // Copy project directory
      this.copyDirectory(projectPath, backupPath);

      this.logger.info("Backup created successfully", { backupPath });
      console.log(`✅ Backup created: ${backupPath}`);
    } catch (error) {
      this.logger.error("Failed to create backup", error as Error);
      throw error;
    }
  }

  /**
   * Copy directory recursively
   */
  private copyDirectory(source: string, destination: string): void {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      // Skip node_modules and vendor directories
      if (entry.name === "node_modules" || entry.name === "vendor") {
        continue;
      }

      if (entry.isDirectory()) {
        this.copyDirectory(sourcePath, destPath);
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    }
  }

  /**
   * Add features to existing project
   */
  private async addFeatures(
    projectPath: string,
    features: string[]
  ): Promise<void> {
    this.logger.info("Adding features", { features });
    console.log(`📦 Adding features: ${features.join(", ")}`);

    for (const feature of features) {
      switch (feature) {
        case "email":
          await this.addEmailFeature(projectPath);
          break;
        case "upload":
          await this.addUploadFeature(projectPath);
          break;
        case "docs":
          await this.addDocsFeature(projectPath);
          break;
        default:
          this.logger.warn("Unknown feature", undefined, { feature });
          console.log(`⚠️  Unknown feature: ${feature}`);
      }
    }
  }

  /**
   * Add email feature
   */
  private async addEmailFeature(projectPath: string): Promise<void> {
    console.log("📧 Adding email feature...");

    // Install Laravel Horizon for queue management
    execSync("cd backend && composer require laravel/horizon", {
      stdio: "inherit",
      cwd: projectPath,
    });

    this.logger.info("Email feature added");
    console.log("✅ Email feature added");
  }

  /**
   * Add file upload feature
   */
  private async addUploadFeature(projectPath: string): Promise<void> {
    console.log("📤 Adding file upload feature...");

    // Install Intervention Image for image processing
    execSync("cd backend && composer require intervention/image", {
      stdio: "inherit",
      cwd: projectPath,
    });

    this.logger.info("Upload feature added");
    console.log("✅ Upload feature added");
  }

  /**
   * Add API documentation feature
   */
  private async addDocsFeature(projectPath: string): Promise<void> {
    console.log("📚 Adding API documentation...");

    // Install Scribe for API docs
    execSync("cd backend && composer require --dev knuckleswtf/scribe", {
      stdio: "inherit",
      cwd: projectPath,
    });

    this.logger.info("Docs feature added");
    console.log("✅ API documentation added");
  }

  /**
   * Update frontend dependencies
   */
  private async updateFrontendDependencies(projectPath: string): Promise<void> {
    this.logger.info("Updating frontend dependencies");
    console.log("⚛️ Updating frontend dependencies...");

    try {
      execSync("cd frontend && npm update", {
        stdio: "inherit",
        cwd: projectPath,
      });

      this.logger.info("Frontend dependencies updated");
      console.log("✅ Frontend dependencies updated");
    } catch (error) {
      this.logger.error("Failed to update frontend", error as Error);
      throw error;
    }
  }

  /**
   * Update backend dependencies
   */
  private async updateBackendDependencies(projectPath: string): Promise<void> {
    this.logger.info("Updating backend dependencies");
    console.log("🔧 Updating backend dependencies...");

    try {
      execSync("cd backend && composer update", {
        stdio: "inherit",
        cwd: projectPath,
      });

      this.logger.info("Backend dependencies updated");
      console.log("✅ Backend dependencies updated");
    } catch (error) {
      this.logger.error("Failed to update backend", error as Error);
      throw error;
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(projectPath: string): Promise<void> {
    this.logger.info("Running database migrations");
    console.log("🗄️ Running migrations...");

    try {
      execSync("cd backend && php artisan migrate", {
        stdio: "inherit",
        cwd: projectPath,
      });

      this.logger.info("Migrations completed");
      console.log("✅ Migrations completed");
    } catch (error) {
      this.logger.error("Failed to run migrations", error as Error);
      throw error;
    }
  }

  /**
   * Get project information
   *
   * @param projectPath - Path to project
   * @returns Project metadata
   */
  getProjectInfo(projectPath: string): {
    name: string;
    hasBackend: boolean;
    hasFrontend: boolean;
    backendFramework?: string;
    frontendFramework?: string;
  } | null {
    if (!this.validateProject(projectPath)) {
      return null;
    }

    const projectName = path.basename(projectPath);

    // Check composer.json for Laravel
    const composerPath = path.join(projectPath, "backend", "composer.json");
    const composer = JSON.parse(fs.readFileSync(composerPath, "utf8"));
    const hasLaravel = composer.require?.["laravel/framework"] !== undefined;

    // Check package.json for React
    const packagePath = path.join(projectPath, "frontend", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const hasReact = packageJson.dependencies?.["react"] !== undefined;

    return {
      name: projectName,
      hasBackend: true,
      hasFrontend: true,
      backendFramework: hasLaravel ? "Laravel" : undefined,
      frontendFramework: hasReact ? "React" : undefined,
    };
  }
}

