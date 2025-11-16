import { CodeModifier, ASTHelpers } from "../utils/code-modifier";
import { Logger, LogLevel } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

describe("CodeModifier", () => {
  let codeModifier: CodeModifier;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger(LogLevel.ERROR, undefined, false);
    codeModifier = new CodeModifier(logger);
  });

  describe("modifyCode", () => {
    it("should parse and regenerate code without modification", () => {
      const sourceCode = `
const greeting = "Hello, World!";
console.log(greeting);
      `.trim();

      const result = codeModifier.modifyCode(sourceCode, () => {
        // No modification
      });

      expect(result).toContain("greeting");
      expect(result).toContain("Hello, World!");
    });

    it("should handle TypeScript code", () => {
      const tsCode = `
interface Person {
  name: string;
  age: number;
}

const person: Person = {
  name: "Alice",
  age: 30
};
      `.trim();

      const result = codeModifier.modifyCode(tsCode, () => {
        // No modification
      });

      expect(result).toContain("interface Person");
      expect(result).toContain("name: string");
    });

    it("should handle JSX code", () => {
      const jsxCode = `
import React from 'react';

const App = () => {
  return <div>Hello</div>;
};
      `.trim();

      const result = codeModifier.modifyCode(jsxCode, () => {
        // No modification
      });

      expect(result).toContain("import React");
      expect(result).toContain("<div>");
    });
  });

  describe("updatePackageJsonScripts", () => {
    let testPackageJson: string;

    beforeEach(() => {
      testPackageJson = path.join(__dirname, "test-package.json");
      const initialContent = {
        name: "test-package",
        scripts: {
          start: "node index.js",
        },
      };
      fs.writeFileSync(
        testPackageJson,
        JSON.stringify(initialContent, null, 2)
      );
    });

    afterEach(() => {
      if (fs.existsSync(testPackageJson)) {
        fs.unlinkSync(testPackageJson);
      }
    });

    it("should add new scripts to package.json", () => {
      codeModifier.updatePackageJsonScripts(testPackageJson, {
        test: "jest",
        build: "tsc",
      });

      const result = JSON.parse(fs.readFileSync(testPackageJson, "utf8"));

      expect(result.scripts.test).toBe("jest");
      expect(result.scripts.build).toBe("tsc");
      expect(result.scripts.start).toBe("node index.js"); // Preserved
    });

    it("should overwrite existing scripts", () => {
      codeModifier.updatePackageJsonScripts(testPackageJson, {
        start: "tsx index.ts",
      });

      const result = JSON.parse(fs.readFileSync(testPackageJson, "utf8"));

      expect(result.scripts.start).toBe("tsx index.ts");
    });
  });

  describe("modifyJsonFile", () => {
    let testJsonFile: string;

    beforeEach(() => {
      testJsonFile = path.join(__dirname, "test.json");
      fs.writeFileSync(
        testJsonFile,
        JSON.stringify({ version: "1.0.0", name: "test" }, null, 2)
      );
    });

    afterEach(() => {
      if (fs.existsSync(testJsonFile)) {
        fs.unlinkSync(testJsonFile);
      }
    });

    it("should modify JSON file correctly", () => {
      codeModifier.modifyJsonFile(testJsonFile, (json) => {
        json.version = "2.0.0";
        json.newField = "added";
      });

      const result = JSON.parse(fs.readFileSync(testJsonFile, "utf8"));

      expect(result.version).toBe("2.0.0");
      expect(result.newField).toBe("added");
      expect(result.name).toBe("test"); // Preserved
    });

    it("should handle nested objects", () => {
      codeModifier.modifyJsonFile(testJsonFile, (json) => {
        json.config = {
          nested: {
            deep: "value",
          },
        };
      });

      const result = JSON.parse(fs.readFileSync(testJsonFile, "utf8"));

      expect(result.config.nested.deep).toBe("value");
    });
  });
});

describe("ASTHelpers", () => {
  describe("createObjectProperty", () => {
    it("should create string property", () => {
      const prop = ASTHelpers.createObjectProperty("name", "Alice");

      expect(prop.type).toBe("ObjectProperty");
      expect((prop.key as any).name).toBe("name");
      expect((prop.value as any).value).toBe("Alice");
    });

    it("should create number property", () => {
      const prop = ASTHelpers.createObjectProperty("age", 30);

      expect(prop.type).toBe("ObjectProperty");
      expect((prop.value as any).value).toBe(30);
    });

    it("should create boolean property", () => {
      const prop = ASTHelpers.createObjectProperty("active", true);

      expect(prop.type).toBe("ObjectProperty");
      expect((prop.value as any).value).toBe(true);
    });
  });

  describe("createImport", () => {
    it("should create import declaration", () => {
      const importDecl = ASTHelpers.createImport(["foo", "bar"], "./module");

      expect(importDecl.type).toBe("ImportDeclaration");
      expect(importDecl.specifiers).toHaveLength(2);
      expect((importDecl.source as any).value).toBe("./module");
    });

    it("should handle single import", () => {
      const importDecl = ASTHelpers.createImport(["single"], "./single");

      expect(importDecl.specifiers).toHaveLength(1);
      expect((importDecl.specifiers[0] as any).imported.name).toBe("single");
    });
  });

  describe("createFunction", () => {
    it("should create function declaration", () => {
      const func = ASTHelpers.createFunction(
        "myFunc",
        ["param1", "param2"],
        []
      );

      expect(func.type).toBe("FunctionDeclaration");
      expect(func.id?.name).toBe("myFunc");
      expect(func.params).toHaveLength(2);
    });

    it("should handle function with no params", () => {
      const func = ASTHelpers.createFunction("noParams", [], []);

      expect(func.params).toHaveLength(0);
    });
  });
});

