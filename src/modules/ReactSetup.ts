import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { Logger } from "../utils/logger";
import { LaravelForgeAppConfig } from "./ConfigurationManager";
import { TemplateLoader } from "../utils/template-loader";

/**
 * Handles React frontend setup and configuration
 */
export class ReactSetup {
  private logger: Logger;
  private projectPath: string;
  private config: LaravelForgeAppConfig;
  private templateLoader: TemplateLoader;

  constructor(
    projectPath: string,
    config: LaravelForgeAppConfig,
    logger: Logger,
    templateLoader: TemplateLoader,
  ) {
    this.projectPath = projectPath;
    this.config = config;
    this.logger = logger;
    this.templateLoader = templateLoader;
  }

  /**
   * Setup React frontend
   */
  async setupReactFrontend(): Promise<void> {
    this.logger.info("Setting up React frontend");
    console.log("⚛️ Setting up React frontend...");

    // Create React app with TypeScript
    execSync("npx create-react-app frontend --template typescript", {
      stdio: "inherit",
      cwd: this.projectPath,
    });

    // Remove Create React App's git repository (we'll create a monorepo at root level)
    const frontendGitPath = path.join(this.projectPath, "frontend", ".git");
    if (fs.existsSync(frontendGitPath)) {
      fs.rmSync(frontendGitPath, { recursive: true, force: true });
      this.logger.info("Removed React's git repository for monorepo setup");
      console.log("   ✅ Removed frontend .git (preparing for monorepo)");
    }

    // Install additional packages
    const packages = [
      "react-router-dom",
      "@tanstack/react-query",
      "axios",
      "zod",
      "react-hook-form",
      "@hookform/resolvers",
      "@types/react-router-dom",
    ];

    this.logger.info("Installing React packages", { packages });
    execSync(`cd frontend && npm install ${packages.join(" ")}`, {
      stdio: "inherit",
      cwd: this.projectPath,
    });

    // Install TailwindCSS v3 and dependencies
    console.log("📦 Installing TailwindCSS v3...");
    execSync(
      `cd frontend && npm install --save-dev tailwindcss@^3 postcss@^8 autoprefixer@^10 --legacy-peer-deps`,
      {
        stdio: "inherit",
        cwd: this.projectPath,
      },
    );

    // Install Vite and React plugin as dev dependencies
    console.log("📦 Installing Vite and React plugin...");
    execSync(
      `cd frontend && npm install --save-dev vite @vitejs/plugin-react --legacy-peer-deps`,
      {
        stdio: "inherit",
        cwd: this.projectPath,
      },
    );

    // Setup project structure
    await this.createReactStructure();

    // Configure TailwindCSS
    await this.configureTailwindCSS();

    // Create components
    await this.createReactComponents();

    this.logger.info("React frontend setup complete");
  }

  /**
   * Configure build tools (Vite)
   */
  async configureBuildTools(): Promise<void> {
    this.logger.info("Configuring build tools");
    console.log("🔨 Configuring build tools...");

    // Create Vite config
    const viteConfig = this.templateLoader.loadTemplate(
      "config/vite.config.ts.template",
    );
    fs.writeFileSync(
      path.join(this.projectPath, "frontend", "vite.config.ts"),
      viteConfig,
    );

    // Update package.json scripts
    const packageJsonPath = path.join(
      this.projectPath,
      "frontend",
      "package.json",
    );
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    packageJson.scripts = {
      ...packageJson.scripts,
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview",
    };

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    this.logger.info("Build tools configured");
  }

  /**
   * Create React project structure
   */
  private async createReactStructure(): Promise<void> {
    this.logger.info("Creating React project structure");
    const srcDir = path.join(this.projectPath, "frontend", "src");

    // Create directory structure
    const directories = [
      "components/layouts",
      "components/common",
      "components/Notification",
      "pages/Dashboard",
      "pages/Profile",
      "pages/SignIn",
      "pages/SignUp",
      "hooks",
      "services",
      "schemas",
      "types",
      "constants",
    ];

    directories.forEach((dir) => {
      fs.mkdirSync(path.join(srcDir, dir), { recursive: true });
    });

    this.logger.info("React project structure created");
  }

