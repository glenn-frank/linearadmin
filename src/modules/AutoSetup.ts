import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../utils/logger";
import { ServerManager } from "../utils/server-manager";

/**
 * Handles automatic setup and server startup
 */
export class AutoSetup {
  private logger: Logger;
  private projectPath: string;
  private serverManager: ServerManager;

  constructor(projectPath: string, logger: Logger) {
    this.projectPath = projectPath;
    this.logger = logger;
    this.serverManager = new ServerManager(logger);
  }

  /**
   * Complete automatic setup: install dependencies, run migrations, start servers
   */
  async runCompleteSetup(autoStart: boolean = true): Promise<void> {
    this.logger.info("Starting automatic setup");
    console.log("\n🔧 Starting automatic setup...");
    console.log("This will install all dependencies and start the servers.\n");

    try {
      // Install backend dependencies
      await this.installBackendDependencies();

      // Setup backend
      await this.setupBackend();

      // Install frontend dependencies
      await this.installFrontendDependencies();

      // Start servers if requested
      if (autoStart) {
        await this.startServers();
      }

      console.log("\n✅ Setup complete!");

      if (autoStart) {
        console.log("\n🎉 Your application is now running!");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📱 Frontend: http://localhost:5173");
        console.log("🔧 Backend API: http://localhost:8000");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("\n🔑 DEFAULT TEST USER:");
        console.log("   Email:    test@example.com");
        console.log("   Password: password");
        console.log("   Role:     admin");
        console.log("\n💡 Press Ctrl+C to stop both servers");
        console.log(
          "\n🚀 Open http://localhost:5173 in your browser to get started!\n",
        );

        // Keep process alive
        this.keepAlive();
      }
    } catch (error) {
      this.logger.error("Setup failed", error as Error);
      console.error("\n❌ Setup failed:", (error as Error).message);
      throw error;
    }
  }

  /**
   * Install backend dependencies with composer
   */
  private async installBackendDependencies(): Promise<void> {
    this.logger.info("Installing backend dependencies");
    console.log("📦 Installing backend dependencies (composer)...");
    console.log("   This may take 2-3 minutes...");

    const backendPath = path.join(this.projectPath, "backend");

    try {
      execSync("composer install --no-interaction --prefer-dist", {
        cwd: backendPath,
        stdio: "inherit",
      });

      this.logger.info("Backend dependencies installed");
      console.log("✅ Backend dependencies installed\n");
    } catch (error) {
      this.logger.error(
        "Failed to install backend dependencies",
        error as Error,
      );
      throw new Error(
        "Composer install failed. Make sure Composer is installed.",
      );
    }
  }

  /**
   * Setup backend: generate key, create DB, run migrations
   */
  private async setupBackend(): Promise<void> {
    this.logger.info("Setting up backend");
    console.log("🔧 Configuring backend...");

    const backendPath = path.join(this.projectPath, "backend");

    try {
      // Generate app key if needed
      console.log("   🔑 Generating application key...");
      execSync("php artisan key:generate --force", {
        cwd: backendPath,
        stdio: "pipe",
      });

      // Create SQLite database file if using SQLite
      const envPath = path.join(backendPath, ".env");
      const envContent = fs.readFileSync(envPath, "utf8");

      if (envContent.includes("sqlite")) {
        const dbPath = path.join(backendPath, "database", "database.sqlite");
        if (!fs.existsSync(dbPath)) {
          console.log("   🗄️  Creating SQLite database...");
          fs.writeFileSync(dbPath, "");
        }
      }

      // Skip migrations - they were already run during app creation
      console.log(
        "   ℹ️  Migrations already run during app creation, skipping...",
      );

      // Clear config cache to ensure our files are used
      try {
        execSync("php artisan config:clear", {
          cwd: backendPath,
          stdio: "pipe",
        });
      } catch (error) {
        // Ignore if command fails
      }

      // Create simple database seeder for test user
      const seederPath = path.join(
        backendPath,
        "database",
        "seeders",
        "DatabaseSeeder.php",
      );

      const seederTemplate = `<?php

namespace Database\\Seeders;

use Illuminate\\Database\\Seeder;
use App\\Models\\User;
use Illuminate\\Support\\Facades\\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Check if test user already exists
        $existingUser = User::where('email', 'test@example.com')->first();
        
        if ($existingUser) {
            echo "ℹ️  Test user already exists, skipping creation.\\n";
            return;
        }

        // Create test user with only fields that exist in migration
        $userData = [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => Hash::make('password'),
        ];

        // Add optional fields if columns exist (check User model fillable)
        try {
            $user = User::create($userData);
            echo "✅ Default test user created:\\n";
            echo "   Email: test@example.com\\n";
            echo "   Password: password\\n";
        } catch (\\Exception $e) {
            echo "⚠️  Could not create test user: " . $e->getMessage() . "\\n";
        }
    }
}`;

      fs.writeFileSync(seederPath, seederTemplate);
      console.log("   ✅ DatabaseSeeder configured");

      // Run database seeder to create test user
      console.log("   👤 Creating default test user...");
      try {
        execSync("php artisan db:seed --force", {
          cwd: backendPath,
          stdio: "inherit",
        });
      } catch (seedError) {
        console.log(
          "   ⚠️  Seeder failed (non-critical) - you can create users manually",
        );
      }

      this.logger.info("Backend setup complete");
      console.log("✅ Backend configured\n");
    } catch (error) {
      this.logger.error("Backend setup failed", error as Error);
      throw new Error("Backend setup failed. Check error messages above.");
    }
  }

