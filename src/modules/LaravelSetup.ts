import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { Logger } from "../utils/logger";
import { LaravelForgeAppConfig } from "./ConfigurationManager";
import { TemplateLoader } from "../utils/template-loader";

/**
 * Handles Laravel backend initialization and configuration
 */
export class LaravelSetup {
  private logger: Logger;
  private projectPath: string;
  private config: LaravelForgeAppConfig;
  private templateLoader: TemplateLoader;

  constructor(
    projectPath: string,
    config: LaravelForgeAppConfig,
    logger: Logger,
    templateLoader: TemplateLoader
  ) {
    this.projectPath = projectPath;
    this.config = config;
    this.logger = logger;
    this.templateLoader = templateLoader;
  }

  /**
   * Initialize Laravel backend
   */
  async initializeLaravelBackend(): Promise<void> {
    this.logger.info("Initializing Laravel backend");
    console.log("🔧 Initializing Laravel backend...");

    // Create Laravel project
    execSync("composer create-project laravel/laravel backend --prefer-dist", {
      stdio: "inherit",
      cwd: this.projectPath,
    });

    // Remove Laravel's git repository (we'll create a monorepo at root level)
    const backendGitPath = path.join(this.projectPath, "backend", ".git");
    if (fs.existsSync(backendGitPath)) {
      fs.rmSync(backendGitPath, { recursive: true, force: true });
      this.logger.info("Removed Laravel's git repository for monorepo setup");
      console.log("   ✅ Removed backend .git (preparing for monorepo)");
    }

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

    this.logger.info("Installing Laravel packages", { packages });
    execSync(`cd backend && composer require ${packages.join(" ")}`, {
      stdio: "inherit",
      cwd: this.projectPath,
    });

    // Generate Sanctum config
    execSync(
      'cd backend && php artisan vendor:publish --provider="Laravel\\Sanctum\\SanctumServiceProvider"',
      { stdio: "inherit", cwd: this.projectPath }
    );

    // Create custom controllers
    await this.createLaravelControllers();

    // Create models
    await this.createLaravelModels();

    // Create Form Requests
    await this.createLaravelRequests();

    // Create factories
    await this.createLaravelFactories();

    // Setup routes
    await this.setupLaravelRoutes();

    // Create migrations
    await this.createLaravelMigrations();

    // Create database seeder with test user
    await this.createDatabaseSeeder();

    // Configure bootstrap/app.php to load API routes
    await this.configureBootstrapApp();

    // Clear config and route cache to ensure changes take effect
    try {
      execSync("cd backend && php artisan config:clear", {
        stdio: "pipe",
        cwd: this.projectPath,
      });
      execSync("cd backend && php artisan route:clear", {
        stdio: "pipe",
        cwd: this.projectPath,
      });
    } catch (error) {
      // Ignore cache clear errors
    }

    // Setup Forge storage configuration
    if (this.config.useForgeStorage) {
      await this.setupForgeStorage();
    }

    this.logger.info("Laravel backend initialization complete");
  }

  /**
   * Create Laravel controllers
   */
  private async createLaravelControllers(): Promise<void> {
    this.logger.info("Creating Laravel controllers");
    const controllersDir = path.join(
      this.projectPath,
      "backend",
      "app",
      "Http",
      "Controllers"
    );

    // Load controller templates
    const authController = this.templateLoader.loadTemplate(
      "laravel/AuthController.php.template"
    );
    fs.writeFileSync(
      path.join(controllersDir, "AuthController.php"),
      authController
    );

    const dashboardController = this.templateLoader.loadTemplate(
      "laravel/DashboardController.php.template"
    );
    fs.writeFileSync(
      path.join(controllersDir, "DashboardController.php"),
      dashboardController
    );

    const profileController = this.templateLoader.loadTemplate(
      "laravel/ProfileController.php.template"
    );
    fs.writeFileSync(
      path.join(controllersDir, "ProfileController.php"),
      profileController
    );

    this.logger.info("Created Laravel controllers");
  }

