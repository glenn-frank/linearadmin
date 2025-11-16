#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { LinearClient } from "@linear/sdk";
import inquirer from "inquirer";
import * as dotenv from "dotenv";

dotenv.config();

interface NextJsAppConfig {
  appName: string;
  description: string;
  projectDirectory: string;
  teamOption: "new" | "existing";
  teamId?: string;
  newTeamName?: string;
  autoStartServer: boolean;
}

interface IssueWithDependencies {
  title: string;
  description: string;
  priority: number;
  labels: string[];
  blockedBy?: number[];
}

class NextJsAppCreator {
  private linear: LinearClient;
  private config!: NextJsAppConfig;
  private projectPath!: string;
  private linearAvailable = true;

  constructor(linear: LinearClient) {
    this.linear = linear;
  }

  async createApp(): Promise<void> {
    console.log("🚀 Next.js App Creator (Optimized for Cursor AI)");
    console.log("=====================================\n");

    try {
      // Test Linear connection
      await this.testLinearConnection();

      // Get configuration (7 questions)
      this.config = await this.getConfiguration();

      // Create project directory
      await this.createProjectDirectory();

      // Create Next.js app
      await this.createNextJsApp();

      // Setup authentication first (installs bcryptjs)
      await this.setupAuthentication();

      // Setup database (Prisma) - needs bcryptjs for seeding
      await this.setupDatabase();

      // Create pages and components
      await this.createPages();

      // Create API routes
      await this.createApiRoutes();

      // Create theme system
      await this.createThemeSystem();

      // Add .cursorrules
      await this.addCursorRules();

      // Initialize git
      await this.initializeGit();

      // Create Linear project and issues
      if (this.linearAvailable) {
        await this.createLinearProject();
      }

      // Generate README
      await this.generateDocumentation();

      console.log(
        `\n✅ Next.js app "${this.config.appName}" created successfully!`,
      );
      console.log(`📁 Project location: ${this.projectPath}`);
      console.log(`\n🎯 Auto-configured with:`);
      console.log(`   ✅ Next.js 14 with App Router`);
      console.log(`   ✅ TypeScript (fully typed)`);
      console.log(`   ✅ Prisma ORM + SQLite`);
      console.log(`   ✅ NextAuth.js authentication`);
      console.log(`   ✅ TailwindCSS styling`);
      console.log(`   ✅ Linear project + issues`);
      console.log(`   ✅ Repo label: glenn-frank/[team-name]`);
      console.log(`   ✅ .cursorrules for dependencies`);

      // Auto-start server
      if (this.config.autoStartServer) {
        console.log(`\n🚀 Starting development server...`);
        console.log(`\n📱 Open http://localhost:3000 in your browser\n`);

        execSync("npm run dev", {
          cwd: this.projectPath,
          stdio: "inherit",
        });
      } else {
        console.log(`\n💡 To start development:`);
        console.log(`   cd ${this.config.appName}`);
        console.log(`   npm run dev`);
      }
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  }

  private async testLinearConnection(): Promise<void> {
    console.log("🔗 Testing Linear connection...");
    try {
      await this.linear.teams();
      console.log("✅ Linear connection successful\n");
    } catch (error: any) {
      console.log("❌ Linear connection failed");
      console.log(`   Error: ${error.message}\n`);

      const { continueAnyway } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueAnyway",
          message: "Continue without Linear integration?",
          default: false,
        },
      ]);

      if (!continueAnyway) {
        throw new Error("Linear connection required");
      }