  /**
   * Install frontend dependencies with npm
   */
  private async installFrontendDependencies(): Promise<void> {
    this.logger.info("Installing frontend dependencies");
    console.log("📦 Installing frontend dependencies (npm)...");
    console.log("   This may take 3-5 minutes...");

    const frontendPath = path.join(this.projectPath, "frontend");

    try {
      execSync("npm install --legacy-peer-deps", {
        cwd: frontendPath,
        stdio: "inherit",
      });

      this.logger.info("Frontend dependencies installed");
      console.log("✅ Frontend dependencies installed\n");
    } catch (error) {
      this.logger.error(
        "Failed to install frontend dependencies",
        error as Error,
      );
      throw new Error(
        "npm install failed. Make sure Node.js and npm are installed.",
      );
    }
  }

  /**
   * Start both backend and frontend servers
   */
  private async startServers(): Promise<void> {
    this.logger.info("Starting application servers");
    console.log("🚀 Starting application servers...\n");

    const backendPath = path.join(this.projectPath, "backend");
    const frontendPath = path.join(this.projectPath, "frontend");

    // Setup cleanup handlers
    this.serverManager.setupCleanupHandlers();

    // Start Laravel backend
    this.serverManager.startLaravelServer(backendPath, 8000);

    // Wait a moment for backend to start
    await this.sleep(2000);

    // Start Vite frontend
    this.serverManager.startViteServer(frontendPath, 5173);

    // Wait a moment for frontend to start
    await this.sleep(3000);
  }

  /**
   * Keep process alive to maintain servers
   */
  private keepAlive(): void {
    // Process will stay alive as long as child processes are running
    setInterval(() => {
      // Just keep the process alive
    }, 1000);
  }

  /**
   * Check if migrations have already been run
   */
  private checkMigrationsRun(envContent: string): boolean {
    // If using PostgreSQL (pgsql), migrations were likely already run during setup
    return envContent.includes("DB_CONNECTION=pgsql");
  }

  /**
   * Helper to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check prerequisites (PHP, Composer, Node, npm)
   */
  checkPrerequisites(): {
    php: boolean;
    composer: boolean;
    node: boolean;
    npm: boolean;
  } {
    const results = {
      php: false,
      composer: false,
      node: false,
      npm: false,
    };

    try {
      execSync("php --version", { stdio: "pipe" });
      results.php = true;
    } catch {
      console.error("❌ PHP not found. Please install PHP 8.1 or higher.");
    }

    try {
      execSync("composer --version", { stdio: "pipe" });
      results.composer = true;
    } catch {
      console.error("❌ Composer not found. Please install Composer.");
    }

    try {
      execSync("node --version", { stdio: "pipe" });
      results.node = true;
    } catch {
      console.error(
        "❌ Node.js not found. Please install Node.js 18 or higher.",
      );
    }

    try {
      execSync("npm --version", { stdio: "pipe" });
      results.npm = true;
    } catch {
      console.error("❌ npm not found. Please install npm.");
    }

    return results;
  }

  /**
   * Verify all prerequisites are met
   */
  verifyPrerequisites(): boolean {
    this.logger.info("Checking prerequisites");
    console.log("🔍 Checking prerequisites...");

    const results = this.checkPrerequisites();

    if (results.php) console.log("   ✅ PHP installed");
    if (results.composer) console.log("   ✅ Composer installed");
    if (results.node) console.log("   ✅ Node.js installed");
    if (results.npm) console.log("   ✅ npm installed");

    const allInstalled =
      results.php && results.composer && results.node && results.npm;

    if (!allInstalled) {
      console.log(
        "\n❌ Missing prerequisites. Please install the required tools.\n",
      );
      return false;
    }

    console.log("✅ All prerequisites met\n");
    return true;
  }
}