  /**
   * Create Laravel models
   */
  private async createLaravelModels(): Promise<void> {
    this.logger.info("Creating Laravel models");
    const modelsDir = path.join(this.projectPath, "backend", "app", "Models");

    const userModel = this.templateLoader.loadTemplate(
      "laravel/User.php.template"
    );
    fs.writeFileSync(path.join(modelsDir, "User.php"), userModel);

    this.logger.info("Created Laravel models");
  }

  /**
   * Create Laravel factories
   */
  private async createLaravelFactories(): Promise<void> {
    this.logger.info("Creating Laravel factories");
    const factoriesDir = path.join(
      this.projectPath,
      "backend",
      "database",
      "factories"
    );

    // Ensure directory exists
    if (!fs.existsSync(factoriesDir)) {
      fs.mkdirSync(factoriesDir, { recursive: true });
    }

    const userFactory = this.templateLoader.loadTemplate(
      "laravel/UserFactory.php.template"
    );
    fs.writeFileSync(path.join(factoriesDir, "UserFactory.php"), userFactory);

    this.logger.info("Created Laravel factories");
  }

  /**
   * Create Laravel FormRequest classes used by AuthController
   */
  private async createLaravelRequests(): Promise<void> {
    this.logger.info("Creating Laravel form requests");
    const requestsDir = path.join(
      this.projectPath,
      "backend",
      "app",
      "Http",
      "Requests",
      "Auth"
    );

    if (!fs.existsSync(requestsDir)) {
      fs.mkdirSync(requestsDir, { recursive: true });
    }

    const loginRequest = this.templateLoader.loadTemplate(
      "laravel/LoginRequest.php.template"
    );
    fs.writeFileSync(path.join(requestsDir, "LoginRequest.php"), loginRequest);

    const registerRequest = this.templateLoader.loadTemplate(
      "laravel/RegisterRequest.php.template"
    );
    fs.writeFileSync(
      path.join(requestsDir, "RegisterRequest.php"),
      registerRequest
    );

    this.logger.info("Created Laravel form requests");
  }

