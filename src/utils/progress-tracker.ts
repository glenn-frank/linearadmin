import { Logger } from "./logger";

/**
 * Task progress information
 */
export interface TaskProgress {
  /** Task name/description */
  name: string;
  /** Current progress (0-100) */
  progress: number;
  /** Status of the task */
  status: "pending" | "in_progress" | "completed" | "failed";
  /** Optional error if task failed */
  error?: Error;
  /** Start time */
  startTime?: Date;
  /** End time */
  endTime?: Date;
}

/**
 * Progress tracker for long-running operations
 *
 * Provides visual feedback and time estimates for multi-step processes.
 *
 * @example
 * ```typescript
 * const tracker = new ProgressTracker(logger);
 * tracker.addTask("setup", "Setup Environment");
 * tracker.addTask("backend", "Initialize Backend");
 *
 * tracker.startTask("setup");
 * // ... do work ...
 * tracker.completeTask("setup");
 *
 * console.log(tracker.getOverallProgress()); // 50%
 * ```
 */
export class ProgressTracker {
  private tasks: Map<string, TaskProgress>;
  private logger: Logger;
  private totalTasks: number = 0;
  private startTime: Date;

  constructor(logger: Logger) {
    this.tasks = new Map();
    this.logger = logger;
    this.startTime = new Date();
  }

  /**
   * Add a task to track
   *
   * @param id - Unique task identifier
   * @param name - Human-readable task name
   */
  addTask(id: string, name: string): void {
    this.tasks.set(id, {
      name,
      progress: 0,
      status: "pending",
    });
    this.totalTasks++;
    this.logger.debug("Task added to progress tracker", { id, name });
  }

  /**
   * Add multiple tasks at once
   *
   * @param tasks - Array of {id, name} objects
   */
  addTasks(tasks: Array<{ id: string; name: string }>): void {
    tasks.forEach((task) => this.addTask(task.id, task.name));
  }

  /**
   * Start a task
   *
   * @param id - Task identifier
   */
  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      this.logger.warn("Attempted to start unknown task", undefined, { id });
      return;
    }

    task.status = "in_progress";
    task.startTime = new Date();
    task.progress = 0;

    this.logger.info(`Started task: ${task.name}`, { id });
    this.printProgress();
  }

  /**
   * Update task progress
   *
   * @param id - Task identifier
   * @param progress - Progress percentage (0-100)
   */
  updateTaskProgress(id: string, progress: number): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.progress = Math.min(100, Math.max(0, progress));

    if (progress % 25 === 0 || progress === 100) {
      this.printProgress();
    }
  }

  /**
   * Complete a task successfully
   *
   * @param id - Task identifier
   */
  completeTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      this.logger.warn("Attempted to complete unknown task", undefined, { id });
      return;
    }

    task.status = "completed";
    task.progress = 100;
    task.endTime = new Date();

    this.logger.info(`Completed task: ${task.name}`, {
      id,
      duration:
        task.endTime.getTime() - (task.startTime?.getTime() || Date.now()),
    });
    this.printProgress();
  }

  /**
   * Mark a task as failed
   *
   * @param id - Task identifier
   * @param error - Error that caused failure
   */
  failTask(id: string, error: Error): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = "failed";
    task.error = error;
    task.endTime = new Date();

    this.logger.error(`Task failed: ${task.name}`, error, { id });
    this.printProgress();
  }

  /**
   * Get overall progress percentage
   *
   * @returns Overall progress (0-100)
   */
  getOverallProgress(): number {
    if (this.tasks.size === 0) return 0;

    const totalProgress = Array.from(this.tasks.values()).reduce(
      (sum, task) => sum + task.progress,
      0
    );

    return Math.round(totalProgress / this.tasks.size);
  }

  /**
   * Get estimated time remaining
   *
   * Based on average time per task and remaining tasks
   *
   * @returns Estimated minutes remaining, or null if cannot estimate
   */
  getEstimatedTimeRemaining(): number | null {
    const completedTasks = Array.from(this.tasks.values()).filter(
      (task) => task.status === "completed"
    );

    if (completedTasks.length === 0) return null;

    // Calculate average time per completed task
    const totalTime = completedTasks.reduce((sum, task) => {
      if (!task.startTime || !task.endTime) return sum;
      return sum + (task.endTime.getTime() - task.startTime.getTime());
    }, 0);

    const avgTimePerTask = totalTime / completedTasks.length;

    // Count remaining tasks
    const remainingTasks = Array.from(this.tasks.values()).filter(
      (task) => task.status === "pending" || task.status === "in_progress"
    ).length;

    // Estimate in minutes
    return Math.round((avgTimePerTask * remainingTasks) / 60000);
  }

  /**
   * Print progress to console
   */
  private printProgress(): void {
    const overall = this.getOverallProgress();
    const completed = Array.from(this.tasks.values()).filter(
      (t) => t.status === "completed"
    ).length;
    const failed = Array.from(this.tasks.values()).filter(
      (t) => t.status === "failed"
    ).length;

    const bar = this.generateProgressBar(overall);
    const eta = this.getEstimatedTimeRemaining();

    console.log("");
    console.log(`📊 Progress: ${bar} ${overall}%`);
    console.log(
      `   Tasks: ${completed}/${this.totalTasks} completed${
        failed > 0 ? `, ${failed} failed` : ""
      }`
    );

    if (eta !== null && eta > 0) {
      console.log(`   ETA: ~${eta} minute${eta !== 1 ? "s" : ""} remaining`);
    }

    // Show current task
    const currentTask = Array.from(this.tasks.values()).find(
      (t) => t.status === "in_progress"
    );
    if (currentTask) {
      console.log(`   Current: ${currentTask.name} (${currentTask.progress}%)`);
    }

    console.log("");
  }

  /**
   * Generate ASCII progress bar
   *
   * @param progress - Progress percentage (0-100)
   * @param width - Width of progress bar (default: 20)
   * @returns String representation of progress bar
   */
  private generateProgressBar(progress: number, width: number = 20): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;

    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
  }

  /**
   * Get summary of all tasks
   *
   * @returns Object with task statistics
   */
  getSummary(): {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    pending: number;
    overallProgress: number;
    totalDuration: number;
  } {
    const tasks = Array.from(this.tasks.values());

    return {
      total: this.totalTasks,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      pending: tasks.filter((t) => t.status === "pending").length,
      overallProgress: this.getOverallProgress(),
      totalDuration: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Print final summary
   */
  printSummary(): void {
    const summary = this.getSummary();
    const durationMinutes = Math.round(summary.totalDuration / 60000);

    console.log("\n" + "=".repeat(50));
    console.log("📊 Final Summary");
    console.log("=".repeat(50));
    console.log(`✅ Completed: ${summary.completed}/${summary.total} tasks`);

    if (summary.failed > 0) {
      console.log(`❌ Failed: ${summary.failed} tasks`);
    }

    console.log(
      `⏱️  Total time: ${durationMinutes} minute${
        durationMinutes !== 1 ? "s" : ""
      }`
    );
    console.log(`📈 Overall progress: ${summary.overallProgress}%`);
    console.log("=".repeat(50) + "\n");
  }
}

