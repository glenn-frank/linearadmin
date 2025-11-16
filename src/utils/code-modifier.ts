import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import * as fs from "fs";
import { Logger } from "./logger";

/**
 * AST-based code modification utility
 * 
 * Provides safe, structured code modification using Abstract Syntax Trees
 * instead of fragile regex-based string replacement.
 */
export class CodeModifier {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Modify a TypeScript/JavaScript file using AST
   * 
   * @param filePath - Path to file to modify
   * @param modifier - Function that modifies the AST
   * @returns Modified code as string
   */
  modifyFile(
    filePath: string,
    modifier: (ast: t.File) => void
  ): string {
    try {
      const code = fs.readFileSync(filePath, "utf8");
      return this.modifyCode(code, modifier);
    } catch (error) {
      this.logger.error("Failed to modify file", error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Modify code string using AST
   * 
   * @param code - Source code string
   * @param modifier - Function that modifies the AST
   * @returns Modified code as string
   */
  modifyCode(
    code: string,
    modifier: (ast: t.File) => void
  ): string {
    try {
      // Parse code into AST
      const ast = parser.parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });

      // Apply modifications
      modifier(ast);

      // Generate modified code
      const output = generate(ast, {
        retainLines: false,
        compact: false,
      });

      return output.code;
    } catch (error) {
      this.logger.error("Failed to modify code", error as Error);
      throw error;
    }
  }

  /**
   * Add import statement to a file
   * 
   * @param filePath - Path to file
   * @param importPath - Module to import from
   * @param imports - Named imports or default import
   */
  addImport(
    filePath: string,
    importPath: string,
    imports: string | string[]
  ): string {
    return this.modifyFile(filePath, (ast) => {
      const importArray = Array.isArray(imports) ? imports : [imports];
      
      // Create import specifiers
      const specifiers = importArray.map((name) =>
        t.importSpecifier(t.identifier(name), t.identifier(name))
      );

      // Create import declaration
      const importDeclaration = t.importDeclaration(
        specifiers,
        t.stringLiteral(importPath)
      );

      // Add to program body at the beginning
      ast.program.body.unshift(importDeclaration);
    });
  }

  /**
   * Find and replace a function by name
   * 
   * @param code - Source code
   * @param functionName - Name of function to replace
   * @param newFunction - New function AST node
   * @returns Modified code
   */
  replaceFunction(
    code: string,
    functionName: string,
    newFunction: t.FunctionDeclaration
  ): string {
    return this.modifyCode(code, (ast) => {
      traverse(ast, {
        FunctionDeclaration(path) {
          if (path.node.id?.name === functionName) {
            path.replaceWith(newFunction);
            path.stop();
          }
        },
      });
    });
  }

  /**
   * Add a method to a class
   * 
   * @param code - Source code containing the class
   * @param className - Name of the class
   * @param method - Method to add
   * @returns Modified code
   */
  addClass Method(
    code: string,
    className: string,
    method: t.ClassMethod
  ): string {
    return this.modifyCode(code, (ast) => {
      traverse(ast, {
        ClassDeclaration(path) {
          if (path.node.id?.name === className) {
            path.node.body.body.push(method);
            path.stop();
          }
        },
      });
    });
  }

  /**
   * Update package.json scripts programmatically
   * 
   * @param packageJsonPath - Path to package.json
   * @param scripts - Scripts to add/update
   */
  updatePackageJsonScripts(
    packageJsonPath: string,
    scripts: Record<string, string>
  ): void {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8")
      );

      packageJson.scripts = {
        ...packageJson.scripts,
        ...scripts,
      };

      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2)
      );

      this.logger.info("Updated package.json scripts", {
        packageJsonPath,
        scriptsAdded: Object.keys(scripts),
      });
    } catch (error) {
      this.logger.error(
        "Failed to update package.json",
        error as Error,
        { packageJsonPath }
      );
      throw error;
    }
  }

  /**
   * Safe JSON modification with validation
   * 
   * @param filePath - Path to JSON file
   * @param modifier - Function that modifies the parsed JSON
   */
  modifyJsonFile(
    filePath: string,
    modifier: (json: any) => void
  ): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const json = JSON.parse(content);

      // Apply modification
      modifier(json);

      // Write back with formatting
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2));

      this.logger.info("Modified JSON file", { filePath });
    } catch (error) {
      this.logger.error("Failed to modify JSON file", error as Error, {
        filePath,
      });
      throw error;
    }
  }
}

/**
 * Helper functions for creating AST nodes
 */
export class ASTHelpers {
  /**
   * Create a simple object property
   */
  static createObjectProperty(
    key: string,
    value: string | number | boolean
  ): t.ObjectProperty {
    let valueNode: t.Expression;

    if (typeof value === "string") {
      valueNode = t.stringLiteral(value);
    } else if (typeof value === "number") {
      valueNode = t.numericLiteral(value);
    } else {
      valueNode = t.booleanLiteral(value);
    }

    return t.objectProperty(t.identifier(key), valueNode);
  }

  /**
   * Create an import statement
   */
  static createImport(
    imports: string[],
    from: string
  ): t.ImportDeclaration {
    const specifiers = imports.map((name) =>
      t.importSpecifier(t.identifier(name), t.identifier(name))
    );

    return t.importDeclaration(specifiers, t.stringLiteral(from));
  }

  /**
   * Create a simple function declaration
   */
  static createFunction(
    name: string,
    params: string[],
    body: t.Statement[]
  ): t.FunctionDeclaration {
    const paramNodes = params.map((param) =>
      t.identifier(param)
    );

    return t.functionDeclaration(
      t.identifier(name),
      paramNodes,
      t.blockStatement(body)
    );
  }
}


