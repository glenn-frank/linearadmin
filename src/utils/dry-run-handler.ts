import { Logger } from "./logger";
import { LaravelForgeAppConfig } from "../modules/ConfigurationManager";

/**
 * Action that would be performed
 */
export interface DryRunAction {
  /** Type of action */
  type:
    | "create_directory"
    | "create_file"
    | "execute_command"
    | "api_call"
    | "git_operation";
  /** Description of the action */
  description: string;
  /** Details about what would be created/modified */
  details?: any;
  /** Order of execution */
  order: number;
}

/**
 * Dry-run handler for previewing operations without executing them
 *
 * Allows users to see exactly what would happen before committing to the operation.
 *
 * @example
 * ```typescript
 * const dryRun = new DryRunHandler(config, logger);
 * dryRun.recordAction("create_directory", "Create project directory", {...});
 * dryRun.recordAction("execute_command", "Run composer install", {...});
 *
 * if (await dryRun.preview()) {
 *   // User approved, continue
 * }
 * ```
 */
export class DryRunHandler {
  private actions: DryRunAction[] = [];
  private config: LaravelForgeAppConfig;
  private logger: Logger;
  private enabled: boolean = false;

  constructor(
    config: LaravelForgeAppConfig,
    logger: Logger,
    enabled: boolean = false
  ) {
    this.config = config;
    this.logger = logger;
    this.enabled = enabled;
  }

  /**
   * Enable or disable dry-run mode
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.info(`Dry-run mode ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if dry-run mode is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Record an action that would be performed
   *
   * @param type - Type of action
   * @param description - Human-readable description
   * @param details - Additional details about the action
   */
  recordAction(
    type: DryRunAction["type"],
    description: string,
    details?: any
  ): void {
    if (!this.enabled) return;

    const action: DryRunAction = {
      type,
      description,
      details,
      order: this.actions.length + 1,
    };

    this.actions.push(action);
    this.logger.debug("Recorded dry-run action", action);
  }

  /**
   * Preview all recorded actions
   *
   * Displays a detailed preview of what would happen and asks for confirmation.
   *
   * @returns True if user approves, false otherwise
   */
  async preview(): Promise<boolean> {
    if (!this.enabled) return true;

    console.log("\n" + "=".repeat(60));
    console.log("🔍 DRY-RUN MODE: Preview of Actions");
    console.log("=".repeat(60));
    console.log("");
    console.log("The following actions will be performed:");
    console.log("");

    // Group actions by type
    const grouped = this.groupActionsByType();

    // Display grouped actions
    for (const [type, typeActions] of Object.entries(grouped)) {
      console.log(`\n📋 ${this.getTypeLabel(type)}:`);
      typeActions.forEach((action) => {
        console.log(`   ${action.order}. ${action.description}`);
        if (action.details) {
          this.printActionDetails(action.details, "      ");
        }
      });
    }

    // Summary
    console.log("\n" + "-".repeat(60));
    console.log(`Total actions: ${this.actions.length}`);
    console.log("-".repeat(60));
    console.log("");

    // Ask for confirmation
    const inquirer = require("inquirer");
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Do you want to proceed with these actions?",
        default: false,
      },
    ]);

    if (confirm) {
      this.logger.info("User approved dry-run actions");
      console.log("✅ Proceeding with execution...\n");
    } else {
      this.logger.info("User cancelled dry-run");
      console.log("❌ Operation cancelled by user\n");
    }

    return confirm;
  }

  /**
   * Group actions by type
   */
  private groupActionsByType(): Record<string, DryRunAction[]> {
    const grouped: Record<string, DryRunAction[]> = {};

    for (const action of this.actions) {
      if (!grouped[action.type]) {
        grouped[action.type] = [];
      }
      grouped[action.type].push(action);
    }

    return grouped;
  }

  /**
   * Get human-readable label for action type
   */
  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      create_directory: "Directory Creation",
      create_file: "File Creation",
      execute_command: "Command Execution",
      api_call: "API Calls",
      git_operation: "Git Operations",
    };

    return labels[type] || type;
  }

  /**
   * Print action details with indentation
   */
  private printActionDetails(details: any, indent: string): void {
    if (typeof details === "string") {
      console.log(`${indent}${details}`);
      return;
    }

    for (const [key, value] of Object.entries(details)) {
      if (typeof value === "object" && value !== null) {
        console.log(`${indent}${key}:`);
        this.printActionDetails(value, indent + "  ");
      } else {
        console.log(`${indent}${key}: ${value}`);
      }
    }
  }

  /**
   * Get all recorded actions
   */
  getActions(): DryRunAction[] {
    return [...this.actions];
  }

  /**
   * Clear all recorded actions
   */
  clear(): void {
    this.actions = [];
    this.logger.debug("Cleared dry-run actions");
  }

  /**
   * Export actions to JSON file
   *
   * @param filePath - Path to export file
   */
  exportToFile(filePath: string): void {
    const fs = require("fs");

    const exportData = {
      config: {
        appName: this.config.appName,
        description: this.config.description,
        features: this.config.features,
      },
      actions: this.actions,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
    this.logger.info("Exported dry-run actions", { filePath });
    console.log(`📄 Actions exported to: ${filePath}`);
  }
}

