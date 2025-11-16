#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import inquirer from "inquirer";
import axios from "axios";
import { TeamManager } from "./team-management";

// Load environment variables
dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();

if (!LINEAR_KEY) {
  console.error("❌ Missing required .env values:");
  console.error("  - LINEAR_API_KEY missing");
  process.exit(1);
}

if (!OPENAI_KEY && !ANTHROPIC_KEY) {
  console.error("❌ Missing AI API keys:");
  console.error("  - OPENAI_API_KEY or ANTHROPIC_API_KEY required");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractJsonArrayFromText(text: string) {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  // Fallback: extract the first top-level JSON array substring
  const start = text.indexOf("[");
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return text;
}

async function generateDetailedIssuesFromAnalysis(
  analysisData: any,
  includeTypes: string[]
): Promise<any[]> {
  console.log("\n🧠 Generating detailed issues from analysis...");

  const includeTypesList = includeTypes.join(", ");

  const prompt = `
You are an expert software architect and technical analyst. Your task is to analyze codebase findings and create comprehensive, actionable Linear issues that will be worked on by AI agents (like Cursor agents). Each issue must be extremely detailed and self-contained.

Based on the codebase analysis provided, create detailed issues focusing on: ${includeTypesList}

For each issue identified, create a detailed issue that includes:

1. **Title**: Clear, actionable title (max 255 characters)
2. **Description**: Comprehensive description including:
   - Detailed problem statement and current state
   - Specific code examples and file locations
   - Root cause analysis
   - Business impact and user experience implications
   - Technical constraints and considerations
3. **Priority**: High/Medium/Low based on:
   - Severity of the issue
   - User experience impact
   - Technical complexity and risk
   - Dependencies and blocking factors
4. **Requirements**: Array of specific, detailed technical requirements including:
   - What needs to be fixed or implemented
   - Specific code changes needed
   - Security, performance, or reliability requirements
   - Integration requirements
5. **Acceptance_Criteria**: Array of comprehensive, testable criteria including:
   - Functional acceptance criteria (issue is fixed and works as specified)
   - Performance acceptance criteria (response times, behavior)
   - Security acceptance criteria (authentication, authorization, data protection)
   - Error handling and edge case criteria
   - Data validation and integrity criteria
6. **Technical_Notes**: Array of detailed implementation guidance including:
   - Specific files and functions to modify
   - Code examples and patterns to follow
   - Architecture and design considerations
   - Technology stack recommendations
   - Testing strategy and test cases
   - Deployment and configuration requirements
   - Monitoring and logging requirements
   - Error handling and recovery procedures

**CRITICAL: AI Agent Requirements**
These issues will be worked on by AI agents, so they need to be extremely detailed and self-contained:

- **Each issue must be implementable by an AI agent without additional context**
- **Include specific code examples, file paths, and line numbers where possible**
- **Provide detailed step-by-step implementation guidance**
- **Include specific testing scenarios and validation criteria**
- **Specify exact error handling and edge cases**
- **Include performance benchmarks and monitoring requirements**
- **Provide clear success criteria and completion metrics**

**STRUCTURE REQUIREMENTS:**
Each issue MUST include these exact sections in this order:
1. **Description** - Detailed problem statement and context
2. **Requirements** - Bulleted list of specific requirements
3. **Acceptance Criteria** - Bulleted list of testable criteria
4. **Technical Notes** - Implementation guidance and considerations

**SUB-ISSUE CREATION - MANDATORY:**
For complex issues or large features, you MUST break them down into sub-issues:
- Create parent issues for major systems (e.g., "Fix Authentication System Issues")
- Create child issues for specific components (e.g., "Session Management Module", "Password Validation Module")
- Each sub-issue should be independently implementable
- Include dependencies and relationships between issues
- Ensure each sub-issue has complete requirements and acceptance criteria
- Use descriptive titles that indicate the parent-child relationship
- Include a "parent_issue" field to link related issues
- When you see multiple issues of the same type (e.g., "AI Detected: Code Quality"), create separate sub-issues for each unique problem

**CRITICAL REQUIREMENT:** For each major system with issues, you MUST create:
1. One parent issue for the overall system
2. AT LEAST 3-5 sub-issues for specific components/modules within that system
3. Each sub-issue should be a specific, implementable fix

**IMPORTANT:** You MUST create issues for ALL problems found in the analysis. Do NOT filter or consolidate issues. If the analysis found 41 issues, create at least 30-40 detailed issues. Only skip if:
- The issue description says "no issues found" or similar
- The issue is a duplicate of another issue you've already created

**Quality Standards for AI Agents:**
- Each issue should be actionable and specific enough for an AI agent to implement
- Include sufficient detail for estimation and planning
- Consider the full software development lifecycle
- Include both positive and negative test scenarios
- Address scalability and maintainability concerns
- Provide specific implementation details and code examples
- Include detailed testing and validation procedures
- Specify exact performance and security requirements

**Example Structure for AI Agent Issues:**

**Title:** "Fix: Session Management Authentication Issues"

**Description:** 
"The Session component has async functions without proper error handling, which can lead to undefined behavior or crashes. Located in electron/src/database/entities/Session.ts. This affects 137 components across 137 files and can cause users to be unexpectedly logged out or lose session data."

**Requirements:**
1. "Add try-catch blocks to all async functions in Session management"
2. "Implement proper error logging and user-friendly error messages"
3. "Add session validation and error recovery mechanisms"
4. "Create session timeout handling with proper cleanup"

**Acceptance_Criteria:**
1. "All async functions in Session.ts have proper error handling"
2. "Session errors are logged appropriately without exposing sensitive data"
3. "Users receive clear error messages when session issues occur"
4. "Session timeout properly logs users out and cleans up resources"
5. "No undefined behavior occurs during async operations"

**Technical_Notes:**
1. "File: electron/src/database/entities/Session.ts"
2. "Add try-catch to async function around line 45"
3. "Use winston logger for error logging: logger.error('Session error:', error)"
4. "Test with invalid session data and network failures"
5. "Ensure error handling doesn't leak sensitive information"

**CODEBASE ANALYSIS DATA:**
${JSON.stringify(analysisData, null, 2)}

**GENERATION RULES:**
- Create MORE issues, not fewer
- Don't consolidate similar issues unless they're EXACTLY the same
- Each unique file/component/problem should get its own issue
- Create parent/child relationships liberally
- Aim for 70-80% issue generation rate (if 41 issues found, create 30-35 issues)

Respond in pure JSON array format with all issues found. Each issue should be comprehensive and detailed enough to serve as a complete specification for AI agent implementation.
`;

  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert software architect and technical analyst specializing in code quality, security, and performance. You MUST create comprehensive issues for ALL problems found.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }
    );

    const raw = res.data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No response content from OpenAI.");

    const jsonCandidate = extractJsonArrayFromText(raw);
    const issues = JSON.parse(jsonCandidate);

    console.log(`✅ Generated ${issues.length} detailed issues from analysis`);
    return issues;
  } catch (err: any) {
    console.error(
      "\n❌ OpenAI issue generation failed:",
      err.response?.data || err.message
    );
    throw err;
  }
}

function getAnalysisTypeLabel(analysisMode: AnalysisMode): string {
  switch (analysisMode) {
    case "architecture":
      return "Architecture Review";
    case "end-user":
      return "End User Review";
    case "security":
      return "Security Review";
    case "performance":
      return "Performance Review";
    default:
      return "Code Review";
  }
}

type AnalysisMode = "architecture" | "end-user" | "security" | "performance";
type AnalysisDepth = "lightweight" | "deep";

interface AnalysisResult {
  projectName: string;
  mode: AnalysisMode;
  depth: AnalysisDepth;
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  fileStructure: FileInfo[];
  patterns: PatternInfo[];
  issues: IssueInfo[];
  suggestions: string[];
  userFeatures: UserFeature[];
  userFlows: UserFlow[];
  detailedFeatures: DetailedFeature[];
}

interface FileInfo {
  path: string;
  type: string;
  size: number;
  language?: string;
  framework?: string;
}

interface PatternInfo {
  type: string;
  description: string;
  files: string[];
  severity: "low" | "medium" | "high";
}

interface IssueInfo {
  title: string;
  description: string;
  type: "bug" | "feature" | "improvement" | "refactor";
  priority: "low" | "medium" | "high" | "urgent";
  files: string[];
  category: string;
}

interface UserFeature {
  name: string;
  description: string;
  files: string[];
  completeness: "complete" | "partial" | "missing";
  userImpact: "high" | "medium" | "low";
}

interface UserFlow {
  name: string;
  description: string;
  steps: string[];
  files: string[];
  status: "working" | "broken" | "incomplete";
}

interface DetailedFeature {
  name: string;
  description: string;
  files: string[];
  components: FeatureComponent[];
  status: "working" | "partial" | "broken" | "missing";
  issues: string[];
  improvements: string[];
  priority: "high" | "medium" | "low";
}

interface FeatureComponent {
  name: string;
  type: "component" | "service" | "hook" | "page" | "utility";
  file: string;
  status: "working" | "partial" | "broken" | "missing";
  issues: string[];
  dependencies: string[];
}

class CodebaseAnalyzer {
  private targetPath: string;
  private analysisResult: AnalysisResult;
  private mode: AnalysisMode;
  private depth: AnalysisDepth;

  constructor(
    targetPath: string,
    mode: AnalysisMode = "architecture",
    depth: AnalysisDepth = "lightweight"
  ) {
    this.targetPath = path.resolve(targetPath);
    this.mode = mode;
    this.depth = depth;
    this.analysisResult = {
      projectName: path.basename(this.targetPath),
      mode: this.mode,
      depth: this.depth,
      languages: [],
      frameworks: [],
      dependencies: [],
      fileStructure: [],
      patterns: [],
      issues: [],
      suggestions: [],
      userFeatures: [],
      userFlows: [],
      detailedFeatures: [],
    };
  }

  async analyze(): Promise<AnalysisResult> {
    console.log(`🔍 Analyzing codebase at: ${this.targetPath}`);
    console.log(`📋 Analysis mode: ${this.mode}`);
    console.log(`🔬 Analysis depth: ${this.depth}`);

    if (!fs.existsSync(this.targetPath)) {
      throw new Error(`Path does not exist: ${this.targetPath}`);
    }

    await this.scanFileStructure();
    await this.detectLanguages();
    await this.detectFrameworks();
    await this.detectDependencies();

    // Single comprehensive analysis scan
    if (this.depth === "deep") {
      // For deep analysis, perform comprehensive AI-powered analysis
      await this.performAIDeepAnalysis();
    } else {
      // For lightweight mode, do basic analysis based on mode
      switch (this.mode) {
        case "architecture":
          await this.analyzeArchitecture();
          break;
        case "end-user":
          await this.analyzeEndUser();
          break;
        case "security":
          await this.analyzeSecurity();
          break;
        case "performance":
          await this.analyzePerformance();
          break;
      }
    }

    await this.generateSuggestions();

    return this.analysisResult;
  }

