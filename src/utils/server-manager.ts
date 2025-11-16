import { execSync, spawn, ChildProcess } from "child_process";
import { Logger } from "./logger";

/**
 * Manages server processes and port management
 */
export class ServerManager {
  private logger: Logger;
  private processes: ChildProcess[] = [];

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Check if a port is in use
   */
  isPortInUse(port: number): boolean {
    try {
      // Use lsof to check if port is in use (macOS/Linux)
      execSync(`lsof -i :${port}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kill process on a specific port
   */
  killPort(port: number): void {
    try {
      this.logger.info(`Killing process on port ${port}`);
      console.log(`🔄 Killing process on port ${port}...`);

      // Use lsof to find and kill the process
      execSync(`lsof -ti :${port} | xargs kill -9`, { stdio: "pipe" });

      this.logger.info(`Successfully killed process on port ${port}`);
      console.log(`✅ Port ${port} freed`);
    } catch (error) {
      this.logger.debug(`No process found on port ${port} or already killed`);
    }
  }

  /**
   * Ensure port is available, killing existing process if needed
   */
  ensurePortAvailable(port: number): void {
    if (this.isPortInUse(port)) {
      console.log(`⚠️  Port ${port} is in use`);
      this.killPort(port);
      // Wait a moment for port to be released
      execSync("sleep 1");
    } else {
      console.log(`✅ Port ${port} is available`);
    }
  }

  /**
   * Start Laravel backend server
   */
  startLaravelServer(projectPath: string, port: number = 8000): ChildProcess {
    this.logger.info("Starting Laravel server", { port, projectPath });
    console.log(`🚀 Starting Laravel backend on port ${port}...`);

    this.ensurePortAvailable(port);

    const serverProcess = spawn("php", ["artisan", "serve", `--port=${port}`], {
      cwd: projectPath,
      stdio: "inherit",
      detached: false,
    });

    this.processes.push(serverProcess);

    serverProcess.on("error", (error) => {
      this.logger.error("Laravel server error", error);
      console.error(`❌ Laravel server error: ${error.message}`);
    });

    console.log(`✅ Laravel backend started at http://localhost:${port}`);
    return serverProcess;
  }

  /**
   * Start Vite dev server
   */
  startViteServer(projectPath: string, port: number = 5173): ChildProcess {
    this.logger.info("Starting Vite dev server", { port, projectPath });
    console.log(`🚀 Starting React frontend on port ${port}...`);

    this.ensurePortAvailable(port);

    const serverProcess = spawn("npm", ["run", "dev"], {
      cwd: projectPath,
      stdio: "inherit",
      detached: false,
      env: { ...process.env, PORT: port.toString() },
    });

    this.processes.push(serverProcess);

    serverProcess.on("error", (error) => {
      this.logger.error("Vite server error", error);
      console.error(`❌ Vite server error: ${error.message}`);
    });

    console.log(`✅ React frontend started at http://localhost:${port}`);
    return serverProcess;
  }

  /**
   * Stop all managed servers
   */
  stopAllServers(): void {
    this.logger.info("Stopping all servers");
    console.log("\n🛑 Stopping servers...");

    this.processes.forEach((serverProcess) => {
      try {
        serverProcess.kill();
      } catch (error) {
        this.logger.debug("Error killing process", error as Error);
      }
    });

    this.processes = [];
    console.log("✅ All servers stopped");
  }

  /**
   * Setup signal handlers to cleanup on exit
   */
  setupCleanupHandlers(): void {
    const cleanup = () => {
      this.stopAllServers();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", () => this.stopAllServers());
  }
}
