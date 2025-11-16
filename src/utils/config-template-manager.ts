import * as fs from "fs";
import * as path from "path";
import { Logger } from "./logger";
import { LaravelForgeAppConfig } from "../modules/ConfigurationManager";

/**
 * Configuration template structure
 */
export interface ConfigTemplate {
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** Partial configuration to apply */
  template: Partial<LaravelForgeAppConfig>;
  /** Custom issues specific to this template */
  customIssues?: Array<{
    title: string;
    description: string;
    priority: number;
    labels: string[];
    category: string;
    complexity: "low" | "medium" | "high";
  }>;
}

/**
 * Manages configuration templates for common application types
 *
 * Provides pre-built configurations for:
 * - Blog applications
 * - E-commerce platforms
 * - SaaS applications
 * - And custom user-defined templates
 *
 * @example
 * ```typescript
 * const manager = new ConfigTemplateManager(logger);
 * const templates = manager.listTemplates();
 * const config = manager.applyTemplate("blog", baseConfig);
 * ```
 */
export class ConfigTemplateManager {
  private logger: Logger;
  private templatesDir: string;

  constructor(logger: Logger, templatesDir?: string) {
    this.logger = logger;
    this.templatesDir =
      templatesDir || path.join(__dirname, "..", "config-templates");
  }

  /**
   * List all available templates
   *
   * @returns Array of template metadata
   */
  listTemplates(): Array<{ id: string; name: string; description: string }> {
    try {
      if (!fs.existsSync(this.templatesDir)) {
        this.logger.warn("Templates directory not found", undefined, {
          templatesDir: this.templatesDir,
        });
        return [];
      }

      const files = fs
        .readdirSync(this.templatesDir)
        .filter((file) => file.endsWith(".json"));

      const templates = files.map((file) => {
        const templatePath = path.join(this.templatesDir, file);
        const template: ConfigTemplate = JSON.parse(
          fs.readFileSync(templatePath, "utf8")
        );

        return {
          id: path.basename(file, ".json"),
          name: template.name,
          description: template.description,
        };
      });

      this.logger.info("Listed configuration templates", {
        count: templates.length,
      });

      return templates;
    } catch (error) {
      this.logger.error("Failed to list templates", error as Error);
      return [];
    }
  }

  /**
   * Load a template by ID
   *
   * @param templateId - Template identifier (filename without .json)
   * @returns Template object or null if not found
   */
  loadTemplate(templateId: string): ConfigTemplate | null {
    try {
      const templatePath = path.join(this.templatesDir, `${templateId}.json`);

      if (!fs.existsSync(templatePath)) {
        this.logger.warn("Template not found", undefined, { templateId });
        return null;
      }

      const template: ConfigTemplate = JSON.parse(
        fs.readFileSync(templatePath, "utf8")
      );

      this.logger.info("Loaded configuration template", {
        templateId,
        name: template.name,
      });

      return template;
    } catch (error) {
      this.logger.error("Failed to load template", error as Error, {
        templateId,
      });
      return null;
    }
  }

  /**
   * Apply a template to a base configuration
   *
   * @param templateId - Template to apply
   * @param baseConfig - Base configuration to merge with
   * @returns Merged configuration
   */
  applyTemplate(
    templateId: string,
    baseConfig: Partial<LaravelForgeAppConfig>
  ): Partial<LaravelForgeAppConfig> {
    const template = this.loadTemplate(templateId);

    if (!template) {
      this.logger.warn("Template not found, returning base config", undefined, {
        templateId,
      });
      return baseConfig;
    }

    // Merge template with base config (template values override base)
    const merged = {
      ...baseConfig,
      ...template.template,
    };

    this.logger.info("Applied configuration template", {
      templateId,
      templateName: template.name,
    });

    return merged;
  }

  /**
   * Save a custom template
   *
   * @param templateId - Identifier for the template
   * @param template - Template to save
   */
  saveTemplate(templateId: string, template: ConfigTemplate): void {
    try {
      if (!fs.existsSync(this.templatesDir)) {
        fs.mkdirSync(this.templatesDir, { recursive: true });
      }

      const templatePath = path.join(this.templatesDir, `${templateId}.json`);

      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));

      this.logger.info("Saved configuration template", {
        templateId,
        name: template.name,
      });

      console.log(`✅ Template saved: ${template.name}`);
      console.log(`📁 Location: ${templatePath}`);
    } catch (error) {
      this.logger.error("Failed to save template", error as Error, {
        templateId,
      });
      throw error;
    }
  }

  /**
   * Create a template from current configuration
   *
   * @param config - Current configuration
   * @param name - Template name
   * @param description - Template description
   * @returns Created template
   */
  createTemplateFromConfig(
    config: LaravelForgeAppConfig,
    name: string,
    description: string
  ): ConfigTemplate {
    // Extract template-worthy settings (exclude user-specific values)
    const template: Partial<LaravelForgeAppConfig> = {
      deploymentTarget: config.deploymentTarget,
      localDatabaseType: config.localDatabaseType,
      databaseType: config.databaseType,
      useForgeStorage: config.useForgeStorage,
      enableAIDependencies: config.enableAIDependencies,
      features: config.features,
      repoSubfolder: config.repoSubfolder,
      createForgeSite: config.createForgeSite,
      startDevelopment: config.startDevelopment,
    };

    return {
      name,
      description,
      template,
    };
  }

  /**
   * Delete a template
   *
   * @param templateId - Template to delete
   */
  deleteTemplate(templateId: string): boolean {
    try {
      const templatePath = path.join(this.templatesDir, `${templateId}.json`);

      if (!fs.existsSync(templatePath)) {
        this.logger.warn("Template not found for deletion", undefined, {
          templateId,
        });
        return false;
      }

      fs.unlinkSync(templatePath);

      this.logger.info("Deleted configuration template", { templateId });
      console.log(`🗑️  Template deleted: ${templateId}`);

      return true;
    } catch (error) {
      this.logger.error("Failed to delete template", error as Error, {
        templateId,
      });
      return false;
    }
  }

  /**
   * Get custom issues from a template
   *
   * @param templateId - Template identifier
   * @returns Array of custom issues or empty array
   */
  getCustomIssues(templateId: string): ConfigTemplate["customIssues"] {
    const template = this.loadTemplate(templateId);
    return template?.customIssues || [];
  }
}