  private async scanFileStructure(): Promise<void> {
    console.log("📁 Scanning file structure...");

    const scanDirectory = (dir: string, relativePath: string = ""): void => {
      try {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const relativeItemPath = path.join(relativePath, item);

          try {
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
              // Skip common directories to ignore
              if (
                ![
                  "node_modules",
                  ".git",
                  "dist",
                  "build",
                  ".next",
                  "coverage",
                ].includes(item)
              ) {
                scanDirectory(fullPath, relativeItemPath);
              }
            } else {
              // Skip socket files, pipes, and other non-readable files
              if (stats.isFile() && stats.size > 0) {
                const fileInfo: FileInfo = {
                  path: relativeItemPath,
                  type: this.getFileType(item),
                  size: stats.size,
                };

                this.analysisResult.fileStructure.push(fileInfo);
              }
            }
          } catch (statError) {
            // Skip files that can't be stat'd (sockets, pipes, etc.)
            console.log(`⚠️ Skipping unreadable file: ${relativeItemPath}`);
          }
        }
      } catch (readError) {
        console.log(`⚠️ Skipping unreadable directory: ${relativePath}`);
      }
    };

    scanDirectory(this.targetPath);
    console.log(`Found ${this.analysisResult.fileStructure.length} files`);
  }

  private getFileType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const typeMap: { [key: string]: string } = {
      ".js": "JavaScript",
      ".ts": "TypeScript",
      ".tsx": "TypeScript React",
      ".jsx": "JavaScript React",
      ".py": "Python",
      ".java": "Java",
      ".go": "Go",
      ".rs": "Rust",
      ".php": "PHP",
      ".rb": "Ruby",
      ".css": "CSS",
      ".scss": "SCSS",
      ".sass": "SASS",
      ".html": "HTML",
      ".json": "JSON",
      ".yaml": "YAML",
      ".yml": "YAML",
      ".md": "Markdown",
      ".sql": "SQL",
      ".sh": "Shell Script",
      ".bat": "Batch Script",
      ".ps1": "PowerShell",
      ".dockerfile": "Dockerfile",
      ".env": "Environment",
      ".gitignore": "Git Ignore",
      ".gitattributes": "Git Attributes",
    };

    return typeMap[ext] || "Unknown";
  }

  private async detectLanguages(): Promise<void> {
    console.log("🔤 Detecting programming languages...");

    const languageCount: { [key: string]: number } = {};

    for (const file of this.analysisResult.fileStructure) {
      if (file.type !== "Unknown") {
        languageCount[file.type] = (languageCount[file.type] || 0) + 1;
      }
    }

    this.analysisResult.languages = Object.keys(languageCount).sort(
      (a, b) => languageCount[b] - languageCount[a]
    );
  }

  private async detectFrameworks(): Promise<void> {
    console.log("⚙️ Detecting frameworks and libraries...");

    const frameworkIndicators: { [key: string]: string[] } = {
      React: ["react", "jsx", "tsx"],
      Vue: ["vue", "nuxt"],
      Angular: ["angular", "@angular"],
      "Next.js": ["next", "next.config"],
      Express: ["express"],
      FastAPI: ["fastapi", "uvicorn"],
      Django: ["django", "manage.py"],
      Flask: ["flask"],
      "Spring Boot": ["spring-boot", "springframework"],
      Laravel: ["laravel", "artisan"],
      Rails: ["rails", "gemfile"],
      "Tailwind CSS": ["tailwind"],
      Bootstrap: ["bootstrap"],
      "Material-UI": ["@mui", "material-ui"],
      "Chakra UI": ["@chakra-ui"],
      "Ant Design": ["antd"],
      TypeScript: ["typescript", "tsconfig"],
      Webpack: ["webpack"],
      Vite: ["vite"],
      Parcel: ["parcel"],
      Jest: ["jest"],
      Cypress: ["cypress"],
      Playwright: ["playwright"],
      Storybook: ["storybook"],
    };

    const detectedFrameworks: string[] = [];

    // Check package.json files
    const packageJsonFiles = this.analysisResult.fileStructure.filter(
      (f) =>
        f.path.includes("package.json") ||
        f.path.includes("requirements.txt") ||
        f.path.includes("Pipfile") ||
        f.path.includes("composer.json") ||
        f.path.includes("Gemfile") ||
        f.path.includes("pom.xml") ||
        f.path.includes("build.gradle") ||
        f.path.includes("Cargo.toml")
    );

    for (const file of packageJsonFiles) {
      try {
        const content = fs.readFileSync(
          path.join(this.targetPath, file.path),
          "utf8"
        );

        for (const [framework, indicators] of Object.entries(
          frameworkIndicators
        )) {
          if (
            indicators.some((indicator) =>
              content.toLowerCase().includes(indicator.toLowerCase())
            )
          ) {
            if (!detectedFrameworks.includes(framework)) {
              detectedFrameworks.push(framework);
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    this.analysisResult.frameworks = detectedFrameworks;
  }

  private async detectDependencies(): Promise<void> {
    console.log("📦 Detecting dependencies...");

    const dependencyFiles = this.analysisResult.fileStructure.filter(
      (f) =>
        f.path.includes("package.json") ||
        f.path.includes("requirements.txt") ||
        f.path.includes("Pipfile") ||
        f.path.includes("composer.json") ||
        f.path.includes("Gemfile") ||
        f.path.includes("pom.xml") ||
        f.path.includes("build.gradle") ||
        f.path.includes("Cargo.toml")
    );

    const dependencies: string[] = [];

    for (const file of dependencyFiles) {
      try {
        const content = fs.readFileSync(
          path.join(this.targetPath, file.path),
          "utf8"
        );

        if (file.path.includes("package.json")) {
          const packageJson = JSON.parse(content);
          const allDeps = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
            ...packageJson.peerDependencies,
          };
          dependencies.push(...Object.keys(allDeps));
        } else if (file.path.includes("requirements.txt")) {
          const lines = content.split("\n");
          dependencies.push(
            ...lines
              .filter(
                (line) =>
                  line.trim() && !line.startsWith("#") && !line.startsWith("-")
              )
              .map((line) =>
                line.split("==")[0].split(">=")[0].split("<=")[0].trim()
              )
          );
        }
      } catch (error) {
        // Skip files that can't be parsed
      }
    }

    this.analysisResult.dependencies = [...new Set(dependencies)].sort();
  }

  private async analyzeArchitecture(): Promise<void> {
    console.log("🔍 Analyzing code patterns...");

    const patterns: PatternInfo[] = [];

    // Check for common patterns
    const jsFiles = this.analysisResult.fileStructure.filter(
      (f) => f.type.includes("JavaScript") || f.type.includes("TypeScript")
    );

    // Check for potential issues
    for (const file of jsFiles) {
      try {
        const content = fs.readFileSync(
          path.join(this.targetPath, file.path),
          "utf8"
        );

        // Skip console.log checks - user requested to ignore

        // Check for TODO/FIXME comments
        if (content.includes("TODO") || content.includes("FIXME")) {
          patterns.push({
            type: "Pending Tasks",
            description: "Found TODO/FIXME comments that need attention",
            files: [file.path],
            severity: "low",
          });
        }

        // Skip large file checks - user requested to ignore

        // Check for missing error handling
        if (
          content.includes("async") &&
          !content.includes("try") &&
          !content.includes("catch")
        ) {
          patterns.push({
            type: "Missing Error Handling",
            description: "Async functions without proper error handling",
            files: [file.path],
            severity: "high",
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    this.analysisResult.patterns = patterns;
  }

  private async analyzeEndUser(): Promise<void> {
    console.log("👤 Analyzing end-user functionality...");

    const userFeatures: UserFeature[] = [];
    const userFlows: UserFlow[] = [];

    // Analyze user-facing features
    const userFacingFiles = this.analysisResult.fileStructure.filter(
      (f) =>
        f.type.includes("HTML") ||
        f.type.includes("React") ||
        f.path.includes("component") ||
        f.path.includes("page") ||
        f.path.includes("view") ||
        f.path.includes("ui")
    );

    // Common user features to look for
    const commonFeatures = [
      {
        name: "User Authentication",
        keywords: ["login", "auth", "signin", "signup", "register"],
      },
      {
        name: "User Profile",
        keywords: ["profile", "account", "settings", "preferences"],
      },
      {
        name: "Dashboard",
        keywords: ["dashboard", "home", "overview", "summary"],
      },
      {
        name: "Data Management",
        keywords: ["create", "edit", "delete", "update", "manage"],
      },
      {
        name: "Search Functionality",
        keywords: ["search", "filter", "query", "find"],
      },
      {
        name: "Navigation",
        keywords: ["nav", "menu", "sidebar", "header", "footer"],
      },
      { name: "Forms", keywords: ["form", "input", "submit", "validation"] },
      {
        name: "Notifications",
        keywords: ["notification", "alert", "message", "toast"],
      },
      {
        name: "File Upload",
        keywords: ["upload", "file", "image", "document"],
      },
      {
        name: "Export/Import",
        keywords: ["export", "import", "download", "csv", "pdf"],
      },
    ];

    // Check for user features
    for (const feature of commonFeatures) {
      const featureFiles = userFacingFiles.filter((f) => {
        try {
          const content = fs
            .readFileSync(path.join(this.targetPath, f.path), "utf8")
            .toLowerCase();
          return feature.keywords.some((keyword) => content.includes(keyword));
        } catch {
          return false;
        }
      });

      if (featureFiles.length > 0) {
        userFeatures.push({
          name: feature.name,
          description: `Found ${featureFiles.length} files related to ${feature.name}`,
          files: featureFiles.map((f) => f.path),
          completeness: featureFiles.length > 2 ? "complete" : "partial",
          userImpact:
            feature.name.includes("Authentication") ||
            feature.name.includes("Dashboard")
              ? "high"
              : "medium",
        });
      }
    }

    // Analyze user flows
    const flowPatterns = [
      {
        name: "Registration Flow",
        keywords: ["register", "signup", "create account"],
      },
      { name: "Login Flow", keywords: ["login", "signin", "authenticate"] },
      {
        name: "Profile Update Flow",
        keywords: ["profile", "update", "edit account"],
      },
      {
        name: "Data Creation Flow",
        keywords: ["create", "add", "new", "submit"],
      },
      {
        name: "Data Viewing Flow",
        keywords: ["view", "display", "show", "list"],
      },
      { name: "Search Flow", keywords: ["search", "filter", "find"] },
    ];

    for (const flow of flowPatterns) {
      const flowFiles = userFacingFiles.filter((f) => {
        try {
          const content = fs
            .readFileSync(path.join(this.targetPath, f.path), "utf8")
            .toLowerCase();
          return flow.keywords.some((keyword) => content.includes(keyword));
        } catch {
          return false;
        }
      });

      if (flowFiles.length > 0) {
        userFlows.push({
          name: flow.name,
          description: `User flow for ${flow.name}`,
          steps: flow.keywords,
          files: flowFiles.map((f) => f.path),
          status: flowFiles.length > 1 ? "working" : "incomplete",
        });
      }
    }

    // Check for missing critical user features
    const criticalFeatures = ["User Authentication", "Dashboard", "Navigation"];
    const missingFeatures = criticalFeatures.filter(
      (critical) => !userFeatures.some((feature) => feature.name === critical)
    );

    for (const missing of missingFeatures) {
      userFeatures.push({
        name: missing,
        description: `Missing critical user feature: ${missing}`,
        files: [],
        completeness: "missing",
        userImpact: "high",
      });
    }

    this.analysisResult.userFeatures = userFeatures;
    this.analysisResult.userFlows = userFlows;

    // Convert user analysis to patterns for issue generation
    const patterns: PatternInfo[] = [];

    for (const feature of userFeatures) {
      if (feature.completeness === "missing") {
        patterns.push({
          type: "Missing User Feature",
          description: feature.description,
          files: feature.files,
          severity: "high",
        });
      } else if (feature.completeness === "partial") {
        patterns.push({
          type: "Incomplete User Feature",
          description: feature.description,
          files: feature.files,
          severity: "medium",
        });
      }
    }

    for (const flow of userFlows) {
      if (flow.status === "incomplete") {
        patterns.push({
          type: "Incomplete User Flow",
          description: flow.description,
          files: flow.files,
          severity: "medium",
        });
      }
    }

    this.analysisResult.patterns = patterns;
  }

  private async detectMajorFeatures(): Promise<any[]> {
    console.log("🔍 Detecting major features from codebase...");

    const features: any[] = [];
    const featurePatterns = [
      {
        name: "Authentication System",
        keywords: [
          "auth",
          "login",
          "signin",
          "signup",
          "register",
          "user",
          "session",
        ],
        filePatterns: ["auth", "login", "user", "session"],
      },
      {
        name: "Dashboard & Analytics",
        keywords: [
          "dashboard",
          "analytics",
          "chart",
          "graph",
          "metrics",
          "stats",
        ],
        filePatterns: ["dashboard", "analytics", "chart", "metric"],
      },
      {
        name: "Data Management",
        keywords: [
          "crud",
          "create",
          "read",
          "update",
          "delete",
          "manage",
          "data",
        ],
        filePatterns: ["crud", "manage", "data", "model"],
      },
      {
        name: "File Management",
        keywords: ["upload", "download", "file", "document", "image", "media"],
        filePatterns: ["upload", "file", "media", "document"],
      },
      {
        name: "Search & Filtering",
        keywords: ["search", "filter", "query", "find", "lookup"],
        filePatterns: ["search", "filter", "query"],
      },
      {
        name: "Navigation & Routing",
        keywords: ["nav", "menu", "route", "router", "sidebar", "header"],
        filePatterns: ["nav", "menu", "route", "sidebar"],
      },
      {
        name: "Forms & Validation",
        keywords: ["form", "input", "validate", "submit", "field"],
        filePatterns: ["form", "input", "validate"],
      },
      {
        name: "API Integration",
        keywords: ["api", "service", "client", "request", "response"],
        filePatterns: ["api", "service", "client"],
      },
      {
        name: "Database Operations",
        keywords: ["database", "db", "sql", "query", "repository"],
        filePatterns: ["database", "db", "repository"],
      },
      {
        name: "Real-time Features",
        keywords: ["websocket", "socket", "realtime", "live", "stream"],
        filePatterns: ["websocket", "socket", "realtime", "stream"],
      },
    ];

    for (const pattern of featurePatterns) {
      const matchingFiles = this.analysisResult.fileStructure.filter((file) => {
        const fileName = file.path.toLowerCase();
        const hasKeywordMatch = pattern.keywords.some((keyword) =>
          fileName.includes(keyword.toLowerCase())
        );
        const hasPatternMatch = pattern.filePatterns.some((filePattern) =>
          fileName.includes(filePattern.toLowerCase())
        );
        return hasKeywordMatch || hasPatternMatch;
      });

      if (matchingFiles.length > 0) {
        // Extract component names from matching files
        const components = matchingFiles
          .map((file) => {
            const fileName = path.basename(file.path, path.extname(file.path));
            // Convert filename to component name (e.g., "user-service.ts" -> "UserService")
            return fileName
              .split(/[-_]/)
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join("");
          })
          .filter((name) => name.length > 0)
          .slice(0, 5); // Limit to 5 components per feature

        features.push({
          name: pattern.name,
          keywords: pattern.keywords,
          components: components,
        });
      }
    }

    console.log(
      `Found ${features.length} major features: ${features
        .map((f) => f.name)
        .join(", ")}`
    );
    return features;
  }

  private async performAIDeepAnalysis(): Promise<void> {
    console.log("🤖 Performing comprehensive AI-powered deep analysis...");

    try {
      // Collect source code files for AI analysis (prioritize important files)
      const sourceFiles = this.analysisResult.fileStructure.filter((file) => {
        const ext = path.extname(file.path).toLowerCase();
        const fileName = path.basename(file.path).toLowerCase();

        // Prioritize important file types
        const importantExts = [
          ".js",
          ".ts",
          ".tsx",
          ".jsx",
          ".py",
          ".java",
          ".go",
          ".rs",
          ".php",
          ".rb",
          ".cs",
          ".cpp",
          ".c",
        ];
        const configExts = [
          ".json",
          ".yaml",
          ".yml",
          ".xml",
          ".toml",
          ".ini",
          ".cfg",
          ".conf",
          ".env",
        ];
        const webExts = [
          ".html",
          ".css",
          ".scss",
          ".sass",
          ".less",
          ".vue",
          ".svelte",
        ];

        // Skip test files, node_modules, and build artifacts for faster analysis
        if (
          fileName.includes("test") ||
          fileName.includes("spec") ||
          file.path.includes("node_modules") ||
          file.path.includes("dist") ||
          file.path.includes("build") ||
          file.path.includes(".git")
        ) {
          return false;
        }

        return (
          importantExts.includes(ext) ||
          configExts.includes(ext) ||
          webExts.includes(ext)
        );
      });

      // Limit files for faster analysis (take most important ones)
      const maxFiles = 50; // Limit to 50 most important files for speed
      const limitedFiles = sourceFiles.slice(0, maxFiles);

      console.log(
        `📁 Analyzing ${limitedFiles.length} files with AI (limited from ${sourceFiles.length} total)...`
      );

      // Process files in chunks to handle large codebases
      const chunkSize = 10; // Increased chunk size for better performance
      const fileChunks = [];
      for (let i = 0; i < limitedFiles.length; i += chunkSize) {
        fileChunks.push(limitedFiles.slice(i, i + chunkSize));
      }

      console.log(`📦 Processing ${fileChunks.length} chunks of files...`);

      let allAnalysisResults: string[] = [];

      // Process each chunk
      for (let chunkIndex = 0; chunkIndex < fileChunks.length; chunkIndex++) {
        const chunk = fileChunks[chunkIndex];
        const progress = Math.round(
          ((chunkIndex + 1) / fileChunks.length) * 100
        );
        console.log(
          `🔍 Processing chunk ${chunkIndex + 1}/${fileChunks.length} (${
            chunk.length
          } files) - ${progress}% complete...`
        );

        const fileContents: string[] = [];

        for (const file of chunk) {
          try {
            const content = fs.readFileSync(
              path.join(this.targetPath, file.path),
              "utf8"
            );
            // Limit content size to avoid token limits (first 2000 chars per file)
            const truncatedContent = content.substring(0, 2000);
            fileContents.push(`File: ${file.path}\n${truncatedContent}\n---\n`);
          } catch (error) {
            // Skip files that can't be read
          }
        }

        if (fileContents.length === 0) {
          console.log(`⚠️ No readable files in chunk ${chunkIndex + 1}`);
          continue;
        }

        const codeAnalysis = fileContents.join("\n");

        // Get include types from global scope
        const includeTypes = (global as any).includeTypes || [
          "bugs",
          "security",
          "performance",
          "architecture",
          "error-handling",
          "code-quality",
          "integration",
          "ux",
          "dependencies",
          "configuration",
        ];

        // Map include types to analysis categories
        const analysisCategories: string[] = [];
        if (includeTypes.includes("bugs")) {
          analysisCategories.push(
            "**Critical Bugs** - Code that will cause runtime errors, crashes, or data corruption"
          );
        }
        if (includeTypes.includes("security")) {
          analysisCategories.push(
            "**Security Vulnerabilities** - Potential security issues, unsafe practices, or data exposure"
          );
        }
        if (includeTypes.includes("performance")) {
          analysisCategories.push(
            "**Performance Issues** - Code that will cause slow performance, memory leaks, or scalability problems"
          );
        }
        if (includeTypes.includes("architecture")) {
          analysisCategories.push(
            "**Architecture Problems** - Poor design patterns, tight coupling, or maintainability issues"
          );
        }
        if (includeTypes.includes("error-handling")) {
          analysisCategories.push(
            "**Missing Error Handling** - Code paths without proper error handling or validation"
          );
        }
        if (includeTypes.includes("code-quality")) {
          analysisCategories.push(
            "**Code Quality Issues** - Anti-patterns, code smells, or best practice violations"
          );
        }
        if (includeTypes.includes("integration")) {
          analysisCategories.push(
            "**Integration Issues** - Problems with APIs, databases, or external services"
          );
        }
        if (includeTypes.includes("ux")) {
          analysisCategories.push(
            "**User Experience Issues** - Problems that will affect end users"
          );
        }
        if (includeTypes.includes("dependencies")) {
          analysisCategories.push(
            "**Dependency Issues** - Outdated, vulnerable, or problematic dependencies"
          );
        }
        if (includeTypes.includes("configuration")) {
          analysisCategories.push(
            "**Configuration Issues** - Misconfigurations, missing settings, or security gaps"
          );
        }

        // Create comprehensive AI prompt for deep analysis
        const prompt = `You are an expert software architect analyzing a codebase chunk. Please perform a deep analysis and identify real issues, bugs, and problems.

Codebase Analysis:
Project: ${this.analysisResult.projectName}
Languages: ${this.analysisResult.languages.join(", ")}
Frameworks: ${this.analysisResult.frameworks.join(", ")}
Total Files: ${this.analysisResult.fileStructure.length}
Chunk: ${chunkIndex + 1}/${fileChunks.length} (${chunk.length} files)

Code Chunk:
${codeAnalysis}

Please analyze this codebase chunk and identify:
${analysisCategories.map((cat, i) => `${i + 1}. ${cat}`).join("\n")}

For each issue found, provide:
- Issue Type (Bug/Security/Performance/Architecture/etc.)
- Severity (Critical/High/Medium/Low)
- Description of the problem
- File(s) where the issue exists
- Specific code examples or patterns
- Recommended fix
- Impact assessment

Format your response as a structured analysis focusing on real, actionable issues.`;

        // Try multiple AI providers for comprehensive analysis
        const analysisResults = await this.runMultiAIAnalysis(prompt);
        allAnalysisResults.push(...analysisResults);

        // Small delay between chunks to avoid rate limits
        if (chunkIndex < fileChunks.length - 1) {
          await sleep(500); // Reduced delay for faster processing
        }
      }

      // Combine all analysis results
      const combinedAnalysis = allAnalysisResults.join(
        "\n\n--- ANALYSIS CHUNK SEPARATOR ---\n\n"
      );

      console.log("🤖 Combined AI Analysis Results:");
      console.log("=".repeat(50));
      console.log(combinedAnalysis);
      console.log("=".repeat(50));

      // Parse combined AI analysis and convert to patterns
      this.parseAIAnalysisToPatterns(combinedAnalysis);
    } catch (error: any) {
      console.error("❌ AI analysis failed:", error.message);
      console.log("⚠️ Continuing with pattern-based analysis...");
    }
  }

  private async runMultiAIAnalysis(prompt: string): Promise<string[]> {
    const results: string[] = [];

    // Try OpenAI GPT-4 Turbo
    if (OPENAI_KEY) {
      try {
        console.log("🧠 Running OpenAI analysis...");
        const openaiResult = await Promise.race([
          this.runOpenAIAnalysis(prompt),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("OpenAI timeout")), 15000)
          ),
        ]);
        results.push(`=== OPENAI ANALYSIS ===\n${openaiResult}`);
      } catch (error: any) {
        console.error("❌ OpenAI analysis failed:", error.message);
        console.log("🔍 OpenAI API Key present:", !!OPENAI_KEY);
      }
    }

    // Try Anthropic Claude
    if (ANTHROPIC_KEY) {
      try {
        console.log("🧠 Running Claude analysis...");
        const claudeResult = await Promise.race([
          this.runClaudeAnalysis(prompt),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("Claude timeout")), 15000)
          ),
        ]);
        results.push(`=== CLAUDE ANALYSIS ===\n${claudeResult}`);
      } catch (error: any) {
        console.error("❌ Claude analysis failed:", error.message);
        console.log("🔍 Claude API Key present:", !!ANTHROPIC_KEY);
      }
    }

    return results;
  }

  private async runOpenAIAnalysis(prompt: string): Promise<string> {
    // Try multiple OpenAI models in order of preference
    const models = [
      "gpt-4o", // Latest GPT-4o
      "gpt-4-turbo-preview", // GPT-4 Turbo
      "gpt-4", // Standard GPT-4
      "gpt-3.5-turbo", // Fallback GPT-3.5
    ];

    for (const model of models) {
      try {
        console.log(`🧠 Trying OpenAI model: ${model}`);
        const response = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: model,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert software architect with deep experience in code analysis, debugging, and identifying real-world issues in production codebases. Focus on finding actual bugs, security vulnerabilities, and performance issues.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            max_tokens: 4000,
            temperature: 0.1,
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        return response.data.choices[0].message.content;
      } catch (error: any) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        console.log(`❌ OpenAI model ${model} failed:`, errorMsg);

        // If it's a model not found error, try next model
        if (
          errorMsg.includes("model") ||
          errorMsg.includes("not found") ||
          errorMsg.includes("invalid")
        ) {
          if (model === models[models.length - 1]) {
            throw new Error(
              `All OpenAI models failed. Last error: ${errorMsg}`
            );
          }
          continue; // Try next model
        }

        // For other errors, re-throw immediately
        throw error;
      }
    }

    throw new Error("All OpenAI models failed");
  }

  private async runClaudeAnalysis(prompt: string): Promise<string> {
    // Try multiple Claude models in order of preference
    const models = [
      "claude-3-haiku-20240307", // Fast Claude (most reliable)
      "claude-3-sonnet-20240229", // Stable Claude
      "claude-3-opus-20240229", // Powerful Claude
    ];

    for (const model of models) {
      try {
        console.log(`🧠 Trying Claude model: ${model}`);
        const response = await axios.post(
          "https://api.anthropic.com/v1/messages",
          {
            model: model,
            max_tokens: 4000,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          },
          {
            headers: {
              "x-api-key": ANTHROPIC_KEY,
              "Content-Type": "application/json",
              "anthropic-version": "2023-06-01",
            },
          }
        );

        return response.data.content[0].text;
      } catch (error: any) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        console.log(`❌ Claude model ${model} failed:`, errorMsg);

        // If it's a model not found error, try next model
        if (errorMsg.includes("model:") || errorMsg.includes("not found")) {
          if (model === models[models.length - 1]) {
            throw new Error(
              `All Claude models failed. Last error: ${errorMsg}`
            );
          }
          continue; // Try next model
        }

        // For other errors, re-throw immediately
        throw error;
      }
    }

    throw new Error("All Claude models failed");
  }

  private parseAIAnalysisToPatterns(aiAnalysis: string): void {
    console.log("🔍 Parsing multi-AI analysis into issue patterns...");

    const patterns: PatternInfo[] = [];

    // Split by analysis separators first
    const analysisSections = aiAnalysis.split(
      /=== (OPENAI|CLAUDE) ANALYSIS ===/
    );

    for (const analysisSection of analysisSections) {
      if (analysisSection.trim().length === 0) continue;

      // Split each analysis into individual issues
      const issueSections = analysisSection.split(
        /\n(?=\d+\.|\*\*|Issue|Bug|Security|Performance|Architecture)/i
      );

      for (const section of issueSections) {
        if (section.trim().length === 0) continue;

        // Skip "no issues found" messages
        const noIssuesPatterns = [
          /no .+ issues? (?:were|was) (?:identified|found|detected)/i,
          /no .+ (?:issues?|problems?|bugs?|vulnerabilities?)/i,
          /were (?:no|not) (?:issues?|problems?|bugs?|vulnerabilities?)/i,
        ];

        if (noIssuesPatterns.some((pattern) => pattern.test(section))) {
          continue; // Skip this section - it's reporting no issues
        }

        // Enhanced regex patterns to catch more issue formats
        const issueMatch = section.match(
          /(?:Issue Type|Type|Category):\s*(.+?)(?:\n|$)/i
        );
        const severityMatch = section.match(
          /(?:Severity|Priority|Level):\s*(.+?)(?:\n|$)/i
        );
        const descriptionMatch = section.match(
          /(?:Description|Problem|Issue|Summary):\s*(.+?)(?:\n|$)/i
        );
        const fileMatch = section.match(
          /(?:File|Files|Location):\s*(.+?)(?:\n|$)/i
        );
        const impactMatch = section.match(
          /(?:Impact|Consequence):\s*(.+?)(?:\n|$)/i
        );

        // If no structured format, try to extract from general text
        if (!descriptionMatch && section.length > 50) {
          // Look for issue indicators in the text
          const issueIndicators = [
            /(?:bug|error|issue|problem|vulnerability|security|performance|memory leak|race condition|deadlock|infinite loop|null pointer|undefined|exception|crash|fail)/i,
          ];

          if (issueIndicators.some((pattern) => pattern.test(section))) {
            // Extract first meaningful sentence as description
            const sentences = section
              .split(/[.!?]+/)
              .filter((s) => s.trim().length > 20);
            if (sentences.length > 0) {
              const description = sentences[0].trim();
              const files =
                section
                  .match(/File:?\s*([^\s\n]+)/gi)
                  ?.map((f) => f.replace(/File:?\s*/i, "").trim()) || [];

              patterns.push({
                type: "AI Detected: Code Issue",
                description: description,
                files: files,
                severity: "medium",
              });
            }
          }
        } else if (descriptionMatch) {
          const issueType = issueMatch ? issueMatch[1].trim() : "Code Quality";
          const severity = severityMatch
            ? severityMatch[1].trim().toLowerCase()
            : "medium";
          const description = descriptionMatch[1].trim();
          const files = fileMatch
            ? fileMatch[1]
                .trim()
                .split(/[,\n]/)
                .map((f) => f.trim())
                .filter((f) => f.length > 0)
            : [];
          const impact = impactMatch ? impactMatch[1].trim() : "";

          // Map severity to our system
          let mappedSeverity: "low" | "medium" | "high" = "medium";
          if (severity.includes("critical") || severity.includes("high")) {
            mappedSeverity = "high";
          } else if (severity.includes("low")) {
            mappedSeverity = "low";
          }

          // Enhance description with impact if available
          const enhancedDescription = impact
            ? `${description}${impact ? ` Impact: ${impact}` : ""}`
            : description;

          patterns.push({
            type: `AI Detected: ${issueType}`,
            description: enhancedDescription,
            files: files,
            severity: mappedSeverity,
          });
        }
      }
    }

    // Remove duplicates based on description similarity
    const uniquePatterns = this.removeDuplicatePatterns(patterns);

    // Add AI-detected patterns to existing patterns
    this.analysisResult.patterns.push(...uniquePatterns);

    console.log(
      `✅ Added ${uniquePatterns.length} unique AI-detected issues to analysis`
    );
  }

  private removeDuplicatePatterns(patterns: PatternInfo[]): PatternInfo[] {
    const unique: PatternInfo[] = [];

    for (const pattern of patterns) {
      const isDuplicate = unique.some((existing) => {
        // Check if descriptions are similar (simple similarity check)
        const desc1 = existing.description.toLowerCase();
        const desc2 = pattern.description.toLowerCase();

        // If descriptions are very similar, consider it a duplicate
        const similarity = this.calculateSimilarity(desc1, desc2);
        return similarity > 0.8;
      });

      if (!isDuplicate) {
        unique.push(pattern);
      }
    }

    return unique;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);

    const commonWords = words1.filter((word) => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  private async analyzeEndUserDeep(): Promise<void> {
    console.log("🔬 Deep analyzing end-user functionality...");

    const detailedFeatures: DetailedFeature[] = [];

    // Dynamically detect major features based on actual files in the codebase
    const majorFeatures = await this.detectMajorFeatures();

    // AI-powered deep analysis of the entire codebase
    await this.performAIDeepAnalysis();

    // Analyze each major feature in detail
    for (const feature of majorFeatures) {
      console.log(`🔍 Deep analyzing: ${feature.name}`);

      const featureComponents: FeatureComponent[] = [];
      const featureFiles: string[] = [];
      const issues: string[] = [];
      const improvements: string[] = [];

      // Find and analyze each component
      for (const componentName of feature.components) {
        const componentFiles = this.analysisResult.fileStructure.filter(
          (f) =>
            f.path.toLowerCase().includes(componentName.toLowerCase()) ||
            f.path.toLowerCase().includes(
              componentName
                .toLowerCase()
                .replace(/([A-Z])/g, "-$1")
                .toLowerCase()
            )
        );

        for (const file of componentFiles) {
          const component = await this.analyzeComponent(file, componentName);
          if (component) {
            featureComponents.push(component);
            featureFiles.push(file.path);
          }
        }
      }

      // Analyze feature completeness and issues
      const status = this.determineFeatureStatus(featureComponents);
      const priority = this.determineFeaturePriority(feature.name, status);

      // Generate specific issues and improvements
      this.generateFeatureIssues(
        feature,
        featureComponents,
        issues,
        improvements
      );

      detailedFeatures.push({
        name: feature.name,
        description: `Deep analysis of ${feature.name} functionality`,
        files: featureFiles,
        components: featureComponents,
        status,
        issues,
        improvements,
        priority,
      });
    }

    this.analysisResult.detailedFeatures = detailedFeatures;

    // Convert detailed analysis to patterns for issue generation
    const patterns: PatternInfo[] = [];

    for (const feature of detailedFeatures) {
      if (feature.status === "broken" || feature.status === "missing") {
        patterns.push({
          type: `Broken Feature: ${feature.name}`,
          description: feature.issues.join("; "),
          files: feature.files,
          severity: "high",
        });
      } else if (feature.status === "partial") {
        patterns.push({
          type: `Incomplete Feature: ${feature.name}`,
          description: feature.improvements.join("; "),
          files: feature.files,
          severity: "medium",
        });
      }
    }

    this.analysisResult.patterns = patterns;
  }

  private async analyzeComponent(
    file: FileInfo,
    componentName: string
  ): Promise<FeatureComponent | null> {
    try {
      const content = fs.readFileSync(
        path.join(this.targetPath, file.path),
        "utf8"
      );

      const issues: string[] = [];
      const dependencies: string[] = [];

      // Check for common issues
      if (content.includes("TODO") || content.includes("FIXME")) {
        issues.push("Contains TODO/FIXME comments");
      }

      // Skip console.log checks - user requested to ignore

      if (content.includes("throw new Error") && !content.includes("try")) {
        issues.push("Potential unhandled errors");
      }

      if (content.includes("useState") && !content.includes("useEffect")) {
        issues.push("State management without proper lifecycle handling");
      }

      // Check for missing error handling
      if (
        content.includes("async") &&
        !content.includes("try") &&
        !content.includes("catch")
      ) {
        issues.push("Async functions without error handling");
      }

      // Extract dependencies
      const importMatches = content.match(/import.*from\s+['"]([^'"]+)['"]/g);
      if (importMatches) {
        dependencies.push(
          ...importMatches
            .map((match) => match.match(/['"]([^'"]+)['"]/)?.[1])
            .filter(Boolean)
        );
      }

      // Determine component status
      let status: "working" | "partial" | "broken" | "missing" = "working";

      if (issues.length > 3) {
        status = "broken";
      } else if (issues.length > 0) {
        status = "partial";
      }

      return {
        name: componentName,
        type: this.getComponentType(file.path),
        file: file.path,
        status,
        issues,
        dependencies,
      };
    } catch (error) {
      return {
        name: componentName,
        type: "component",
        file: file.path,
        status: "broken",
        issues: [`Failed to read file: ${error.message}`],
        dependencies: [],
      };
    }
  }

  private getComponentType(
    filePath: string
  ): "component" | "service" | "hook" | "page" | "utility" {
    if (filePath.includes("service")) return "service";
    if (filePath.includes("hook")) return "hook";
    if (filePath.includes("page")) return "page";
    if (filePath.includes("util")) return "utility";
    return "component";
  }

  private determineFeatureStatus(
    components: FeatureComponent[]
  ): "working" | "partial" | "broken" | "missing" {
    if (components.length === 0) return "missing";

    const brokenCount = components.filter((c) => c.status === "broken").length;
    const partialCount = components.filter(
      (c) => c.status === "partial"
    ).length;

    if (brokenCount > components.length / 2) return "broken";
    if (partialCount > 0 || brokenCount > 0) return "partial";
    return "working";
  }

  private determineFeaturePriority(
    featureName: string,
    status: string
  ): "high" | "medium" | "low" {
    const criticalFeatures = [
      "Session Management",
      "Analytics Dashboard",
      "Real-time Recording",
    ];

    if (criticalFeatures.includes(featureName) && status !== "working") {
      return "high";
    }

    if (status === "broken" || status === "missing") {
      return "medium";
    }

    return "low";
  }

  private generateFeatureIssues(
    feature: any,
    components: FeatureComponent[],
    issues: string[],
    improvements: string[]
  ) {
    const brokenComponents = components.filter((c) => c.status === "broken");
    const partialComponents = components.filter((c) => c.status === "partial");

    if (brokenComponents.length > 0) {
      issues.push(
        `${brokenComponents.length} components are broken: ${brokenComponents
          .map((c) => c.name)
          .join(", ")}`
      );
    }

    if (partialComponents.length > 0) {
      issues.push(
        `${partialComponents.length} components have issues: ${partialComponents
          .map((c) => c.name)
          .join(", ")}`
      );
    }

    // Feature-specific improvements based on detected features
    switch (feature.name) {
      case "Authentication System":
        improvements.push("Add session validation and error handling");
        improvements.push("Implement multi-factor authentication");
        break;
      case "Dashboard & Analytics":
        improvements.push("Add real-time data updates");
        improvements.push("Implement advanced filtering and search");
        break;
      case "Data Management":
        improvements.push("Add data validation and error handling");
        improvements.push("Implement bulk operations and batch processing");
        break;
      case "File Management":
        improvements.push("Add file type validation and security checks");
        improvements.push("Implement file compression and optimization");
        break;
      case "Search & Filtering":
        improvements.push("Add advanced search algorithms");
        improvements.push("Implement search result caching");
        break;
      case "Navigation & Routing":
        improvements.push("Add breadcrumb navigation");
        improvements.push("Implement responsive navigation patterns");
        break;
      case "Forms & Validation":
        improvements.push("Add client-side validation");
        improvements.push("Implement form auto-save functionality");
        break;
      case "API Integration":
        improvements.push("Add request/response logging");
        improvements.push("Implement API rate limiting and retry logic");
        break;
      case "Database Operations":
        improvements.push("Add database connection pooling");
        improvements.push("Implement query optimization and indexing");
        break;
      case "Real-time Features":
        improvements.push("Add connection status monitoring");
        improvements.push("Implement automatic reconnection logic");
        break;
    }
  }

  private async analyzeSecurity(): Promise<void> {
    console.log("🔒 Analyzing security patterns...");
    // TODO: Implement security analysis
    this.analysisResult.patterns = [];
  }

  private async analyzePerformance(): Promise<void> {
    console.log("⚡ Analyzing performance patterns...");
    // TODO: Implement performance analysis
    this.analysisResult.patterns = [];
  }

  private async generateSuggestions(): Promise<void> {
    console.log("💡 Generating suggestions...");

    const suggestions: string[] = [];

    // Language-specific suggestions
    if (
      this.analysisResult.languages.includes("JavaScript") &&
      !this.analysisResult.languages.includes("TypeScript")
    ) {
      suggestions.push(
        "Consider migrating to TypeScript for better type safety"
      );
    }

    if (
      this.analysisResult.languages.includes("CSS") &&
      !this.analysisResult.frameworks.includes("Tailwind CSS")
    ) {
      suggestions.push("Consider using Tailwind CSS for utility-first styling");
    }

    // Framework suggestions
    if (
      this.analysisResult.frameworks.includes("React") &&
      !this.analysisResult.frameworks.includes("Next.js")
    ) {
      suggestions.push("Consider Next.js for better SEO and performance");
    }

    // Testing suggestions
    if (
      !this.analysisResult.frameworks.includes("Jest") &&
      !this.analysisResult.frameworks.includes("Cypress")
    ) {
      suggestions.push(
        "Add testing framework (Jest for unit tests, Cypress for E2E)"
      );
    }

    // Skip large file and console.log suggestions - user requested to ignore

    // Documentation suggestions
    const hasReadme = this.analysisResult.fileStructure.some((f) =>
      f.path.toLowerCase().includes("readme")
    );
    if (!hasReadme) {
      suggestions.push("Add README.md with project documentation");
    }

    this.analysisResult.suggestions = suggestions;
  }

  async generateLinearIssues(): Promise<any[]> {
    const issues: any[] = [];

    // Always use LLM to generate detailed issues for deep analysis
    if (this.analysisResult.depth === "deep") {
      // Get include types from global scope if available
      const includeTypes = (global as any).includeTypes || [
        "bugs",
        "security",
        "performance",
        "architecture",
        "error-handling",
        "code-quality",
        "integration",
        "ux",
        "dependencies",
        "configuration",
      ];

      // Prepare comprehensive analysis data for LLM
      const analysisData = {
        projectName: this.analysisResult.projectName,
        mode: this.analysisResult.mode,
        languages: this.analysisResult.languages,
        frameworks: this.analysisResult.frameworks,
        dependencies: this.analysisResult.dependencies,
        patterns: this.analysisResult.patterns,
        issues: this.analysisResult.issues,
        suggestions: this.analysisResult.suggestions,
        detailedFeatures: this.analysisResult.detailedFeatures,
        fileStructure: this.analysisResult.fileStructure.slice(0, 100), // Limit to first 100 files
      };

      try {
        const llmIssues = await generateDetailedIssuesFromAnalysis(
          analysisData,
          includeTypes
        );
        return llmIssues;
      } catch (error: any) {
        console.error("❌ LLM issue generation failed:", error.message);
        console.log("⚠️ Falling back to template-based issues...");
        // Fallback to template-based generation
        return this.generateDetailedIssues();
      }
    }

    // Convert patterns to issues (original logic for lightweight mode)
    for (const pattern of this.analysisResult.patterns) {
      if (pattern.severity === "high") {
        issues.push({
          title: `Fix: ${pattern.type}`,
          description: pattern.description,
          type: "bug",
          priority: "high",
          files: pattern.files,
          category: "Code Quality",
        });
      } else if (pattern.severity === "medium") {
        issues.push({
          title: `Improve: ${pattern.type}`,
          description: pattern.description,
          type: "improvement",
          priority: "medium",
          files: pattern.files,
          category: "Code Quality",
        });
      }
    }

    // Convert suggestions to issues
    for (const suggestion of this.analysisResult.suggestions) {
      issues.push({
        title: `Enhancement: ${suggestion}`,
        description: suggestion,
        type: "feature",
        priority: "low",
        files: [],
        category: "Enhancement",
      });
    }

    return issues;
  }

  private generateDetailedIssues(): any[] {
    const issues: any[] = [];

    // Generate parent issues for each feature with problems
    for (const feature of this.analysisResult.detailedFeatures) {
      if (feature.status === "broken" || feature.status === "missing") {
        const parentIssue = this.createDetailedIssue(feature, "broken");
        parentIssue.isParent = true;
        issues.push(parentIssue);

        // Generate sub-issues for this parent
        const subIssues = this.generateSubIssues(feature, "broken");
        issues.push(...subIssues);
      } else if (feature.status === "partial") {
        const parentIssue = this.createDetailedIssue(feature, "partial");
        parentIssue.isParent = true;
        issues.push(parentIssue);

        // Generate sub-issues for this parent
        const subIssues = this.generateSubIssues(feature, "partial");
        issues.push(...subIssues);
      }
    }

    return issues;
  }

  private generateSubIssues(
    feature: DetailedFeature,
    status: "broken" | "partial"
  ): any[] {
    const subIssues: any[] = [];
    const isBroken = status === "broken";

    // Generate sub-issues based on detected feature type and components
    switch (feature.name) {
      case "Authentication System":
        subIssues.push(
          this.createSubIssue(
            feature,
            "User Authentication Flow",
            [
              "Implement secure login and registration processes",
              "Add session management and token handling",
              "Create user authentication validation",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "Authentication Security",
            [
              "Add password encryption and security measures",
              "Implement rate limiting and brute force protection",
              "Create secure session management",
            ],
            isBroken
          )
        );
        break;

      case "Dashboard & Analytics":
        subIssues.push(
          this.createSubIssue(
            feature,
            "Data Visualization",
            [
              "Implement chart and graph rendering",
              "Add real-time data updates",
              "Create interactive dashboard components",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "Analytics Processing",
            [
              "Optimize data calculation algorithms",
              "Implement data aggregation and processing",
              "Add analytics data validation",
            ],
            isBroken
          )
        );
        break;

      case "Data Management":
        subIssues.push(
          this.createSubIssue(
            feature,
            "CRUD Operations",
            [
              "Implement create, read, update, delete functionality",
              "Add data validation and error handling",
              "Create data persistence mechanisms",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "Data Models",
            [
              "Define data structures and schemas",
              "Implement data relationships and constraints",
              "Add data migration and versioning",
            ],
            isBroken
          )
        );
        break;

      case "File Management":
        subIssues.push(
          this.createSubIssue(
            feature,
            "File Upload System",
            [
              "Implement secure file upload functionality",
              "Add file type validation and security checks",
              "Create file storage and organization",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "File Processing",
            [
              "Add file compression and optimization",
              "Implement file format conversion",
              "Create file metadata management",
            ],
            isBroken
          )
        );
        break;

      case "Search & Filtering":
        subIssues.push(
          this.createSubIssue(
            feature,
            "Search Engine",
            [
              "Implement search algorithms and indexing",
              "Add search result ranking and relevance",
              "Create search performance optimization",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "Filtering System",
            [
              "Add advanced filtering capabilities",
              "Implement filter combinations and logic",
              "Create filter persistence and state management",
            ],
            isBroken
          )
        );
        break;

      case "Navigation & Routing":
        subIssues.push(
          this.createSubIssue(
            feature,
            "Routing System",
            [
              "Implement application routing and navigation",
              "Add route protection and authentication",
              "Create navigation state management",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "UI Navigation",
            [
              "Implement responsive navigation components",
              "Add breadcrumb and menu systems",
              "Create accessibility features for navigation",
            ],
            isBroken
          )
        );
        break;

      case "Forms & Validation":
        subIssues.push(
          this.createSubIssue(
            feature,
            "Form Components",
            [
              "Implement form input components and validation",
              "Add form state management and persistence",
              "Create form submission and error handling",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "Validation System",
            [
              "Add client-side and server-side validation",
              "Implement validation rules and constraints",
              "Create validation error handling and feedback",
            ],
            isBroken
          )
        );
        break;

      case "API Integration":
        subIssues.push(
          this.createSubIssue(
            feature,
            "API Client",
            [
              "Implement API request and response handling",
              "Add authentication and authorization",
              "Create API error handling and retry logic",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "Service Layer",
            [
              "Implement service abstraction and caching",
              "Add request/response logging and monitoring",
              "Create API rate limiting and throttling",
            ],
            isBroken
          )
        );
        break;

      case "Database Operations":
        subIssues.push(
          this.createSubIssue(
            feature,
            "Database Layer",
            [
              "Implement database connection and query management",
              "Add database migration and schema management",
              "Create database performance optimization",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "Data Access",
            [
              "Implement repository pattern and data access objects",
              "Add database transaction management",
              "Create data caching and optimization",
            ],
            isBroken
          )
        );
        break;

      case "Real-time Features":
        subIssues.push(
          this.createSubIssue(
            feature,
            "WebSocket System",
            [
              "Implement WebSocket connection management",
              "Add real-time message handling and broadcasting",
              "Create connection status monitoring and recovery",
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            "Real-time UI",
            [
              "Implement real-time UI updates and synchronization",
              "Add live data streaming and visualization",
              "Create real-time notification system",
            ],
            isBroken
          )
        );
        break;

      default:
        // Generic sub-issues for any detected feature
        subIssues.push(
          this.createSubIssue(
            feature,
            `${feature.name} Core Functionality`,
            [
              `Implement core ${feature.name.toLowerCase()} functionality`,
              `Add error handling and validation for ${feature.name.toLowerCase()}`,
              `Create proper state management for ${feature.name.toLowerCase()}`,
            ],
            isBroken
          ),
          this.createSubIssue(
            feature,
            `${feature.name} User Interface`,
            [
              `Implement user interface components for ${feature.name.toLowerCase()}`,
              `Add responsive design and accessibility features`,
              `Create user feedback and interaction handling`,
            ],
            isBroken
          )
        );
        break;
    }

    return subIssues;
  }

  private createSubIssue(
    feature: DetailedFeature,
    subFeatureName: string,
    requirements: string[],
    isBroken: boolean
  ): any {
    const title = isBroken
      ? `Fix ${subFeatureName} Issues`
      : `Improve ${subFeatureName}`;

    const description = `The ${subFeatureName} component within the ${
      feature.name
    } system ${
      isBroken
        ? "has critical issues that need immediate attention"
        : "requires improvements for better functionality"
    }. This is a sub-component of the larger ${feature.name} system.`;

    const acceptanceCriteria = [
      `${subFeatureName} operates reliably without errors`,
      "All functionality is properly implemented and tested",
      "Error handling prevents system crashes and data loss",
      "Performance meets established benchmarks",
      "Code quality standards are maintained",
    ];

    const technicalNotes = [
      `Focus on ${subFeatureName} specific implementation`,
      "Follow existing code patterns and architectural guidelines",
      "Implement proper TypeScript types and interfaces",
      "Add comprehensive unit and integration tests",
      "Ensure responsive design and accessibility compliance",
    ];

    return {
      Title: title,
      Description: description,
      Priority:
        feature.priority === "high"
          ? "High"
          : feature.priority === "medium"
          ? "Medium"
          : "Low",
      Requirements: requirements,
      Acceptance_Criteria: acceptanceCriteria,
      Technical_Notes: technicalNotes,
      files: feature.files.slice(0, 5), // Limit files for sub-issues
      category: isBroken ? "Bug" : "Improvement",
      isSubIssue: true,
      parentFeature: feature.name,
    };
  }

  private createDetailedIssue(
    feature: DetailedFeature,
    status: "broken" | "partial"
  ): any {
    const isBroken = status === "broken";
    const title = isBroken
      ? `Fix ${feature.name} System Reliability Issues`
      : `Improve ${feature.name} Functionality`;

    const description = this.generateDetailedDescription(feature, isBroken);
    const requirements = this.generateRequirements(feature, isBroken);
    const acceptanceCriteria = this.generateAcceptanceCriteria(
      feature,
      isBroken
    );
    const technicalNotes = this.generateTechnicalNotes(feature, isBroken);

    return {
      Title: title,
      Description: description,
      Priority:
        feature.priority === "high"
          ? "High"
          : feature.priority === "medium"
          ? "Medium"
          : "Low",
      Requirements: requirements,
      Acceptance_Criteria: acceptanceCriteria,
      Technical_Notes: technicalNotes,
      files: feature.files,
      category: isBroken ? "Bug" : "Improvement",
    };
  }

  private generateDetailedDescription(
    feature: DetailedFeature,
    isBroken: boolean
  ): string {
    const statusText = isBroken
      ? "has critical reliability issues"
      : "has incomplete functionality";
    const impactText = isBroken
      ? "causing system failures and user frustration"
      : "limiting user experience and feature completeness";

    let description = `The ${feature.name} system ${statusText}, ${impactText}. `;

    if (feature.issues.length > 0) {
      description += `Current issues include: ${feature.issues
        .slice(0, 3)
        .join(", ")}. `;
    }

    if (feature.improvements.length > 0) {
      description += `Required improvements: ${feature.improvements
        .slice(0, 3)
        .join(", ")}. `;
    }

    description += `This affects ${feature.components.length} components across ${feature.files.length} files. `;

    if (isBroken) {
      description +=
        "Immediate attention is required to restore system functionality and prevent data loss.";
    } else {
      description +=
        "Enhancements are needed to provide a complete user experience and meet feature requirements.";
    }

    return description;
  }

  private generateRequirements(
    feature: DetailedFeature,
    isBroken: boolean
  ): string[] {
    const requirements: string[] = [];

    if (isBroken) {
      requirements.push(`Fix critical issues in ${feature.name} system`);
      requirements.push(
        "Implement comprehensive error handling and recovery mechanisms"
      );
      requirements.push("Add data validation and integrity checks");
      requirements.push("Create system monitoring and alerting");
      requirements.push("Implement backup and recovery procedures");
    } else {
      requirements.push(
        `Complete ${feature.name} functionality implementation`
      );
      requirements.push("Add missing features and user interface elements");
      requirements.push(
        "Implement proper state management and data persistence"
      );
      requirements.push("Add user feedback and validation mechanisms");
      requirements.push("Create comprehensive testing and quality assurance");
    }

    // Add feature-specific requirements based on detected features
    switch (feature.name) {
      case "Authentication System":
        requirements.push(
          "Implement secure user authentication and authorization"
        );
        requirements.push("Add session management and token handling");
        requirements.push("Create password security and validation");
        break;
      case "Dashboard & Analytics":
        requirements.push(
          "Implement data visualization and analytics dashboard"
        );
        requirements.push("Add real-time data updates and processing");
        requirements.push("Create interactive charts and metrics display");
        break;
      case "Data Management":
        requirements.push("Implement comprehensive CRUD operations");
        requirements.push("Add data validation and integrity checks");
        requirements.push("Create data models and schema management");
        break;
      case "File Management":
        requirements.push("Implement secure file upload and download");
        requirements.push("Add file type validation and security checks");
        requirements.push("Create file storage and organization system");
        break;
      case "Search & Filtering":
        requirements.push(
          "Implement advanced search and filtering capabilities"
        );
        requirements.push("Add search result ranking and relevance");
        requirements.push("Create search performance optimization");
        break;
      case "Navigation & Routing":
        requirements.push("Implement application routing and navigation");
        requirements.push("Add responsive navigation components");
        requirements.push("Create accessibility features for navigation");
        break;
      case "Forms & Validation":
        requirements.push("Implement form components and validation system");
        requirements.push("Add client-side and server-side validation");
        requirements.push("Create form state management and persistence");
        break;
      case "API Integration":
        requirements.push("Implement API client and service layer");
        requirements.push("Add authentication and error handling");
        requirements.push("Create API monitoring and rate limiting");
        break;
      case "Database Operations":
        requirements.push("Implement database layer and data access");
        requirements.push("Add database connection and query management");
        requirements.push("Create database performance optimization");
        break;
      case "Real-time Features":
        requirements.push("Implement WebSocket and real-time communication");
        requirements.push("Add real-time UI updates and synchronization");
        requirements.push("Create connection management and recovery");
        break;
      default:
        requirements.push(
          `Implement core ${feature.name.toLowerCase()} functionality`
        );
        requirements.push(
          `Add error handling and validation for ${feature.name.toLowerCase()}`
        );
        requirements.push(
          `Create proper state management for ${feature.name.toLowerCase()}`
        );
        break;
    }

    return requirements;
  }

  private generateAcceptanceCriteria(
    feature: DetailedFeature,
    isBroken: boolean
  ): string[] {
    const criteria: string[] = [];

    if (isBroken) {
      criteria.push(`${feature.name} system operates reliably without errors`);
      criteria.push("All critical functionality is restored and working");
      criteria.push("Error handling prevents system crashes and data loss");
      criteria.push("System performance meets minimum requirements");
      criteria.push("User interface responds correctly to all interactions");
      criteria.push("Data integrity is maintained across all operations");
    } else {
      criteria.push(
        `${feature.name} functionality is complete and fully implemented`
      );
      criteria.push(
        "All user interface elements are functional and accessible"
      );
      criteria.push(
        "Feature integrates properly with existing system components"
      );
      criteria.push("Performance meets or exceeds established benchmarks");
      criteria.push("User experience is intuitive and error-free");
      criteria.push("Feature is properly tested and validated");
    }

    // Add feature-specific criteria based on detected features
    switch (feature.name) {
      case "Authentication System":
        criteria.push(
          "User authentication works securely across all supported platforms"
        );
        criteria.push("Session management handles login/logout correctly");
        criteria.push("Password security meets industry standards");
        break;
      case "Dashboard & Analytics":
        criteria.push("Dashboard renders data accurately and efficiently");
        criteria.push(
          "Analytics calculations complete within acceptable time limits"
        );
        criteria.push("Charts and visualizations display correctly");
        break;
      case "Data Management":
        criteria.push("CRUD operations work correctly for all data types");
        criteria.push("Data validation prevents invalid data entry");
        criteria.push("Data persistence maintains integrity across operations");
        break;
      case "File Management":
        criteria.push("File upload and download work reliably");
        criteria.push("File type validation prevents security issues");
        criteria.push("File storage and organization function correctly");
        break;
      case "Search & Filtering":
        criteria.push("Search returns relevant results quickly");
        criteria.push("Filtering works correctly with multiple criteria");
        criteria.push("Search performance meets user expectations");
        break;
      case "Navigation & Routing":
        criteria.push(
          "Navigation works correctly across all application routes"
        );
        criteria.push(
          "Routing handles authentication and authorization properly"
        );
        criteria.push("Navigation is responsive and accessible");
        break;
      case "Forms & Validation":
        criteria.push("Form validation works correctly on client and server");
        criteria.push("Form submission handles errors gracefully");
        criteria.push("Form state persists correctly during user interaction");
        break;
      case "API Integration":
        criteria.push("API requests and responses are handled correctly");
        criteria.push("API authentication and authorization work properly");
        criteria.push("API error handling provides meaningful feedback");
        break;
      case "Database Operations":
        criteria.push("Database connections are managed efficiently");
        criteria.push("Database queries execute correctly and perform well");
        criteria.push("Database transactions maintain data integrity");
        break;
      case "Real-time Features":
        criteria.push("Real-time updates work reliably across all clients");
        criteria.push("WebSocket connections handle disconnections gracefully");
        criteria.push("Real-time data synchronization maintains consistency");
        break;
      default:
        criteria.push(
          `${feature.name} functionality works correctly and efficiently`
        );
        criteria.push(
          `${feature.name} handles errors gracefully with user feedback`
        );
        criteria.push(
          `${feature.name} integrates properly with other system components`
        );
        break;
    }

    return criteria;
  }

  private generateTechnicalNotes(
    feature: DetailedFeature,
    isBroken: boolean
  ): string[] {
    const notes: string[] = [];

    if (isBroken) {
      notes.push("Focus on identifying root causes of system failures");
      notes.push("Implement comprehensive error logging and monitoring");
      notes.push("Add defensive programming practices and input validation");
      notes.push("Create automated testing for critical system components");
      notes.push("Implement graceful degradation for non-critical features");
    } else {
      notes.push("Follow existing code patterns and architectural guidelines");
      notes.push("Implement proper TypeScript types and interfaces");
      notes.push("Add comprehensive unit and integration tests");
      notes.push("Ensure responsive design and accessibility compliance");
      notes.push("Optimize performance and minimize bundle size");
    }

    // Add feature-specific technical notes based on detected features
    switch (feature.name) {
      case "Authentication System":
        notes.push(
          "Implement secure authentication using industry-standard protocols"
        );
        notes.push("Add session management with proper token handling");
        notes.push(
          "Create password hashing and validation using secure algorithms"
        );
        notes.push("Implement rate limiting and brute force protection");
        break;
      case "Dashboard & Analytics":
        notes.push(
          "Implement efficient data visualization using modern charting libraries"
        );
        notes.push(
          "Add real-time data updates with WebSocket or polling mechanisms"
        );
        notes.push(
          "Create responsive dashboard components with proper state management"
        );
        notes.push("Implement data caching and performance optimization");
        break;
      case "Data Management":
        notes.push(
          "Implement CRUD operations with proper validation and error handling"
        );
        notes.push(
          "Add data models and schema validation using TypeScript interfaces"
        );
        notes.push(
          "Create data persistence layer with proper transaction management"
        );
        notes.push("Implement data migration and versioning strategies");
        break;
      case "File Management":
        notes.push(
          "Implement secure file upload with type validation and size limits"
        );
        notes.push("Add file storage organization and metadata management");
        notes.push(
          "Create file processing pipeline with compression and optimization"
        );
        notes.push("Implement file access control and security measures");
        break;
      case "Search & Filtering":
        notes.push(
          "Implement search algorithms with proper indexing and ranking"
        );
        notes.push(
          "Add advanced filtering capabilities with multiple criteria support"
        );
        notes.push("Create search performance optimization with caching");
        notes.push("Implement search result pagination and sorting");
        break;
      case "Navigation & Routing":
        notes.push(
          "Implement application routing with proper state management"
        );
        notes.push(
          "Add responsive navigation components with accessibility features"
        );
        notes.push("Create route protection and authentication middleware");
        notes.push("Implement breadcrumb navigation and deep linking");
        break;
      case "Forms & Validation":
        notes.push(
          "Implement form components with proper validation and error handling"
        );
        notes.push(
          "Add client-side and server-side validation with consistent rules"
        );
        notes.push("Create form state management with auto-save functionality");
        notes.push(
          "Implement form accessibility features and keyboard navigation"
        );
        break;
      case "API Integration":
        notes.push(
          "Implement API client with proper authentication and error handling"
        );
        notes.push(
          "Add service layer abstraction with caching and retry logic"
        );
        notes.push("Create API monitoring and rate limiting mechanisms");
        notes.push("Implement request/response logging and debugging tools");
        break;
      case "Database Operations":
        notes.push(
          "Implement database layer with proper connection management"
        );
        notes.push("Add query optimization and performance monitoring");
        notes.push("Create database migration and schema management tools");
        notes.push("Implement data access patterns with proper error handling");
        break;
      case "Real-time Features":
        notes.push(
          "Implement WebSocket connections with proper error handling and reconnection"
        );
        notes.push(
          "Add real-time data synchronization with conflict resolution"
        );
        notes.push("Create real-time UI updates with proper state management");
        notes.push("Implement connection status monitoring and user feedback");
        break;
      default:
        notes.push(
          `Implement ${feature.name.toLowerCase()} with proper error handling and validation`
        );
        notes.push(
          `Add comprehensive testing for ${feature.name.toLowerCase()} functionality`
        );
        notes.push(
          `Create proper documentation for ${feature.name.toLowerCase()} components`
        );
        notes.push(
          `Implement performance optimization for ${feature.name.toLowerCase()} operations`
        );
        break;
    }

    // Add component-specific technical notes
    for (const component of feature.components) {
      if (component.status === "broken") {
        notes.push(
          `Fix critical issues in ${component.name} (${component.type})`
        );
        if (component.issues.length > 0) {
          notes.push(`Address: ${component.issues.slice(0, 2).join(", ")}`);
        }
      } else if (component.status === "partial") {
        notes.push(
          `Complete implementation of ${component.name} (${component.type})`
        );
        if (component.issues.length > 0) {
          notes.push(`Improve: ${component.issues.slice(0, 2).join(", ")}`);
        }
      }
    }

    return notes;
  }

  printAnalysisReport(): void {
    console.log("\n📊 ANALYSIS REPORT");
    console.log("=".repeat(50));

    console.log(`\n📁 Project: ${this.analysisResult.projectName}`);
    console.log(`📂 Path: ${this.targetPath}`);
    console.log(`🔍 Analysis Mode: ${this.analysisResult.mode}`);

    console.log(`\n🔤 Languages (${this.analysisResult.languages.length}):`);
    this.analysisResult.languages.forEach((lang) => console.log(`  • ${lang}`));

    console.log(`\n⚙️ Frameworks (${this.analysisResult.frameworks.length}):`);
    this.analysisResult.frameworks.forEach((framework) =>
      console.log(`  • ${framework}`)
    );

    console.log(
      `\n📦 Dependencies (${this.analysisResult.dependencies.length}):`
    );
    this.analysisResult.dependencies
      .slice(0, 10)
      .forEach((dep) => console.log(`  • ${dep}`));
    if (this.analysisResult.dependencies.length > 10) {
      console.log(
        `  ... and ${this.analysisResult.dependencies.length - 10} more`
      );
    }

    // Show mode-specific results
    if (this.analysisResult.mode === "end-user") {
      if (this.analysisResult.depth === "deep") {
        console.log(
          `\n🔬 Detailed Feature Analysis (${this.analysisResult.detailedFeatures.length}):`
        );
        this.analysisResult.detailedFeatures.forEach((feature) => {
          const status =
            feature.status === "working"
              ? "✅"
              : feature.status === "partial"
              ? "⚠️"
              : feature.status === "broken"
              ? "❌"
              : "🚫";
          console.log(
            `\n  ${status} ${feature.name} (${feature.status}) - ${feature.priority} priority`
          );
          console.log(`    Files: ${feature.files.length} files`);
          console.log(
            `    Components: ${feature.components.length} components`
          );

          if (feature.issues.length > 0) {
            console.log(`    Issues:`);
            feature.issues.forEach((issue) => console.log(`      • ${issue}`));
          }

          if (feature.improvements.length > 0) {
            console.log(`    Improvements:`);
            feature.improvements.forEach((improvement) =>
              console.log(`      • ${improvement}`)
            );
          }

          if (feature.components.length > 0) {
            console.log(`    Component Status:`);
            feature.components.forEach((component) => {
              const compStatus =
                component.status === "working"
                  ? "✅"
                  : component.status === "partial"
                  ? "⚠️"
                  : "❌";
              console.log(
                `      ${compStatus} ${component.name} (${component.type})`
              );
              if (component.issues.length > 0) {
                component.issues.forEach((issue) =>
                  console.log(`        - ${issue}`)
                );
              }
            });
          }
        });
      } else {
        console.log(
          `\n👤 User Features (${this.analysisResult.userFeatures.length}):`
        );
        this.analysisResult.userFeatures.forEach((feature) => {
          const status =
            feature.completeness === "complete"
              ? "✅"
              : feature.completeness === "partial"
              ? "⚠️"
              : "❌";
          console.log(
            `  ${status} ${feature.name} (${feature.completeness}) - ${feature.userImpact} impact`
          );
        });

        console.log(
          `\n🔄 User Flows (${this.analysisResult.userFlows.length}):`
        );
        this.analysisResult.userFlows.forEach((flow) => {
          const status =
            flow.status === "working"
              ? "✅"
              : flow.status === "incomplete"
              ? "⚠️"
              : "❌";
          console.log(`  ${status} ${flow.name} (${flow.status})`);
        });
      }
    }

    console.log(`\n🔍 Issues Found (${this.analysisResult.patterns.length}):`);
    this.analysisResult.patterns.forEach((pattern) => {
      console.log(
        `  • ${pattern.type} (${pattern.severity}): ${pattern.description}`
      );
    });

    console.log(
      `\n💡 Suggestions (${this.analysisResult.suggestions.length}):`
    );
    this.analysisResult.suggestions.forEach((suggestion) => {
      console.log(`  • ${suggestion}`);
    });

    console.log(`\n📈 File Statistics:`);
    console.log(`  • Total files: ${this.analysisResult.fileStructure.length}`);

    const fileTypes: { [key: string]: number } = {};
    this.analysisResult.fileStructure.forEach((file) => {
      fileTypes[file.type] = (fileTypes[file.type] || 0) + 1;
    });

    Object.entries(fileTypes)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        console.log(`  • ${type}: ${count} files`);
      });
  }
}

// Linear issue creation functions (adapted from requirements-to-issues.ts)
function mapPriorityToLinear(priority: any) {
  if (typeof priority !== "string") return 1;
  const p = priority.trim().toLowerCase();
  if (p === "high") return 3;
  if (p === "medium") return 2;
  if (p === "low") return 1;
  if (p === "none" || p === "no" || p === "0") return 0;
  return 1;
}

function sanitizeIssueForLinear(issue: any) {
  const rawTitle = issue?.Title ?? issue?.title ?? "";
  const rawDescription = issue?.Description ?? issue?.description ?? "";
  const rawPriority = issue?.Priority ?? issue?.priority ?? "";
  const rawRequirements = issue?.Requirements ?? issue?.requirements ?? [];
  const rawAcceptanceCriteria =
    issue?.Acceptance_Criteria ?? issue?.acceptance_criteria ?? [];
  const rawTechnicalNotes =
    issue?.Technical_Notes ?? issue?.technical_notes ?? "";

  const title = String(rawTitle).trim().slice(0, 255);
  const description = String(rawDescription).trim();
  const priority = mapPriorityToLinear(rawPriority);

  // Handle both array and string formats for requirements
  let requirements: string[] = [];
  if (Array.isArray(rawRequirements)) {
    requirements = rawRequirements
      .map(String)
      .filter((r) => r.trim().length > 0);
  } else if (typeof rawRequirements === "string" && rawRequirements.trim()) {
    requirements = [rawRequirements.trim()];
  }

  // Handle both array and string formats for acceptance criteria
  let acceptanceCriteria: string[] = [];
  if (Array.isArray(rawAcceptanceCriteria)) {
    acceptanceCriteria = rawAcceptanceCriteria
      .map(String)
      .filter((c) => c.trim().length > 0);
  } else if (
    typeof rawAcceptanceCriteria === "string" &&
    rawAcceptanceCriteria.trim()
  ) {
    acceptanceCriteria = [rawAcceptanceCriteria.trim()];
  }

  // Handle both array and string formats for technical notes
  let technicalNotes = "";
  if (Array.isArray(rawTechnicalNotes)) {
    technicalNotes = rawTechnicalNotes
      .map(String)
      .filter((n) => n.trim().length > 0)
      .join("\n");
  } else {
    technicalNotes = String(rawTechnicalNotes).trim();
  }

  return {
    title,
    description,
    priority,
    requirements,
    acceptanceCriteria,
    technicalNotes,
  };
}

function buildRequirementsSection(
  requirements: string[],
  acceptanceCriteria: string[],
  technicalNotes: string
): string {
  const sections: string[] = [];

  if (requirements.length > 0) {
    sections.push("## Requirements");
    requirements.forEach((req, i) => {
      sections.push(`${i + 1}. ${req}`);
    });
  }

  if (acceptanceCriteria.length > 0) {
    sections.push("## Acceptance Criteria");
    acceptanceCriteria.forEach((criteria, i) => {
      sections.push(`${i + 1}. ${criteria}`);
    });
  }

  if (technicalNotes.trim()) {
    sections.push("## Technical Notes");
    sections.push(technicalNotes);
  }

  return sections.join("\n\n");
}

function inferCategories(title: string, description: string): string[] {
  const text = ` ${title}\n${description} `.toLowerCase();
  const categories: string[] = [];

  // Bug indicators
  if (
    /(bug|error|exception|stack\s*trace|crash|fail|broken|doesn't work|does not work|regression|not working|broken|malfunction)/.test(
      text
    )
  ) {
    categories.push("Bug");
  }

  // Improvement indicators
  if (
    /(improvement|enhancement|optimi[sz]e|speed|faster|performance|refactor|usability|quality|better|upgrade)/.test(
      text
    )
  ) {
    categories.push("Improvement");
  }

  // UI/Branding indicators
  if (
    /(ui|ux|interface|design|layout|styling|color|colour|font|typography|spacing|alignment|button|modal|dialog|hover|focus|visual|appearance)/.test(
      text
    )
  ) {
    categories.push("UI");
  }

  // Domain-specific categories
  if (/(session|manage|venue|event)/.test(text)) {
    categories.push("Session Management");
  }
  if (/(analytics|dashboard|energy|sentiment|timeline)/.test(text)) {
    categories.push("Analytics");
  }
  if (/(recording|record|capture|stream|camera)/.test(text)) {
    categories.push("Recording");
  }
  if (/(serato|track|dj|music|detection)/.test(text)) {
    categories.push("Serato Integration");
  }
  if (/(performance|metrics|monitoring)/.test(text)) {
    categories.push("Performance");
  }
  if (/(export|download|report|csv|pdf)/.test(text)) {
    categories.push("Data Export");
  }
  if (/(navigation|menu|sidebar|header|routing)/.test(text)) {
    categories.push("Navigation");
  }

  // Deduplicate while preserving order
  return Array.from(new Set(categories));
}

async function fetchLinearLabels(
  teamId: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query($id: String!) { team(id: $id) { labels { nodes { id name } } } }`,
        variables: { id: teamId },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const labels = res.data?.data?.team?.labels?.nodes || [];
    return labels.map((l: any) => ({ id: l.id, name: l.name }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear labels:",
      err.response?.data || err.message
    );
    return [];
  }
}

function findSimilarLabelId(
  category: string,
  availableLabels: Array<{ id: string; name: string }>
): string | null {
  const categoryLower = category.toLowerCase();

  // First try exact matches
  for (const label of availableLabels) {
    const labelName = String(label.name).toLowerCase();
    if (labelName === categoryLower) {
      return label.id;
    }
  }

  // Then try fuzzy matching
  for (const label of availableLabels) {
    const labelName = String(label.name).toLowerCase();

    // Check if category contains label name or vice versa
    if (
      categoryLower.includes(labelName) ||
      labelName.includes(categoryLower)
    ) {
      return label.id;
    }

    // Check for word overlap (at least 60% of words match)
    const categoryWords = categoryLower.split(/\s+/);
    const labelWords = labelName.split(/\s+/);

    if (categoryWords.length > 0 && labelWords.length > 0) {
      const commonWords = categoryWords.filter((word) =>
        labelWords.some(
          (labelWord) => word.includes(labelWord) || labelWord.includes(word)
        )
      );

      const similarity =
        commonWords.length / Math.max(categoryWords.length, labelWords.length);
      if (similarity >= 0.6) {
        return label.id;
      }
    }
  }

  return null;
}

function getLabelColor(labelName: string): string {
  const colorMap: Record<string, string> = {
    // Negative/Problem labels - use red tones
    Bug: "#ff6b6b",
    Error: "#ff6b6b",
    Issue: "#ff6b6b",
    Problem: "#ff6b6b",
    Critical: "#e74c3c",

    // UI/Design labels - use blue tones
    UI: "#74b9ff",
    UX: "#74b9ff",
    "User Experience": "#74b9ff",
    Design: "#74b9ff",
    Interface: "#74b9ff",

    // Feature/Enhancement labels - use green tones
    Feature: "#00b894",
    Enhancement: "#00b894",
    Improvement: "#00b894",
    "New Feature": "#00b894",

    // Technical/Backend labels - use purple tones
    Backend: "#a29bfe",
    API: "#a29bfe",
    Database: "#a29bfe",
    Server: "#a29bfe",
    Integration: "#a29bfe",

    // Domain-specific labels
    "Session Management": "#fd79a8",
    Analytics: "#fdcb6e",
    Recording: "#636e72",
    "Serato Integration": "#6c5ce7",
    Performance: "#00cec9",
    "Data Export": "#e84393",
    Navigation: "#ff7675",
  };

  return colorMap[labelName] || "#ddd6fe";
}

async function createLinearLabel(
  name: string,
  teamId?: string
): Promise<string | null> {
  try {
    const color = getLabelColor(name);
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id name } } }`,
        variables: {
          input: {
            name,
            color,
            teamId: teamId || undefined,
          },
        },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const id = res.data?.data?.issueLabelCreate?.issueLabel?.id as
      | string
      | undefined;
    return id || null;
  } catch (err: any) {
    console.error(
      "  ❌ Failed to create label:",
      err.response?.data || err.message
    );
    return null;
  }
}

async function ensureCategoryLabelId(
  category: string,
  availableLabels: Array<{ id: string; name: string }>,
  teamId: string,
  createdCache: Map<string, string>
): Promise<string | null> {
  // Check cache first
  const cached = createdCache.get(category.toLowerCase());
  if (cached) return cached;

  // Look for similar labels using fuzzy matching
  const similarId = findSimilarLabelId(category, availableLabels);
  if (similarId) {
    const similarLabel = availableLabels.find((l) => l.id === similarId);
    console.log(
      `    🔍 Reusing similar label: "${similarLabel?.name}" for "${category}"`
    );
    return similarId;
  }

  // Auto-create label for speed
  console.log(`    📋 Auto-creating label: "${category}"`);
  const newId = await createLinearLabel(category, teamId);
  if (newId) {
    availableLabels.push({ id: newId, name: category });
    createdCache.set(category.toLowerCase(), newId);
  }
  return newId;
}

async function createProjects(
  teamId: string,
  projectName: string
): Promise<any[]> {
  console.log("🏗️ Creating projects and milestones...");

  const projects = [
    {
      name: `${projectName} - Core System`,
      description: `Core functionality for ${projectName} including session management, analytics dashboard, and real-time recording system.`,
      color: "#bec2c8",
      milestones: [
        {
          name: "Session Management",
          description: "Complete session data persistence and state management",
          targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
        },
        {
          name: "Analytics Dashboard",
          description: "Fix analytics calculations and dashboard performance",
          targetDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 3 weeks
        },
        {
          name: "Real-time Recording",
          description: "Camera stream management and pose detection system",
          targetDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000), // 4 weeks
        },
      ],
    },
    {
      name: `${projectName} - Integration System`,
      description: `Integration features for ${projectName} including Serato integration and camera system improvements.`,
      color: "#bec2c8",
      milestones: [
        {
          name: "Serato Integration",
          description: "Complete track detection and timeline synchronization",
          targetDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), // 5 weeks
        },
        {
          name: "Camera Integration",
          description: "Camera device management and video stream processing",
          targetDate: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000), // 6 weeks
        },
      ],
    },
    {
      name: `${projectName} - Performance & Export`,
      description: `Performance analytics system and data export functionality for ${projectName}.`,
      color: "#bec2c8",
      milestones: [
        {
          name: "Performance Analytics",
          description: "Metrics calculation engine and data processing",
          targetDate: new Date(Date.now() + 49 * 24 * 60 * 60 * 1000), // 7 weeks
        },
        {
          name: "Data Export",
          description: "Export system core and processing engine",
          targetDate: new Date(Date.now() + 56 * 24 * 60 * 60 * 1000), // 8 weeks
        },
      ],
    },
    {
      name: `${projectName} - UI & Navigation`,
      description: `Navigation system improvements and UI component library fixes for ${projectName}.`,
      color: "#bec2c8",
      milestones: [
        {
          name: "Navigation System",
          description: "Navigation state management and responsive design",
          targetDate: new Date(Date.now() + 63 * 24 * 60 * 60 * 1000), // 9 weeks
        },
        {
          name: "UI Component Library",
          description: "Fix App components and mobile optimization",
          targetDate: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000), // 10 weeks
        },
      ],
    },
  ];

  const createdProjects = [];

  for (const projectData of projects) {
    try {
      console.log(`  📋 Creating project: ${projectData.name}`);

      // Create project
      const projectRes = await axios.post(
        "https://api.linear.app/graphql",
        {
          query: `
            mutation($input: ProjectCreateInput!) {
              projectCreate(input: $input) { 
                success 
                project { 
                  id 
                  name 
                  description 
                } 
              }
            }
          `,
          variables: {
            input: {
              name: projectData.name,
              description: projectData.description,
              color: projectData.color,
              teamIds: [teamId],
            },
          },
        },
        {
          headers: {
            Authorization: LINEAR_KEY as string,
            "Content-Type": "application/json",
          },
        }
      );

      const project = projectRes.data?.data?.projectCreate?.project;
      if (project) {
        console.log(`  ✅ Created project: ${project.name}`);

        // Create milestones for this project
        const milestones = [];
        for (const milestoneData of projectData.milestones) {
          try {
            console.log(`    🎯 Creating milestone: ${milestoneData.name}`);

            const milestoneRes = await axios.post(
              "https://api.linear.app/graphql",
              {
                query: `
                  mutation($input: ProjectMilestoneCreateInput!) {
                    projectMilestoneCreate(input: $input) { 
                      success 
                      projectMilestone { 
                        id 
                        name 
                        description 
                      } 
                    }
                  }
                `,
                variables: {
                  input: {
                    name: milestoneData.name,
                    description: milestoneData.description,
                    projectId: project.id,
                    targetDate: milestoneData.targetDate.toISOString(),
                  },
                },
              },
              {
                headers: {
                  Authorization: LINEAR_KEY as string,
                  "Content-Type": "application/json",
                },
              }
            );

            const milestone =
              milestoneRes.data?.data?.projectMilestoneCreate?.projectMilestone;
            if (milestone) {
              console.log(`    ✅ Created milestone: ${milestone.name}`);
              milestones.push(milestone);
            }
          } catch (err: any) {
            console.error(
              `    ❌ Failed to create milestone:`,
              err.response?.data || err.message
            );
          }
        }

        createdProjects.push({
          ...project,
          milestones,
        });
      }
    } catch (err: any) {
      console.error(
        `  ❌ Failed to create project:`,
        err.response?.data || err.message
      );
    }
  }

  console.log(`✅ Created ${createdProjects.length} projects with milestones`);
  return createdProjects;
}

async function createDetailedLinearIssues(
  issues: any[],
  teamId: string,
  projectName: string,
  analysisMode: AnalysisMode
) {
  console.log("📬 Creating detailed issues in Linear...");
  const labels = await fetchLinearLabels(teamId);
  const createdLabelsCache = new Map<string, string>();

  // Create projects and milestones first
  const projects = await createProjects(teamId, projectName);

  let processedCount = 0;

  for (const issue of issues) {
    processedCount++;
    console.log(`  📝 Processing issue ${processedCount}/${issues.length}...`);

    try {
      const {
        title,
        description,
        priority,
        requirements,
        acceptanceCriteria,
        technicalNotes,
      } = sanitizeIssueForLinear(issue);

      if (!title) {
        console.warn("  ⏭️ Skipping issue with empty title");
        continue;
      }

      // Infer labels for the issue
      const categories = inferCategories(title, description);
      const labelIds: string[] = [];

      // Add analysis type label first
      const analysisTypeLabel = getAnalysisTypeLabel(analysisMode);
      const analysisLabelId = await ensureCategoryLabelId(
        analysisTypeLabel,
        labels,
        teamId,
        createdLabelsCache
      );
      if (analysisLabelId) labelIds.push(analysisLabelId);

      // Add other inferred categories
      for (const category of categories) {
        const id = await ensureCategoryLabelId(
          category,
          labels,
          teamId,
          createdLabelsCache
        );
        if (id) labelIds.push(id);
        if (labelIds.length >= 4) break; // Increased limit to accommodate analysis type label
      }

      // Determine project for this issue
      let projectId: string | undefined;

      if (issue.isParent) {
        // Parent issues go to appropriate projects based on feature
        const featureName = issue.parentFeature || "";
        if (
          featureName.includes("Session") ||
          featureName.includes("Analytics") ||
          featureName.includes("Recording")
        ) {
          projectId = projects.find((p) => p.name.includes("Core System"))?.id;
        } else if (
          featureName.includes("Serato") ||
          featureName.includes("Camera")
        ) {
          projectId = projects.find((p) =>
            p.name.includes("Integration System")
          )?.id;
        } else if (
          featureName.includes("Performance") ||
          featureName.includes("Export")
        ) {
          projectId = projects.find((p) =>
            p.name.includes("Performance & Export")
          )?.id;
        } else if (
          featureName.includes("Navigation") ||
          featureName.includes("UI")
        ) {
          projectId = projects.find((p) =>
            p.name.includes("UI & Navigation")
          )?.id;
        }
      } else if (issue.isSubIssue) {
        // Sub-issues go to the same project as their parent feature
        const featureName = issue.parentFeature || "";
        if (
          featureName.includes("Session") ||
          featureName.includes("Analytics") ||
          featureName.includes("Recording")
        ) {
          projectId = projects.find((p) => p.name.includes("Core System"))?.id;
        } else if (
          featureName.includes("Serato") ||
          featureName.includes("Camera")
        ) {
          projectId = projects.find((p) =>
            p.name.includes("Integration System")
          )?.id;
        } else if (
          featureName.includes("Performance") ||
          featureName.includes("Export")
        ) {
          projectId = projects.find((p) =>
            p.name.includes("Performance & Export")
          )?.id;
        } else if (
          featureName.includes("Navigation") ||
          featureName.includes("UI")
        ) {
          projectId = projects.find((p) =>
            p.name.includes("UI & Navigation")
          )?.id;
        }
      }

      // Build detailed requirements section
      const requirementsSection = buildRequirementsSection(
        requirements,
        acceptanceCriteria,
        technicalNotes
      );

      // Add source analysis reference
      const sourceSection = `## Source Analysis\nGenerated from codebase analysis of: \`${projectName}\`\nAnalysis type: Deep End-User Review`;

      // Add milestone assignment note for parent issues
      let milestoneNote = "";
      if (issue.isParent && projectId) {
        const project = projects.find((p) => p.id === projectId);
        if (project && project.milestones && project.milestones.length > 0) {
          milestoneNote = `\n\n## 📋 Milestone Assignment\nThis issue should be manually assigned to the appropriate milestone in the **${project.name}** project:\n\n`;
          project.milestones.forEach((milestone) => {
            milestoneNote += `- **${milestone.name}**: ${milestone.description}\n`;
          });
          milestoneNote += `\n**To assign**: Select this issue and use \`Shift+M\`, or drag it onto the milestone in the project details pane.`;
        }
      }

      const parts = [
        description,
        requirementsSection,
        sourceSection,
        milestoneNote,
      ].filter((p) => p && p.trim().length > 0);
      const finalDescription = parts.join("\n\n");

      console.log(`    📤 Creating Linear issue: "${title}"...`);
      const res = await axios.post(
        "https://api.linear.app/graphql",
        {
          query: `
            mutation($input: IssueCreateInput!) {
              issueCreate(input: $input) { success issue { id title } }
            }
          `,
          variables: {
            input: {
              teamId,
              title,
              description: finalDescription,
              priority,
              labelIds: labelIds.length ? labelIds : undefined,
              projectId: projectId || undefined,
            },
          },
        },
        {
          headers: {
            Authorization: LINEAR_KEY as string,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const issueId = res.data?.data?.issueCreate?.issue?.id;
      const created = res.data?.data?.issueCreate?.issue?.title;

      if (created && issueId) {
        console.log(`  ✅ Created issue: ${created}`);
      } else {
        const errors = res.data?.errors || res.data?.data?.issueCreate?.errors;
        if (errors) {
          console.error(
            "  ❌ Linear validation errors:",
            JSON.stringify(errors, null, 2)
          );
        } else {
          console.log("  ⚠️ Unexpected Linear response:", res.data);
        }
      }

      // Delay between issues for rate limiting
      if (processedCount < issues.length) {
        console.log(`    ⏳ Waiting 500ms before next issue...`);
        await sleep(500);
      }
    } catch (err: any) {
      console.error(
        "  ❌ Failed to create issue:",
        err.response?.data || err.message
      );
    }
  }

  console.log("✅ All detailed issues processed");
}

async function createIssuesInLinear(
  issues: any[],
  analysisMode: AnalysisMode,
  analysisDepth: AnalysisDepth,
  projectName: string
) {
  // Select team for creating issues
  console.log("\n🎯 Select team for creating Linear issues:");
  const teamManager = new TeamManager();
  const teamId = await teamManager.selectTeam();

  console.log(
    `\n🎯 Creating ${issues.length} Linear issues for team: ${teamId}`
  );

  // For deep analysis, create detailed issues in Linear
  if (analysisDepth === "deep") {
    await createDetailedLinearIssues(issues, teamId, projectName, analysisMode);
  } else {
    // Show issues for other analysis types
    for (const issue of issues) {
      console.log(`\n📝 ${issue.title}`);
      console.log(`   Type: ${issue.type} | Priority: ${issue.priority}`);
      console.log(`   Category: ${issue.category}`);
      console.log(`   Description: ${issue.description}`);
      if (issue.files && issue.files.length > 0) {
        console.log(`   Files: ${issue.files.join(", ")}`);
      }
    }
  }
}

async function saveIssuesToFile(issues: any[], projectName: string) {
  const timestamp = Date.now();
  const filename = `analysis-issues-${projectName}-${timestamp}.json`;

  try {
    fs.writeFileSync(filename, JSON.stringify(issues, null, 2));
    console.log(`\n💾 Issues saved to: ${filename}`);
    console.log(`📊 Total issues: ${issues.length}`);

    // Show summary
    if (issues.length > 0) {
      console.log("\n📋 Issue Summary:");
      issues.forEach((issue, index) => {
        const title = issue.Title || issue.title;
        const priority = issue.Priority || issue.priority;
        console.log(`  ${index + 1}. ${title} (${priority})`);
      });
    }
  } catch (error) {
    console.error("❌ Failed to save issues:", error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let targetPath: string;
  let analysisMode: AnalysisMode;
  let analysisDepth: AnalysisDepth;

  if (args.length === 0) {
    // Interactive folder selection
    console.log("📁 Codebase Analysis Tool");
    console.log("=".repeat(50));
    console.log("Drag and drop a folder here to analyze its codebase,");
    console.log("or press Enter to browse for a folder...");
    console.log("");

    const { folderPath } = await inquirer.prompt([
      {
        type: "input",
        name: "folderPath",
        message: "📂 Folder path:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Please provide a folder path";
          }
          return true;
        },
      },
    ]);

    targetPath = folderPath.trim();
  } else {
    targetPath = args[0];
  }

  // Check for non-interactive mode flags
  const isNonInteractive =
    args.includes("--end-user") ||
    args.includes("--deep") ||
    args.includes("--architecture") ||
    args.includes("--security") ||
    args.includes("--performance");

  if (isNonInteractive) {
    // Non-interactive mode - use command line arguments
    if (args.includes("--end-user")) {
      analysisMode = "end-user";
    } else if (args.includes("--architecture")) {
      analysisMode = "architecture";
    } else if (args.includes("--security")) {
      analysisMode = "security";
    } else if (args.includes("--performance")) {
      analysisMode = "performance";
    } else {
      analysisMode = "end-user"; // Default to end-user for deep analysis
    }

    if (args.includes("--deep")) {
      analysisDepth = "deep";
    } else {
      analysisDepth = "lightweight";
    }

    console.log(
      `\n🔍 Non-interactive mode: ${analysisMode} analysis (${analysisDepth})`
    );
  } else {
    // Interactive mode - Single scan with checkbox selection
    console.log("\n🔍 Select what to include in analysis:");
    const { includeTypes } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "includeTypes",
        message: "What should we analyze? (Space to select, Enter to confirm)",
        choices: [
          {
            name: "🐛 Bugs & Critical Issues - Runtime errors, crashes, data corruption",
            value: "bugs",
            checked: true,
          },
          {
            name: "🔒 Security Vulnerabilities - Security issues, unsafe practices, data exposure",
            value: "security",
            checked: true,
          },
          {
            name: "⚡ Performance Issues - Slow performance, memory leaks, scalability problems",
            value: "performance",
            checked: true,
          },
          {
            name: "🏗️ Architecture Problems - Poor design patterns, tight coupling, maintainability",
            value: "architecture",
            checked: true,
          },
          {
            name: "🛡️ Missing Error Handling - Code paths without proper error handling",
            value: "error-handling",
            checked: true,
          },
          {
            name: "✨ Code Quality Issues - Anti-patterns, code smells, best practice violations",
            value: "code-quality",
            checked: true,
          },
          {
            name: "🔌 Integration Issues - Problems with APIs, databases, external services",
            value: "integration",
            checked: true,
          },
          {
            name: "👤 User Experience Issues - Problems affecting end users",
            value: "ux",
            checked: true,
          },
          {
            name: "📦 Dependency Issues - Outdated, vulnerable, or problematic dependencies",
            value: "dependencies",
            checked: true,
          },
          {
            name: "⚙️ Configuration Issues - Misconfigurations, missing settings, security gaps",
            value: "configuration",
            checked: true,
          },
        ],
        validate: (answer) => {
          if (answer.length === 0) {
            return "Please select at least one type to analyze";
          }
          return true;
        },
      },
    ]);

    // Map selections to analysis mode (use first selected as primary mode)
    if (includeTypes.includes("bugs")) {
      analysisMode = "end-user";
    } else if (includeTypes.includes("security")) {
      analysisMode = "security";
    } else if (includeTypes.includes("performance")) {
      analysisMode = "performance";
    } else if (includeTypes.includes("architecture")) {
      analysisMode = "architecture";
    } else {
      analysisMode = "end-user";
    }

    // Always use deep analysis for comprehensive results
    analysisDepth = "deep";

    // Store the include types for use in analysis
    (global as any).includeTypes = includeTypes;
  }

  try {
    const analyzer = new CodebaseAnalyzer(
      targetPath,
      analysisMode,
      analysisDepth
    );
    const result = await analyzer.analyze();

    analyzer.printAnalysisReport();

    // Generate issues first
    const issues = await analyzer.generateLinearIssues();
    console.log(`\n🎯 Generated ${issues.length} potential Linear issues`);

    // Always show issues first
    console.log("\n📋 ISSUE PREVIEW");
    console.log("=".repeat(50));

    if (analysisMode === "end-user" && analysisDepth === "deep") {
      // Show detailed issues for deep analysis with parent/sub-issue structure
      const parentIssues = issues.filter((issue) => issue.isParent);
      const subIssues = issues.filter((issue) => issue.isSubIssue);

      console.log(`\n📋 Parent Issues (${parentIssues.length}):`);
      for (let i = 0; i < parentIssues.length; i++) {
        const issue = parentIssues[i];
        console.log(`\n${i + 1}. 📋 ${issue.Title}`);
        console.log(`   Priority: ${issue.Priority}`);
        console.log(`   Category: ${issue.category}`);
        console.log(
          `   Description: ${issue.Description.substring(0, 200)}...`
        );
        console.log(`   Requirements: ${issue.Requirements.length} items`);
        console.log(
          `   Acceptance Criteria: ${issue.Acceptance_Criteria.length} items`
        );
        console.log(
          `   Technical Notes: ${issue.Technical_Notes.length} items`
        );
        if (issue.files && issue.files.length > 0) {
          console.log(
            `   Files: ${issue.files.slice(0, 3).join(", ")}${
              issue.files.length > 3 ? ` (+${issue.files.length - 3} more)` : ""
            }`
          );
        }
      }

      console.log(`\n📋 Sub-Issues (${subIssues.length}):`);
      for (let i = 0; i < subIssues.length; i++) {
        const issue = subIssues[i];
        console.log(`\n${i + 1}. 🔧 ${issue.Title}`);
        console.log(`   Parent Feature: ${issue.parentFeature}`);
        console.log(`   Priority: ${issue.Priority}`);
        console.log(`   Category: ${issue.category}`);
        console.log(
          `   Description: ${issue.Description.substring(0, 150)}...`
        );
        console.log(`   Requirements: ${issue.Requirements.length} items`);
        console.log(
          `   Acceptance Criteria: ${issue.Acceptance_Criteria.length} items`
        );
        console.log(
          `   Technical Notes: ${issue.Technical_Notes.length} items`
        );
        if (issue.files && issue.files.length > 0) {
          console.log(
            `   Files: ${issue.files.slice(0, 3).join(", ")}${
              issue.files.length > 3 ? ` (+${issue.files.length - 3} more)` : ""
            }`
          );
        }
      }
    } else {
      // Show simple issues for other analysis types
      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        console.log(`\n${i + 1}. ${issue.title}`);
        console.log(`   Type: ${issue.type} | Priority: ${issue.priority}`);
        console.log(`   Category: ${issue.category}`);
        console.log(
          `   Description: ${issue.description.substring(0, 200)}...`
        );
        if (issue.files && issue.files.length > 0) {
          console.log(
            `   Files: ${issue.files.slice(0, 3).join(", ")}${
              issue.files.length > 3 ? ` (+${issue.files.length - 3} more)` : ""
            }`
          );
        }
      }
    }

    // Ask what to do with the issues
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do with these issues?",
        choices: [
          {
            name: "📤 Create all issues in Linear",
            value: "create",
          },
          {
            name: "👀 View detailed issue content",
            value: "view",
          },
          {
            name: "💾 Save issues to JSON file",
            value: "save",
          },
          {
            name: "❌ Skip creating issues",
            value: "skip",
          },
        ],
        default: "create",
      },
    ]);

    if (action === "view") {
      // Show detailed content for each issue
      const { issueIndex } = await inquirer.prompt([
        {
          type: "list",
          name: "issueIndex",
          message: "Select an issue to view in detail:",
          choices: issues.map((issue, index) => ({
            name: `${index + 1}. ${
              analysisMode === "end-user" && analysisDepth === "deep"
                ? issue.Title
                : issue.title
            }`,
            value: index,
          })),
        },
      ]);

      const selectedIssue = issues[issueIndex];
      console.log("\n" + "=".repeat(80));
      console.log(
        `📝 ${
          analysisMode === "end-user" && analysisDepth === "deep"
            ? selectedIssue.Title
            : selectedIssue.title
        }`
      );
      console.log("=".repeat(80));

      if (analysisMode === "end-user" && analysisDepth === "deep") {
        console.log(`\n📋 Description:`);
        console.log(selectedIssue.Description);

        console.log(`\n📋 Requirements:`);
        selectedIssue.Requirements.forEach((req, i) => {
          console.log(`${i + 1}. ${req}`);
        });

        console.log(`\n📋 Acceptance Criteria:`);
        selectedIssue.Acceptance_Criteria.forEach((criteria, i) => {
          console.log(`${i + 1}. ${criteria}`);
        });

        console.log(`\n📋 Technical Notes:`);
        selectedIssue.Technical_Notes.forEach((note, i) => {
          console.log(`${i + 1}. ${note}`);
        });

        if (selectedIssue.files && selectedIssue.files.length > 0) {
          console.log(`\n📁 Files:`);
          selectedIssue.files.forEach((file, i) => {
            console.log(`${i + 1}. ${file}`);
          });
        }
      } else {
        console.log(`\n📋 Description:`);
        console.log(selectedIssue.description);
        console.log(`\n📋 Type: ${selectedIssue.type}`);
        console.log(`📋 Priority: ${selectedIssue.priority}`);
        console.log(`📋 Category: ${selectedIssue.category}`);

        if (selectedIssue.files && selectedIssue.files.length > 0) {
          console.log(`\n📁 Files:`);
          selectedIssue.files.forEach((file, i) => {
            console.log(`${i + 1}. ${file}`);
          });
        }
      }

      console.log("\n" + "=".repeat(80));

      // Ask again what to do
      const { finalAction } = await inquirer.prompt([
        {
          type: "list",
          name: "finalAction",
          message: "What would you like to do now?",
          choices: [
            {
              name: "📤 Create all issues in Linear",
              value: "create",
            },
            {
              name: "💾 Save issues to JSON file",
              value: "save",
            },
            {
              name: "❌ Skip creating issues",
              value: "skip",
            },
          ],
          default: "create",
        },
      ]);

      if (finalAction === "create") {
        await createIssuesInLinear(
          issues,
          analysisMode,
          analysisDepth,
          analyzer.analysisResult.projectName
        );
      } else if (finalAction === "save") {
        await saveIssuesToFile(issues, analyzer.analysisResult.projectName);
      }
    } else if (action === "create") {
      await createIssuesInLinear(
        issues,
        analysisMode,
        analysisDepth,
        analyzer.analysisResult.projectName
      );
    } else if (action === "save") {
      await saveIssuesToFile(issues, analyzer.analysisResult.projectName);
    }
  } catch (error) {
    console.error("❌ Analysis failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { CodebaseAnalyzer, AnalysisResult, IssueInfo };