  /**
   * Configure bootstrap/app.php to load API routes
   */
  private async configureBootstrapApp(): Promise<void> {
    this.logger.info("Configuring bootstrap/app.php");
    console.log("   🔧 Configuring API routes...");

    const bootstrapPath = path.join(
      this.projectPath,
      "backend",
      "bootstrap",
      "app.php"
    );

    // Check if file exists (Laravel 11)
    if (fs.existsSync(bootstrapPath)) {
      let bootstrapContent = fs.readFileSync(bootstrapPath, "utf8");

      // Check if API routes are already configured
      if (!bootstrapContent.includes("api:")) {
        // Laravel 12 format: web: __DIR__.'/../routes/web.php',
        const laravel12Pattern = /web:\s*__DIR__\.'\/\.\.\/routes\/web\.php',/s;

        if (laravel12Pattern.test(bootstrapContent)) {
          bootstrapContent = bootstrapContent.replace(
            laravel12Pattern,
            `web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',`
          );
          fs.writeFileSync(bootstrapPath, bootstrapContent);
          console.log("   ✅ Configured API routes in bootstrap/app.php");
          this.logger.info(
            "Configured bootstrap/app.php to load API routes (Laravel 12)"
          );
        } else {
          // Laravel 11 format: web: __DIR__ . '/../routes/web.php',
          const laravel11Pattern =
            /web:\s*__DIR__\s*\.\s*['"](?:\/)?\.\.\/(?:\/)?routes\/web\.php['"],/s;

          if (laravel11Pattern.test(bootstrapContent)) {
            bootstrapContent = bootstrapContent.replace(
              laravel11Pattern,
              `web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',`
            );
            fs.writeFileSync(bootstrapPath, bootstrapContent);
            console.log("   ✅ Configured API routes in bootstrap/app.php");
            this.logger.info(
              "Configured bootstrap/app.php to load API routes (Laravel 11)"
            );
          } else {
            console.log(
              "   ⚠️  Could not configure bootstrap/app.php - unexpected format"
            );
            this.logger.warn(
              "Could not configure bootstrap/app.php - unexpected format"
            );
          }
        }
      } else {
        console.log("   ℹ️  API routes already configured");
        this.logger.info("API routes already configured in bootstrap/app.php");
      }
    } else {
      console.log(
        "   ⚠️  bootstrap/app.php not found (older Laravel version?)"
      );
      this.logger.warn("bootstrap/app.php not found (older Laravel version?)");
    }
  }

  /**
   * Create database seeder with test user
   */
  async createDatabaseSeeder(): Promise<void> {
    this.logger.info("Creating database seeder");
    const seedersDir = path.join(
      this.projectPath,
      "backend",
      "database",
      "seeders"
    );

    // Ensure directory exists
    if (!fs.existsSync(seedersDir)) {
      fs.mkdirSync(seedersDir, { recursive: true });
    }

    const seeder = this.templateLoader.loadTemplate(
      "laravel/DatabaseSeeder.php.template"
    );
    fs.writeFileSync(path.join(seedersDir, "DatabaseSeeder.php"), seeder);

    // Verify the file was written correctly
    const seederPath = path.join(seedersDir, "DatabaseSeeder.php");
    if (fs.existsSync(seederPath)) {
      const content = fs.readFileSync(seederPath, "utf8");
      this.logger.info("Database seeder created and verified", {
        size: content.length,
      });
    } else {
      throw new Error("Failed to create database seeder file");
    }

    this.logger.info("Database seeder created");
  }

  /**
   * Setup Laravel routes
   */
  private async setupLaravelRoutes(): Promise<void> {
    this.logger.info("Setting up Laravel routes");
    const routesPath = path.join(
      this.projectPath,
      "backend",
      "routes",
      "api.php"
    );

    const apiRoutes = this.templateLoader.loadTemplate(
      "laravel/api.php.template"
    );
    fs.writeFileSync(routesPath, apiRoutes);

    this.logger.info("Laravel routes configured");
  }

  /**
   * Create Laravel migrations
   */
  private async createLaravelMigrations(): Promise<void> {
    this.logger.info("Updating Laravel migrations");
    console.log("📄 Updating existing migrations...");

    const migrationsDir = path.join(
      this.projectPath,
      "backend",
      "database",
      "migrations"
    );

    // Find and update the existing users migration
    const migrationFiles = fs.readdirSync(migrationsDir);
    const usersMigrationFile = migrationFiles.find(
      (file) => file.includes("create_users_table") || file.includes("users")
    );

    if (usersMigrationFile) {
      const migrationPath = path.join(migrationsDir, usersMigrationFile);
      let migrationContent = fs.readFileSync(migrationPath, "utf8");

      // Update the users table schema to include our additional fields
      migrationContent = migrationContent.replace(
        /Schema::create\('users', function \(Blueprint \$table\) \{[^}]*\}/s,
        `Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('username')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('profile_photo_url')->nullable();
            $table->enum('role', ['admin', 'user'])->default('user');
            $table->boolean('is_active')->default(true);
            $table->boolean('sms_consent')->default(false);
            $table->string('calendar_link')->nullable();
            $table->rememberToken();
            $table->timestamps();
        }`
      );

      fs.writeFileSync(migrationPath, migrationContent);
      this.logger.info("Updated users migration", { file: usersMigrationFile });
      console.log(`✅ Updated migration: ${usersMigrationFile}`);
    } else {
      this.logger.warn("No users migration found");
      console.log("⚠️  No users migration found, skipping migration update");
    }
  }

  /**
   * Setup Laravel Forge storage configuration
   */
  private async setupForgeStorage(): Promise<void> {
    this.logger.info("Setting up Laravel Forge storage");
    console.log("☁️ Setting up Laravel Forge storage configuration...");

    // Update filesystems.php config
    const filesystemsPath = path.join(
      this.projectPath,
      "backend",
      "config",
      "filesystems.php"
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
      `$1${s3Config}$1$2`
    );

    fs.writeFileSync(filesystemsPath, filesystemsContent);

    // Create storage service
    const storageServicePath = path.join(
      this.projectPath,
      "backend",
      "app",
      "Services",
      "StorageService.php"
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
      "Services"
    );
    if (!fs.existsSync(servicesDir)) {
      fs.mkdirSync(servicesDir, { recursive: true });
    }

    fs.writeFileSync(storageServicePath, storageService);
    this.logger.info("Laravel Forge storage configuration complete");
    console.log("✅ Laravel Forge storage configuration completed");
  }
}
