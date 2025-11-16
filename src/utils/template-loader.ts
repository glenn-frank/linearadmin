import * as fs from "fs";
import * as path from "path";

/**
 * Template loader utility for loading and processing template files
 */
export class TemplateLoader {
  private templateDir: string;

  constructor(templateDir?: string) {
    this.templateDir = templateDir || path.join(__dirname, "..", "templates");
  }

  /**
   * Load a template file and optionally replace variables
   * @param templatePath - Relative path to template file from templates directory
   * @param variables - Optional object with variable replacements
   * @returns Template content with variables replaced
   */
  loadTemplate(
    templatePath: string,
    variables?: Record<string, string>
  ): string {
    const fullPath = path.join(this.templateDir, templatePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Template not found: ${fullPath}`);
    }

    let content = fs.readFileSync(fullPath, "utf8");

    // Replace variables if provided
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        content = content.replace(new RegExp(placeholder, "g"), value);
      }
    }

    return content;
  }

  /**
   * Load multiple templates at once
   * @param templates - Array of template paths
   * @param variables - Optional shared variables for all templates
   * @returns Object with template paths as keys and content as values
   */
  loadTemplates(
    templates: string[],
    variables?: Record<string, string>
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const templatePath of templates) {
      result[templatePath] = this.loadTemplate(templatePath, variables);
    }

    return result;
  }

  /**
   * Check if a template exists
   * @param templatePath - Relative path to template file
   * @returns True if template exists
   */
  templateExists(templatePath: string): boolean {
    const fullPath = path.join(this.templateDir, templatePath);
    return fs.existsSync(fullPath);
  }

  /**
   * List all templates in a directory
   * @param subDir - Subdirectory within templates folder
   * @returns Array of template file names
   */
  listTemplates(subDir: string = ""): string[] {
    const dirPath = path.join(this.templateDir, subDir);

    if (!fs.existsSync(dirPath)) {
      return [];
    }

    return fs
      .readdirSync(dirPath)
      .filter((file) => file.endsWith(".template"))
      .map((file) => path.join(subDir, file));
  }
}

export const templateLoader = new TemplateLoader();

