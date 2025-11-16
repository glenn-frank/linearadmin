import { TemplateLoader } from "../utils/template-loader";
import * as fs from "fs";
import * as path from "path";

describe("TemplateLoader", () => {
  let templateLoader: TemplateLoader;
  let testTemplateDir: string;

  beforeEach(() => {
    // Create a temporary template directory for testing
    testTemplateDir = path.join(__dirname, "test-templates");
    if (!fs.existsSync(testTemplateDir)) {
      fs.mkdirSync(testTemplateDir, { recursive: true });
    }
    templateLoader = new TemplateLoader(testTemplateDir);
  });

  afterEach(() => {
    // Clean up test templates
    if (fs.existsSync(testTemplateDir)) {
      fs.rmSync(testTemplateDir, { recursive: true, force: true });
    }
  });

  describe("loadTemplate", () => {
    it("should load a template file successfully", () => {
      const templateContent = "Hello, World!";
      const templatePath = "test.template";
      fs.writeFileSync(
        path.join(testTemplateDir, templatePath),
        templateContent
      );

      const result = templateLoader.loadTemplate(templatePath);

      expect(result).toBe(templateContent);
    });

    it("should replace variables in template", () => {
      const templateContent = "Hello, {{name}}! You are {{age}} years old.";
      const templatePath = "greeting.template";
      fs.writeFileSync(
        path.join(testTemplateDir, templatePath),
        templateContent
      );

      const result = templateLoader.loadTemplate(templatePath, {
        name: "Alice",
        age: "30",
      });

      expect(result).toBe("Hello, Alice! You are 30 years old.");
    });

    it("should throw error if template not found", () => {
      expect(() => {
        templateLoader.loadTemplate("nonexistent.template");
      }).toThrow("Template not found");
    });

    it("should handle multiple variable replacements", () => {
      const templateContent = "{{greeting}} {{name}}, welcome to {{app}}!";
      const templatePath = "multi-var.template";
      fs.writeFileSync(
        path.join(testTemplateDir, templatePath),
        templateContent
      );

      const result = templateLoader.loadTemplate(templatePath, {
        greeting: "Hello",
        name: "Bob",
        app: "MyApp",
      });

      expect(result).toBe("Hello Bob, welcome to MyApp!");
    });
  });

  describe("loadTemplates", () => {
    it("should load multiple templates at once", () => {
      fs.writeFileSync(
        path.join(testTemplateDir, "template1.template"),
        "Content 1"
      );
      fs.writeFileSync(
        path.join(testTemplateDir, "template2.template"),
        "Content 2"
      );

      const result = templateLoader.loadTemplates([
        "template1.template",
        "template2.template",
      ]);

      expect(result["template1.template"]).toBe("Content 1");
      expect(result["template2.template"]).toBe("Content 2");
    });

    it("should apply variables to all templates", () => {
      fs.writeFileSync(
        path.join(testTemplateDir, "t1.template"),
        "Hello {{name}}"
      );
      fs.writeFileSync(
        path.join(testTemplateDir, "t2.template"),
        "Bye {{name}}"
      );

      const result = templateLoader.loadTemplates(
        ["t1.template", "t2.template"],
        { name: "Charlie" }
      );

      expect(result["t1.template"]).toBe("Hello Charlie");
      expect(result["t2.template"]).toBe("Bye Charlie");
    });
  });

  describe("templateExists", () => {
    it("should return true if template exists", () => {
      const templatePath = "exists.template";
      fs.writeFileSync(path.join(testTemplateDir, templatePath), "content");

      const result = templateLoader.templateExists(templatePath);

      expect(result).toBe(true);
    });

    it("should return false if template does not exist", () => {
      const result = templateLoader.templateExists("nonexistent.template");

      expect(result).toBe(false);
    });
  });

  describe("listTemplates", () => {
    it("should list all templates in a directory", () => {
      const subDir = "test-subdir";
      const fullSubDir = path.join(testTemplateDir, subDir);
      fs.mkdirSync(fullSubDir, { recursive: true });

      fs.writeFileSync(path.join(fullSubDir, "file1.template"), "content1");
      fs.writeFileSync(path.join(fullSubDir, "file2.template"), "content2");
      fs.writeFileSync(path.join(fullSubDir, "nottemplate.txt"), "ignored");

      const result = templateLoader.listTemplates(subDir);

      expect(result).toHaveLength(2);
      expect(result).toContain(path.join(subDir, "file1.template"));
      expect(result).toContain(path.join(subDir, "file2.template"));
      expect(result).not.toContain(path.join(subDir, "nottemplate.txt"));
    });

    it("should return empty array for nonexistent directory", () => {
      const result = templateLoader.listTemplates("nonexistent-dir");

      expect(result).toEqual([]);
    });
  });
});

