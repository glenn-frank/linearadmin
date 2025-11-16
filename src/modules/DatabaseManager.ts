import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { Logger } from "../utils/logger";
import { LaravelForgeAppConfig } from "./ConfigurationManager";

/**
 * Manages database configuration and setup
 */
export class DatabaseManager {
  private logger: Logger;
  private projectPath: string;
  private config: LaravelForgeAppConfig;

  constructor(
    projectPath: string,
    config: LaravelForgeAppConfig,
    logger: Logger
  ) {
    this.projectPath = projectPath;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Setup database configuration
   */
  async setupDatabase(): Promise<void> {
    this.logger.info("Setting up database");
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
          cwd: this.projectPath,
        });
        // Re-read the .env file after key generation
        envContent = fs.readFileSync(envPath, "utf8");
        this.logger.info("Generated Laravel application key");
      } catch (error) {
        this.logger.error("Failed to generate APP_KEY", error as Error);
        console.log(
          "⚠️  Could not generate APP_KEY automatically, please run 'php artisan key:generate' manually"
        );
      }
    }

    // Use SQLite for initial setup ONLY if not using PostgreSQL locally
    // If PostgreSQL is selected, we'll set it up in createEnvironmentFiles()
    if (this.config.localDatabaseType !== "postgresql") {
      envContent = envContent.replace(
        "DB_DATABASE=laravel",
        "DB_DATABASE=" +
          path.join(this.projectPath, "backend", "database", "database.sqlite")
      );

      fs.writeFileSync(envPath, envContent);

      // Run migrations for local development (only for SQLite/MySQL)
      try {
        execSync("cd backend && php artisan migrate", {
          stdio: "inherit",
          cwd: this.projectPath,
        });
        this.logger.info("Ran database migrations successfully");
      } catch (error) {
        this.logger.error("Failed to run migrations", error as Error);
        throw error;
      }
    }

    // Create environment files for different deployment targets
    await this.createEnvironmentFiles();
  }

  /**
   * Setup PostgreSQL database for local development
   */
  private async setupPostgreSQLDatabase(): Promise<void> {
    this.logger.info("Setting up PostgreSQL database");
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
        this.logger.info("Created PostgreSQL database", { dbName, dbUser });
      } catch (error) {
        // Database might already exist, which is fine
        console.log(
          `ℹ️  Database ${dbName} already exists or couldn't be created`
        );
        this.logger.info("Database already exists or couldn't be created", {
          dbName,
        });
      }

      // Run migrations with PostgreSQL
      console.log("🔄 Running migrations with PostgreSQL...");
      execSync("cd backend && php artisan migrate", {
        stdio: "inherit",
        cwd: this.projectPath,
      });
      this.logger.info("Ran PostgreSQL migrations successfully");
    } catch (error) {
      this.logger.error("PostgreSQL setup failed", error as Error);
      console.log(
        "⚠️  PostgreSQL setup skipped - ensure PostgreSQL is installed and running"
      );
      console.log("   You can set it up manually or use SQLite instead");
    }
  }

  /**
   * Create environment files for different deployment targets
   */
  private async createEnvironmentFiles(): Promise<void> {
    this.logger.info("Creating environment files for deployment targets");
    console.log(
      "📝 Creating environment files for different deployment targets..."
    );

    // Generate APP_KEY for all environment files
    const appKey = this.generateAppKey();

    const backendDir = path.join(this.projectPath, "backend");

    // Create .env.local for local development
    if (
      this.config.deploymentTarget === "local" ||
      this.config.deploymentTarget === "both"
    ) {
      const localEnvContent = this.buildLocalEnvContent(appKey);
      fs.writeFileSync(path.join(backendDir, ".env.local"), localEnvContent);
      this.logger.debug("Created .env.local file");

      // Copy .env.local to .env for local development
      fs.copyFileSync(
        path.join(backendDir, ".env.local"),
        path.join(backendDir, ".env")
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
      const productionEnvContent = this.buildProductionEnvContent(appKey);
      fs.writeFileSync(
        path.join(backendDir, ".env.production"),
        productionEnvContent
      );
      this.logger.debug("Created .env.production file");
    }

    // Create deployment script
    const deployScript = this.buildDeploymentScript();
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

  /**
   * Generate Laravel application key
   */
  private generateAppKey(): string {
    const crypto = require("crypto");
    const key = crypto.randomBytes(32);
    return "base64:" + key.toString("base64");
  }

  /**
   * Build local environment file content
   */
  private buildLocalEnvContent(appKey: string): string {
    return `APP_NAME="${this.config.appName}"
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
        "database.sqlite"
      )}`
}

# Local Storage Configuration
FILESYSTEM_DISK=local

BROADCAST_DRIVER=log
CACHE_DRIVER=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS="hello@example.com"
MAIL_FROM_NAME="${this.config.appName}"

VITE_APP_NAME="${this.config.appName}"
`;
  }

  /**
   * Build production environment file content
   */
  private buildProductionEnvContent(appKey: string): string {
    return `APP_NAME="${this.config.appName}"
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

MAIL_MAILER=smtp
MAIL_FROM_ADDRESS="noreply@your-domain.com"
MAIL_FROM_NAME="${this.config.appName}"

VITE_APP_NAME="${this.config.appName}"
`;
  }

  /**
   * Build deployment script
   */
  private buildDeploymentScript(): string {
    return `#!/bin/bash

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
  }
}