      this.linearAvailable = false;
      console.log("⚠️  Continuing without Linear integration...\n");
    }
  }

  private async getConfiguration(): Promise<NextJsAppConfig> {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "appName",
        message: "App name:",
        validate: (input: string) => {
          if (!input.trim()) return "App name is required";
          if (!/^[a-z0-9-]+$/.test(input))
            return "Use lowercase letters, numbers, and hyphens only";
          return true;
        },
      },
      {
        type: "input",
        name: "description",
        message: "Description:",
        default: "A modern Next.js application with TypeScript",
      },
      {
        type: "input",
        name: "projectDirectory",
        message: "Where to create:",
        default: path.join(require("os").homedir(), "Documents", "apps"),
        validate: (input: string) => {
          if (!fs.existsSync(input)) return "Directory does not exist";
          return true;
        },
      },
      {
        type: "list",
        name: "teamOption",
        message: "Linear team:",
        choices: [
          { name: "Create new team", value: "new" },
          { name: "Use existing team", value: "existing" },
        ],
        default: "existing",
      },
      {
        type: "input",
        name: "newTeamName",
        message: "New team name:",
        when: (answers: any) => answers.teamOption === "new",
        validate: (input: string) => {
          if (!input.trim()) return "Team name is required";
          return true;
        },
      },
      {
        type: "list",
        name: "teamId",
        message: "Select team:",
        choices: async () => {
          const teams = await this.linear.teams();
          return teams.nodes.map((team) => ({
            name: team.name,
            value: team.id,
          }));
        },
        when: (answers: any) => answers.teamOption === "existing",
      },
      {
        type: "confirm",
        name: "autoStartServer",
        message: "Auto-start development server?",
        default: true,
      },
    ]);

    console.log("\n🎯 Auto-configured:");
    console.log("   ✅ Framework: Next.js 14 with App Router");
    console.log("   ✅ Language: TypeScript (fully typed)");
    console.log("   ✅ Database: Prisma + SQLite");
    console.log("   ✅ Auth: NextAuth.js");
    console.log("   ✅ Styling: TailwindCSS v4");
    console.log("   ✅ Features: Auth, Dashboard, Profile, API routes");
    console.log("   ✅ Linear: New project + Cursor agent assigned");
    console.log("   ✅ Repo label: glenn-frank/[team-name]");
    console.log("");

    return {
      ...answers,
      teamId: answers.teamId || "",
    };
  }

  private async createProjectDirectory(): Promise<void> {
    console.log("📁 Creating project directory...\n");

    this.projectPath = path.join(
      this.config.projectDirectory,
      this.config.appName,
    );

    if (fs.existsSync(this.projectPath)) {
      throw new Error(`Directory ${this.projectPath} already exists`);
    }

    fs.mkdirSync(this.projectPath, { recursive: true });
  }

  private async createNextJsApp(): Promise<void> {
    console.log("⚡ Creating Next.js application...");
    console.log("   This may take 2-3 minutes...\n");

    // Create Next.js app with TypeScript, TailwindCSS, App Router
    // All defaults selected: ESLint yes, Turbopack no, src/ yes, App Router yes
    execSync(
      `npx create-next-app@latest ${this.config.appName} --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-git --yes`,
      {
        cwd: this.config.projectDirectory,
        stdio: "inherit",
      },
    );

    console.log("✅ Next.js app created\n");
  }

  private async setupDatabase(): Promise<void> {
    console.log("🗄️ Setting up Prisma database...\n");

    // Install Prisma
    execSync("npm install -D prisma && npm install @prisma/client", {
      cwd: this.projectPath,
      stdio: "inherit",
    });

    // Create .env file with DATABASE_URL BEFORE prisma init
    const envContent = `# Database
DATABASE_URL="file:./dev.db"

# NextAuth
NEXTAUTH_SECRET="${this.generateSecret()}"
NEXTAUTH_URL="http://localhost:3000"
`;

    fs.writeFileSync(path.join(this.projectPath, ".env"), envContent);
    console.log("✅ .env file created");

    // Create prisma directory
    const prismaDir = path.join(this.projectPath, "prisma");
    if (!fs.existsSync(prismaDir)) {
      fs.mkdirSync(prismaDir, { recursive: true });
    }

    // Create User schema
    const prismaSchema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?
  role          String    @default("user")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
`;

    fs.writeFileSync(path.join(prismaDir, "schema.prisma"), prismaSchema);

    console.log("✅ Prisma schema created");

    // Generate Prisma client
    console.log("🔧 Generating Prisma client...");
    execSync("npx prisma generate", {
      cwd: this.projectPath,
      stdio: "inherit",
    });

    // Create database
    console.log("🗄️ Creating database...");
    execSync("npx prisma db push", {
      cwd: this.projectPath,
      stdio: "inherit",
    });

    // Create default test user
    console.log("👤 Creating default test user...");

    const seedScript = `import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Check if test user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: "test@example.com" },
  });

  if (existingUser) {
    console.log("ℹ️  Test user already exists");
    return;
  }

  // Create test user
  const hashedPassword = await bcrypt.hash("password", 10);
  
  await prisma.user.create({
    data: {
      name: "Test User",
      email: "test@example.com",
      password: hashedPassword,
      role: "admin",
    },
  });

  console.log("✅ Test user created:");
  console.log("   Email: test@example.com");
  console.log("   Password: password");
}

