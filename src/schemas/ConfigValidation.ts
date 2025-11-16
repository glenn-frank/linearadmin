import { z } from "zod";

/**
 * Zod schema for validating Laravel app configuration
 */
export const LaravelAppConfigSchema = z.object({
  appName: z
    .string()
    .min(1, "App name is required")
    .regex(
      /^[a-z0-9-]+$/,
      "App name must contain only lowercase letters, numbers, and hyphens",
    )
    .max(50, "App name must be 50 characters or less"),

  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(500, "Description must be 500 characters or less"),

  projectDirectory: z
    .string()
    .min(1, "Project directory is required")
    .refine(
      (val) => !val.includes(".."),
      "Project directory cannot contain parent directory references",
    ),

  githubRepo: z
    .string()
    .optional()
    .refine(
      (val) =>
        !val ||
        val === "" ||
        val.includes("github.com") ||
        val.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/),
      "Must be a valid GitHub repository URL or owner/repo format",
    ),

  teamOption: z.enum(["new", "existing"], {
    errorMap: () => ({ message: "Invalid team option" }),
  }),

  newTeamName: z
    .string()
    .min(2, "Team name must be at least 2 characters")
    .max(100, "Team name must be 100 characters or less")
    .optional(),

  teamId: z.string().uuid("Invalid team ID format").optional(),

  createNewProject: z.boolean(),

  existingProjectId: z.string().uuid("Invalid project ID format").optional(),

  deploymentTarget: z.enum(["local", "forge", "both"], {
    errorMap: () => ({ message: "Invalid deployment target" }),
  }),

  localDatabaseType: z.enum(["mysql", "postgresql", "sqlite"], {
    errorMap: () => ({ message: "Invalid local database type" }),
  }),

  databaseType: z
    .enum(
      ["mysql", "postgresql", "sqlite", "forge-mysql", "forge-postgresql"],
      {
        errorMap: () => ({ message: "Invalid database type" }),
      },
    )
    .optional(),

  forgeDatabaseName: z
    .string()
    .regex(
      /^[a-z0-9_]+$/,
      "Database name must contain only lowercase letters, numbers, and underscores",
    )
    .max(64, "Database name must be 64 characters or less")
    .optional(),

  useForgeStorage: z.boolean().default(false),

  forgeStorageBucket: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      "Bucket name must contain only lowercase letters, numbers, and hyphens",
    )
    .min(3, "Bucket name must be at least 3 characters")
    .max(63, "Bucket name must be 63 characters or less")
    .optional(),

  repoSubfolder: z
    .string()
    .max(100, "Subfolder path must be 100 characters or less")
    .optional(),

  features: z
    .array(z.enum(["auth", "profile", "dashboard", "upload", "email", "docs"]))
    .min(1, "At least one feature must be selected")
    .max(10, "Too many features selected"),

  enableAIDependencies: z.boolean().default(true),

  customDependencyRules: z.array(z.string()).optional(),

  startDevelopment: z.boolean().default(false),

  rerunExistingIssues: z.boolean().default(false),

  createForgeSite: z.boolean().default(false),

  forgeApiKey: z.string().optional(),

  backupFile: z.string().optional(),
});

/**
 * Input validation schema for user-provided strings
 */
export const UserInputSchema = z.object({
  // Generic string validation with XSS protection
  safeString: z
    .string()
    .trim()
    .max(1000)
    .refine(
      (val) => !val.includes("<script"),
      "Input cannot contain script tags",
    )
    .refine(
      (val) => !val.includes("javascript:"),
      "Input cannot contain javascript: protocol",
    ),

  // Path validation
  safePath: z
    .string()
    .trim()
    .refine(
      (val) => !val.includes(".."),
      "Path cannot contain parent references",
    )
    .refine(
      (val) => !val.startsWith("/etc"),
      "Path cannot reference system directories",
    )
    .refine(
      (val) => !val.startsWith("/var"),
      "Path cannot reference system directories",
    ),

  // URL validation
  githubUrl: z
    .string()
    .url("Must be a valid URL")
    .refine((val) => val.includes("github.com"), "Must be a GitHub URL"),

  // Email validation
  email: z.string().email("Must be a valid email address"),

  // Port validation
  port: z
    .number()
    .int("Port must be an integer")
    .min(1, "Port must be at least 1")
    .max(65535, "Port cannot exceed 65535"),
});

/**
 * Validation helper functions
 */
export class ConfigValidator {
  /**
   * Validate configuration object
   */
  static validateConfig(
    config: unknown,
  ): z.infer<typeof LaravelAppConfigSchema> {
    return LaravelAppConfigSchema.parse(config);
  }

  /**
   * Safely validate configuration without throwing
   */
  static safeValidateConfig(config: unknown): {
    success: boolean;
    data?: z.infer<typeof LaravelAppConfigSchema>;
    errors?: z.ZodError;
  } {
    const result = LaravelAppConfigSchema.safeParse(config);

    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, errors: result.error };
    }
  }

  /**
   * Get human-readable error messages from Zod errors
   */
  static formatErrors(errors: z.ZodError): string[] {
    return errors.errors.map((err) => {
      const path = err.path.join(".");
      return `${path}: ${err.message}`;
    });
  }

  /**
   * Validate and sanitize user input
   */
  static sanitizeInput(
    input: string,
    type: keyof typeof UserInputSchema.shape,
  ): string {
    const schema = UserInputSchema.shape[type];
    return schema.parse(input);
  }
}

/**
 * Runtime type guards
 */
export function isValidAppName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    /^[a-z0-9-]+$/.test(name) &&
    name.length <= 50
  );
}

export function isValidDatabaseName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    /^[a-z0-9_]+$/.test(name) &&
    name.length <= 64
  );
}

export function isValidBucketName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length >= 3 &&
    name.length <= 63 &&
    /^[a-z0-9-]+$/.test(name)
  );
}

/**
 * Configuration defaults
 */
export const CONFIG_DEFAULTS = {
  description: "A modern Laravel + React + TypeScript application",
  deploymentTarget: "both" as const,
  localDatabaseType: "postgresql" as const,
  databaseType: "forge-postgresql" as const,
  useForgeStorage: true,
  enableAIDependencies: true,
  startDevelopment: false,
  rerunExistingIssues: false,
  createForgeSite: false,
  createNewProject: true,
  repoSubfolder: "frontend",
  features: ["auth", "profile", "dashboard"] as const,
};