  /**
   * Configure TailwindCSS
   */
  private async configureTailwindCSS(): Promise<void> {
    this.logger.info("Configuring TailwindCSS");
    const frontendDir = path.join(this.projectPath, "frontend");

    // Create tailwind.config.js
    const tailwindConfig = this.templateLoader.loadTemplate(
      "config/tailwind.config.js.template",
    );
    fs.writeFileSync(
      path.join(frontendDir, "tailwind.config.js"),
      tailwindConfig,
    );

    // Create postcss.config.js
    const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`;

    fs.writeFileSync(
      path.join(frontendDir, "postcss.config.js"),
      postcssConfig,
    );

    // Update src/index.css
    const indexCss = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Inter', sans-serif;
  }
}

@layer components {
  .btn-primary {
    @apply bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200;
  }
  
  .btn-secondary {
    @apply bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200;
  }
  
  .input-field {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent;
  }
}`;

    fs.writeFileSync(path.join(frontendDir, "src", "index.css"), indexCss);
    this.logger.info("TailwindCSS configured");
  }

  /**
   * Create React components
   */
  private async createReactComponents(): Promise<void> {
    this.logger.info("Creating React components");
    const srcDir = path.join(this.projectPath, "frontend", "src");

    // Create contexts directory
    const contextsDir = path.join(srcDir, "contexts");
    if (!fs.existsSync(contextsDir)) {
      fs.mkdirSync(contextsDir, { recursive: true });
    }

    // Create AuthContext
    const authContext = this.templateLoader.loadTemplate(
      "react/AuthContext.tsx.template",
    );
    fs.writeFileSync(path.join(contextsDir, "AuthContext.tsx"), authContext);

    // Create API client service
    const apiService = this.templateLoader.loadTemplate(
      "react/api.ts.template",
    );
    fs.writeFileSync(path.join(srcDir, "services", "api.ts"), apiService);

    // Create Layout component
    const layoutComponent = this.templateLoader.loadTemplate(
      "react/Layout.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "components", "layouts", "Layout.tsx"),
      layoutComponent,
    );

    // Create Header component
    const headerComponent = this.templateLoader.loadTemplate(
      "react/Header.tsx.template",
      { appName: this.config.appName },
    );
    fs.writeFileSync(
      path.join(srcDir, "components", "layouts", "Header.tsx"),
      headerComponent,
    );

    // Create Footer component
    const footerComponent = this.templateLoader.loadTemplate(
      "react/Footer.tsx.template",
      { appName: this.config.appName },
    );
    fs.writeFileSync(
      path.join(srcDir, "components", "layouts", "Footer.tsx"),
      footerComponent,
    );

    // Create ProtectedRoute component
    const protectedRoute = this.templateLoader.loadTemplate(
      "react/ProtectedRoute.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "components", "common", "ProtectedRoute.tsx"),
      protectedRoute,
    );

    // Create page components
    const signInPage = this.templateLoader.loadTemplate(
      "react/SignIn.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "pages", "SignIn", "SignIn.tsx"),
      signInPage,
    );

    const signUpPage = this.templateLoader.loadTemplate(
      "react/SignUp.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "pages", "SignUp", "SignUp.tsx"),
      signUpPage,
    );

    const dashboardPage = this.templateLoader.loadTemplate(
      "react/Dashboard.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "pages", "Dashboard", "Dashboard.tsx"),
      dashboardPage,
    );

    const profilePage = this.templateLoader.loadTemplate(
      "react/Profile.tsx.template",
    );
    fs.writeFileSync(
      path.join(srcDir, "pages", "Profile", "Profile.tsx"),
      profilePage,
    );

    // Create App.tsx
    const appComponent = this.templateLoader.loadTemplate(
      "react/App.tsx.template",
    );
    fs.writeFileSync(path.join(srcDir, "App.tsx"), appComponent);

    // Create index.tsx
    const indexFile = this.templateLoader.loadTemplate(
      "react/index.tsx.template",
    );
    fs.writeFileSync(path.join(srcDir, "index.tsx"), indexFile);

    // Create index.html (Vite entry point) in frontend root
    const indexHtml = this.templateLoader.loadTemplate(
      "react/index.html.template",
      { appName: this.config.appName },
    );
    fs.writeFileSync(
      path.join(this.projectPath, "frontend", "index.html"),
      indexHtml,
    );

    this.logger.info("React components created - fully functional app!");
    console.log("✅ Created complete React application with:");
    console.log("   - Authentication system");
    console.log("   - Sign In/Sign Up pages");
    console.log("   - Dashboard with stats");
    console.log("   - Profile with photo upload");
    console.log("   - Protected routes");
    console.log("   - API client configured");
  }
}