main()
  .catch((e) => {
    console.error("Error creating test user:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
`;

    fs.writeFileSync(
      path.join(this.projectPath, "prisma", "seed.ts"),
      seedScript,
    );

    // Run seed script
    try {
      execSync("npx tsx prisma/seed.ts", {
        cwd: this.projectPath,
        stdio: "inherit",
      });
      console.log("\n✅ Test user created successfully!");
      console.log("   📧 Email: test@example.com");
      console.log("   🔑 Password: password\n");
    } catch (error: any) {
      console.log("\n⚠️  Could not create test user automatically");
      console.log("   You can create an account via the signup page\n");
    }

    console.log("✅ Database configured\n");
  }

  private generateSecret(): string {
    // Generate a random 32-byte secret for NextAuth
    const crypto = require("crypto");
    return crypto.randomBytes(32).toString("base64");
  }

  private async setupAuthentication(): Promise<void> {
    console.log("🔐 Setting up NextAuth.js...\n");

    // Install NextAuth and Prisma adapter
    execSync("npm install next-auth@beta @auth/prisma-adapter", {
      cwd: this.projectPath,
      stdio: "inherit",
    });

    // Install bcrypt for password hashing
    execSync("npm install bcryptjs && npm install -D @types/bcryptjs", {
      cwd: this.projectPath,
      stdio: "inherit",
    });

    // Create auth.ts config
    const authConfig = `import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./lib/prisma";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
`;

    // Create auth.ts in src/ directory (where @/ alias points to)
    const srcDir = path.join(this.projectPath, "src");
    fs.writeFileSync(path.join(srcDir, "auth.ts"), authConfig);

    // Create Prisma client singleton in src/lib/
    const prismaClient = `import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;

    const libDir = path.join(srcDir, "lib");
    if (!fs.existsSync(libDir)) {
      fs.mkdirSync(libDir, { recursive: true });
    }

    fs.writeFileSync(path.join(libDir, "prisma.ts"), prismaClient);

    console.log("✅ Authentication configured\n");
  }

  private async addCursorRules(): Promise<void> {
    console.log("🤖 Adding .cursorrules...\n");

    const cursorrulesSrc = path.join(__dirname, "..", ".cursorrules.template");
    const cursorrulesDest = path.join(this.projectPath, ".cursorrules");

    if (fs.existsSync(cursorrulesSrc)) {
      fs.copyFileSync(cursorrulesSrc, cursorrulesDest);
      console.log("✅ Dependency rules configured\n");
    }
  }

  private async initializeGit(): Promise<void> {
    console.log("🔧 Initializing git...\n");

    execSync("git init", { cwd: this.projectPath, stdio: "inherit" });
    execSync("git branch -M main", { cwd: this.projectPath, stdio: "inherit" });
    execSync("git add .", { cwd: this.projectPath, stdio: "inherit" });
    execSync('git commit -m "Initial commit: Next.js + TypeScript + Prisma"', {
      cwd: this.projectPath,
      stdio: "inherit",
    });

    console.log("✅ Git initialized\n");
  }

  private async createLinearProject(): Promise<void> {
    console.log("📋 Creating Linear project and issues...\n");

    let teamId = this.config.teamId;

    // Create or select team
    if (this.config.teamOption === "new") {
      const newTeam = await this.linear.createTeam({
        name: this.config.newTeamName!,
        description: `Team for ${this.config.appName} development`,
      });
      teamId = newTeam.id;
      console.log(`✅ Created team: ${newTeam.name}`);
    }

    // Create project
    const projectPayload = await this.linear.createProject({
      name: `${this.config.appName} - Development`,
      description: this.config.description,
      teamIds: [teamId!],
      state: "planned",
    });

    const project = await projectPayload.project;

    if (!project) {
      throw new Error("Failed to create Linear project");
    }

    console.log(`✅ Created project: ${project.name}`);

    // Generate repo label
    const team = await this.linear.team(teamId!);
    const repoLabel = `glenn-frank/${team.name
      .toLowerCase()
      .replace(/\s+/g, "-")}`;

    console.log(`📁 Using repo label: ${repoLabel}`);

    // Create development issues with dependencies
    const issues: IssueWithDependencies[] = [
      {
        title: "Setup Development Environment",
        description: "Install dependencies and verify Next.js dev server runs",
        priority: 1,
        labels: ["setup", "infrastructure", repoLabel],
      },
      {
        title: "Configure Database Schema",
        description: "Setup Prisma schema and create initial migrations",
        priority: 2,
        labels: ["database", "backend", repoLabel],
        blockedBy: [0],
      },
      {
        title: "Implement Authentication System",
        description:
          "Setup NextAuth with credentials provider and session management",
        priority: 3,
        labels: ["auth", "backend", repoLabel],
        blockedBy: [1],
      },
      {
        title: "Build Login and Signup Pages",
        description: "Create authentication UI with form validation",
        priority: 3,
        labels: ["frontend", "auth", repoLabel],
        blockedBy: [2],
      },
      {
        title: "Create Dashboard Layout",
        description: "Build main dashboard with navigation and user profile",
        priority: 4,
        labels: ["frontend", "ui", repoLabel],
        blockedBy: [3],
      },
      {
        title: "Implement API Routes",
        description: "Create REST API endpoints for core functionality",
        priority: 4,
        labels: ["backend", "api", repoLabel],
        blockedBy: [1],
      },
    ];

    // Create issues with labels
    const createdIssues: Record<number, string> = {};

    for (let idx = 0; idx < issues.length; idx++) {
      const issue = issues[idx];

      // Get/create label IDs (robust handling like Laravel version)
      const labelIds: string[] = [];
      for (const labelName of issue.labels) {
        try {
          // Search for label with BOTH name AND team filter
          const labels = await this.linear.issueLabels({
            filter: {
              name: { eq: labelName },
              team: { id: { eq: teamId! } },
            },
          });

          let foundLabel = labels.nodes[0];

          if (!foundLabel) {
            // Label doesn't exist in this team - try to create it
            try {
              const newLabel = await this.linear.createIssueLabel({
                name: labelName,
                teamId: teamId!,
              });
              if (newLabel.id) {
                labelIds.push(newLabel.id);
              }
            } catch (createError: any) {
              // Label exists at workspace level but can't be created in this team
              // This is a Linear limitation - labels are workspace-scoped
              // Just skip this label, issue will still be created
              continue;
            }
          } else {
            // Label found in this team - use it
            labelIds.push(foundLabel.id);
          }
        } catch (error) {
          // Skip problematic labels
          continue;
        }
      }

      // Create issue
      const createdIssue = await this.linear.createIssue({
        teamId: teamId!,
        projectId: project.id,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        labelIds,
      });

      createdIssues[idx] = createdIssue.id;
      console.log(`✅ Created: ${issue.title}`);
    }

    // Create blocking relationships
    for (let idx = 0; idx < issues.length; idx++) {
      const issue = issues[idx];
      if (issue.blockedBy && issue.blockedBy.length > 0) {
        for (const blockerIdx of issue.blockedBy) {
          const blockerIssueId = createdIssues[blockerIdx];
          const currentIssueId = createdIssues[idx];

          if (blockerIssueId && currentIssueId) {
            try {
              await this.linear.createIssueRelation({
                issueId: currentIssueId,
                relatedIssueId: blockerIssueId,
                type: "blocks",
              });
            } catch (error) {
              // Ignore relation errors
            }
          }
        }
      }
    }

    console.log(`\n✅ Created ${issues.length} issues with dependencies\n`);
  }

  private async createPages(): Promise<void> {
    console.log("📄 Creating pages...\n");

    const srcDir = path.join(this.projectPath, "src");
    const appDir = path.join(srcDir, "app");

    // Login page
    const loginPage = `"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Sign in to ${this.config.appName}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Development Mode</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setEmail("test@example.com");
              setPassword("password");
              setTimeout(() => {
                const form = document.querySelector("form");
                if (form) form.requestSubmit();
              }, 100);
            }}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            🚀 Quick Login (test@example.com)
          </button>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{" "}
            <a href="/signup" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium">
              Sign up
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
`;

    const loginDir = path.join(appDir, "login");
    fs.mkdirSync(loginDir, { recursive: true });
    fs.writeFileSync(path.join(loginDir, "page.tsx"), loginPage);

    console.log("✅ Login page created");

    // Signup page
    const signupPage = `"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }

      router.push("/login?registered=true");
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl">
        <h2 className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Create your account
        </h2>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full name"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Email address"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Password"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <input
              type="password"
              required
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Confirm password"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>
      </div>
    </div>
  );
}
`;

    const signupDir = path.join(appDir, "signup");
    fs.mkdirSync(signupDir, { recursive: true });
    fs.writeFileSync(path.join(signupDir, "page.tsx"), signupPage);

    console.log("✅ Signup page created");

    // Dashboard page
    const dashboardPage = `import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Get some stats
  const userCount = await prisma.user.count();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">${this.config.appName}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-gray-300">{session.user.email}</span>
            <a
              href="/profile"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Profile
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome back, {session.user.name || session.user.email}!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Here's what's happening with your application.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Users</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{userCount}</p>
              </div>
              <div className="text-blue-600 dark:text-blue-400">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Your Role</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2 capitalize">
                  {session.user.role || "User"}
                </p>
              </div>
              <div className="text-green-600 dark:text-green-400">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">Active</p>
              </div>
              <div className="text-purple-600 dark:text-purple-400">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a href="/profile" className="p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-center">
              <span className="block text-sm font-medium text-gray-900 dark:text-white">Profile Settings</span>
            </a>
            <a href="/api/auth/signout" className="p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-center">
              <span className="block text-sm font-medium text-gray-900 dark:text-white">Sign Out</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
`;

    const dashboardDir = path.join(appDir, "dashboard");
    fs.mkdirSync(dashboardDir, { recursive: true });
    fs.writeFileSync(path.join(dashboardDir, "page.tsx"), dashboardPage);

    console.log("✅ Dashboard page created");

    // Profile page with theme switcher
    const profilePage = `"use client";

import { useSession, signOut } from "next-auth/react";
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { theme, setTheme, themes } = useTheme();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center dark:bg-gray-900 dark:text-white">Loading...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">${this.config.appName}</h1>
          <a
            href="/dashboard"
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
          >
            Dashboard
          </a>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Profile Settings</h2>

        {/* User Info */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6 mb-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Account Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input
                type="text"
                value={session.user?.name || ""}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={session.user?.email || ""}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Theme Switcher */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6 mb-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Theme Settings</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choose your preferred color theme for the application
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {themes.map((t) => (
              <button
                key={t.name}
                onClick={() => setTheme(t.name)}
                className={\`relative p-6 rounded-xl border-2 transition-all \${
                  theme === t.name
                    ? "border-blue-500 dark:border-blue-400 shadow-lg"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }\`}
                style={{
                  background: t.preview.bg,
                }}
              >
                <div className="text-center">
                  <div className="text-sm font-semibold mb-2" style={{ color: t.preview.text }}>
                    {t.label}
                  </div>
                  <div className="flex gap-2 justify-center">
                    <div className="w-4 h-4 rounded-full" style={{ background: t.preview.primary }} />
                    <div className="w-4 h-4 rounded-full" style={{ background: t.preview.secondary }} />
                    <div className="w-4 h-4 rounded-full" style={{ background: t.preview.accent }} />
                  </div>
                </div>
                {theme === t.name && (
                  <div className="absolute top-2 right-2">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-300">
              💡 <strong>Current theme:</strong> {themes.find(t => t.name === theme)?.label}
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-400 mt-1">
              Theme preference is saved locally and will persist across sessions.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Account Actions</h3>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}
`;

    const profileDir = path.join(appDir, "profile");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, "page.tsx"), profilePage);

    console.log("✅ Profile page with theme switcher created");

    // Update home page (page.tsx) to redirect to dashboard or login
    const homePage = `import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
`;

    fs.writeFileSync(path.join(appDir, "page.tsx"), homePage);

    console.log("✅ Home page (auto-redirect) created");
    console.log("✅ All pages created\n");
  }

  private async createApiRoutes(): Promise<void> {
    console.log("🔌 Creating API routes...\n");

    const appDir = path.join(this.projectPath, "src", "app");

    // NextAuth API route
    const authRoute = `import { handlers } from "@/auth";
export const { GET, POST } = handlers;
`;

    const authApiDir = path.join(appDir, "api", "auth", "[...nextauth]");
    fs.mkdirSync(authApiDir, { recursive: true });
    fs.writeFileSync(path.join(authApiDir, "route.ts"), authRoute);

    console.log("✅ NextAuth API route created");

    // Signup API route
    const signupRoute = `import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
`;

    const signupApiDir = path.join(appDir, "api", "auth", "signup");
    fs.mkdirSync(signupApiDir, { recursive: true });
    fs.writeFileSync(path.join(signupApiDir, "route.ts"), signupRoute);

    console.log("✅ Signup API route created");
    console.log("✅ All API routes created\n");
  }

  private async createThemeSystem(): Promise<void> {
    console.log("🎨 Creating theme system with multiple themes...\n");

    const srcDir = path.join(this.projectPath, "src");

    // Theme context with 8 beautiful themes
    const themeContext = `"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface ThemePreview {
  bg: string;
  text: string;
  primary: string;
  secondary: string;
  accent: string;
}

export interface Theme {
  name: string;
  label: string;
  preview: ThemePreview;
  cssVars: Record<string, string>;
}

export const themes: Theme[] = [
  {
    name: "light",
    label: "Light (Default)",
    preview: {
      bg: "#ffffff",
      text: "#111827",
      primary: "#3b82f6",
      secondary: "#8b5cf6",
      accent: "#10b981",
    },
    cssVars: {
      "--bg-primary": "255 255 255",
      "--bg-secondary": "249 250 251",
      "--text-primary": "17 24 39",
      "--text-secondary": "107 114 128",
      "--color-primary": "59 130 246",
      "--color-secondary": "139 92 246",
      "--color-accent": "16 185 129",
    },
  },
  {
    name: "dark",
    label: "Dark",
    preview: {
      bg: "#111827",
      text: "#f9fafb",
      primary: "#60a5fa",
      secondary: "#a78bfa",
      accent: "#34d399",
    },
    cssVars: {
      "--bg-primary": "17 24 39",
      "--bg-secondary": "31 41 55",
      "--text-primary": "249 250 251",
      "--text-secondary": "156 163 175",
      "--color-primary": "96 165 250",
      "--color-secondary": "167 139 250",
      "--color-accent": "52 211 153",
    },
  },
  {
    name: "ocean",
    label: "Ocean Blue",
    preview: {
      bg: "#0c4a6e",
      text: "#f0f9ff",
      primary: "#38bdf8",
      secondary: "#0ea5e9",
      accent: "#06b6d4",
    },
    cssVars: {
      "--bg-primary": "12 74 110",
      "--bg-secondary": "7 89 133",
      "--text-primary": "240 249 255",
      "--text-secondary": "186 230 253",
      "--color-primary": "56 189 248",
      "--color-secondary": "14 165 233",
      "--color-accent": "6 182 212",
    },
  },
  {
    name: "forest",
    label: "Forest Green",
    preview: {
      bg: "#14532d",
      text: "#f0fdf4",
      primary: "#22c55e",
      secondary: "#16a34a",
      accent: "#84cc16",
    },
    cssVars: {
      "--bg-primary": "20 83 45",
      "--bg-secondary": "21 128 61",
      "--text-primary": "240 253 244",
      "--text-secondary": "187 247 208",
      "--color-primary": "34 197 94",
      "--color-secondary": "22 163 74",
      "--color-accent": "132 204 22",
    },
  },
  {
    name: "sunset",
    label: "Sunset",
    preview: {
      bg: "#7c2d12",
      text: "#fff7ed",
      primary: "#f97316",
      secondary: "#ea580c",
      accent: "#fb923c",
    },
    cssVars: {
      "--bg-primary": "124 45 18",
      "--bg-secondary": "154 52 18",
      "--text-primary": "255 247 237",
      "--text-secondary": "254 215 170",
      "--color-primary": "249 115 22",
      "--color-secondary": "234 88 12",
      "--color-accent": "251 146 60",
    },
  },
  {
    name: "purple",
    label: "Royal Purple",
    preview: {
      bg: "#581c87",
      text: "#faf5ff",
      primary: "#a855f7",
      secondary: "#9333ea",
      accent: "#c084fc",
    },
    cssVars: {
      "--bg-primary": "88 28 135",
      "--bg-secondary": "107 33 168",
      "--text-primary": "250 245 255",
      "--text-secondary": "233 213 255",
      "--color-primary": "168 85 247",
      "--color-secondary": "147 51 234",
      "--color-accent": "192 132 252",
    },
  },
  {
    name: "rose",
    label: "Rose Garden",
    preview: {
      bg: "#881337",
      text: "#fff1f2",
      primary: "#fb7185",
      secondary: "#f43f5e",
      accent: "#fda4af",
    },
    cssVars: {
      "--bg-primary": "136 19 55",
      "--bg-secondary": "159 18 57",
      "--text-primary": "255 241 242",
      "--text-secondary": "254 205 211",
      "--color-primary": "251 113 133",
      "--color-secondary": "244 63 94",
      "--color-accent": "253 164 175",
    },
  },
  {
    name: "slate",
    label: "Slate Gray",
    preview: {
      bg: "#1e293b",
      text: "#f1f5f9",
      primary: "#64748b",
      secondary: "#475569",
      accent: "#94a3b8",
    },
    cssVars: {
      "--bg-primary": "30 41 59",
      "--bg-secondary": "51 65 85",
      "--text-primary": "241 245 249",
      "--text-secondary": "203 213 225",
      "--color-primary": "100 116 139",
      "--color-secondary": "71 85 105",
      "--color-accent": "148 163 184",
    },
  },
];

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  themes,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app-theme") || "light";
    }
    return "light";
  });

  useEffect(() => {
    // Apply theme on mount and when it changes
    applyTheme(theme);
  }, [theme]);

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme);
    localStorage.setItem("app-theme", newTheme);
  };

  const applyTheme = (themeName: string) => {
    const themeConfig = themes.find((t) => t.name === themeName);
    if (!themeConfig) return;

    const root = document.documentElement;
    
    // Apply CSS variables
    Object.entries(themeConfig.cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Set dark mode class (for all themes except light)
    if (themeName !== "light") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    
    // Also set data attribute for debugging
    root.setAttribute("data-theme", themeName);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
`;

    const contextsDir = path.join(srcDir, "contexts");
    fs.mkdirSync(contextsDir, { recursive: true });
    fs.writeFileSync(path.join(contextsDir, "ThemeContext.tsx"), themeContext);

    console.log("✅ Theme system created with 8 themes:");
    console.log("   • Light (Default)");
    console.log("   • Dark");
    console.log("   • Ocean Blue");
    console.log("   • Forest Green");
    console.log("   • Sunset");
    console.log("   • Royal Purple");
    console.log("   • Rose Garden");
    console.log("   • Slate Gray\n");

    // Create Providers component (client component wrapper)
    const providersComponent = `"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/contexts/ThemeContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
`;

    const componentsDir = path.join(srcDir, "components");
    fs.mkdirSync(componentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(componentsDir, "Providers.tsx"),
      providersComponent,
    );

    console.log("✅ Providers component created");

    // Update layout.tsx to use Providers and add theme script
    const layoutPath = path.join(srcDir, "app", "layout.tsx");
    let layoutContent = fs.readFileSync(layoutPath, "utf8");

    // Add import at the top
    if (!layoutContent.includes("Providers")) {
      layoutContent =
        `import { Providers } from "@/components/Providers";\nimport Script from "next/script";\n` +
        layoutContent;
    }

    // Add theme initialization script to head (before body)
    const themeScript = `      <Script id="theme-init" strategy="beforeInteractive">
        {\`
          (function() {
            const theme = localStorage.getItem('app-theme') || 'light';
            if (theme !== 'light') {
              document.documentElement.classList.add('dark');
            }
            document.documentElement.setAttribute('data-theme', theme);
          })();
        \`}
      </Script>`;

    // Insert script before closing head tag if not already there
    if (!layoutContent.includes("theme-init")) {
      layoutContent = layoutContent.replace(
        /(<\/head>)/,
        `${themeScript}\n    $1`,
      );
    }

    // Wrap children with Providers
    layoutContent = layoutContent.replace(
      /(<body[^>]*>)\s*{children}\s*(<\/body>)/s,
      `$1
        <Providers>{children}</Providers>
      $2`,
    );

    fs.writeFileSync(layoutPath, layoutContent);

    console.log("✅ Layout updated with Providers and theme script\n");
  }

  private async generateDocumentation(): Promise<void> {
    const readme = `# ${this.config.appName}

${this.config.description}

## Tech Stack

- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **Database:** Prisma + SQLite (production: PostgreSQL)
- **Auth:** NextAuth.js
- **Styling:** TailwindCSS v4
- **Deployment:** Laravel Forge (Node.js site)

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Setup database
npx prisma db push

# Start development server
npm run dev

# Open http://localhost:3000
\`\`\`

## Deployment to Laravel Forge

1. **Create GitHub repository:**
\`\`\`bash
git remote add origin https://github.com/glenn-frank/${this.config.appName}.git
git push -u origin main
\`\`\`

2. **On Laravel Forge:**
- Create new site (Node.js)
- Repository: glenn-frank/${this.config.appName}
- Build command: \`npm install && npm run build\`
- Start command: \`npm start\`
- Port: 3000

3. **Environment variables (Forge):**
\`\`\`bash
DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="https://your-domain.com"
\`\`\`

## AI Agent Integration (Cursor)

This project includes dependency management rules in \`.cursorrules\`.

### Connect to Linear MCP Server:

\`\`\`bash
# Start MCP server
cd ~/Documents/apps/linearadmin
npm run mcp:server
\`\`\`

Configure Cursor (Settings → MCP), then reload window.

### Available Commands:

\`\`\`
"Create an issue for this bug"
"What can I work on next?"
"Check if issue #123 has blockers"
"Add Backend label to issue #456"
\`\`\`

The AI agent will:
- ✅ Check blockers before starting work
- ✅ Search for duplicates before creating
- ✅ Create issues with proper dependencies
- ✅ Auto-add repo label: glenn-frank/[team-name]

## Default Credentials

Email: \`test@example.com\`
Password: \`password\`

## Project Structure

\`\`\`
${this.config.appName}/
├── src/
│   ├── app/
│   │   ├── api/         # API routes
│   │   ├── login/       # Auth pages
│   │   ├── dashboard/   # Protected pages
│   │   └── page.tsx     # Home
│   └── components/      # React components
├── prisma/
│   └── schema.prisma    # Database schema
├── lib/
│   └── prisma.ts        # Prisma client
├── .cursorrules         # AI agent rules
└── auth.ts              # NextAuth config
\`\`\`

## Development

\`\`\`bash
npm run dev      # Start dev server
npm run build    # Build for production
npm start        # Start production server
npx prisma studio # Database GUI
\`\`\`

---

**Built with AI-first architecture - optimized for Cursor agents!** 🤖
`;

    fs.writeFileSync(path.join(this.projectPath, "README.md"), readme);
    console.log("📚 Documentation generated\n");
  }
}

async function main() {
  const linear = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY,
  });

  const creator = new NextJsAppCreator(linear);
  await creator.createApp();
}

main();
