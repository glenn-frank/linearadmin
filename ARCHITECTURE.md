# Laravel App Creator - Architecture Guide

## 📐 System Architecture

### High-Level Overview

The Laravel App Creator follows a **modular, layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│              LaravelForgeAppCreator (Orchestrator)       │
│  - Coordinates all modules                               │
│  - Manages overall flow                                  │
│  - Handles rollback on failure                           │
└──────────────────────┬──────────────────────────────────┘
                       │
       ┌───────────────┼───────────────────────┐
       │               │                       │
┌──────▼──────┐ ┌─────▼──────┐ ┌─────────────▼──────────┐
│Configuration│ │   Setup    │ │    Integration         │
│   Layer     │ │   Layer    │ │      Layer             │
│             │ │            │ │                        │
│ - Config    │ │ - Laravel  │ │ - Linear              │
│   Manager   │ │   Setup    │ │   Integration         │
│ - Validation│ │ - React    │ │ - GitHub              │
│ - Templates │ │   Setup    │ │   Publisher           │
│             │ │ - Database │ │ - Forge               │
│             │ │   Manager  │ │   Deployment          │
└─────────────┘ └────────────┘ └───────────────────────┘
       │               │                       │
       └───────────────┼───────────────────────┘
                       │
               ┌───────▼────────┐
               │  Utilities     │
               │                │
               │ - Logger       │
               │ - Template     │
               │   Loader       │
               │ - Code         │
               │   Modifier     │
               │ - Progress     │
               │   Tracker      │
               │ - Dry-Run      │
               │   Handler      │
               └────────────────┘
```

---

## 🗂️ Module Breakdown

### Core Modules (`src/modules/`)

#### 1. ConfigurationManager

**Purpose:** Collect and validate user configuration

**Responsibilities:**

- Interactive prompts with inquirer
- Input validation
- Preference persistence
- Smart defaults

**Key Methods:**

- `getConfiguration()` - Main entry point
- `loadPreferences()` - Load saved settings
- `savePreferences()` - Persist settings

**Dependencies:** Logger, Zod validation

---

#### 2. LaravelSetup

**Purpose:** Initialize Laravel backend

**Responsibilities:**

- Composer project creation
- Package installation
- Controller/model generation
- Migration setup
- Route configuration

**Key Methods:**

- `initializeLaravelBackend()` - Main entry
- `createLaravelControllers()` - Generate controllers
- `setupForgeStorage()` - Configure storage

**Dependencies:** TemplateLoader, Logger

---

#### 3. ReactSetup

**Purpose:** Configure React frontend

**Responsibilities:**

- Create React App initialization
- npm package installation
- TailwindCSS configuration
- Vite build tool setup
- Component structure

**Key Methods:**

- `setupReactFrontend()` - Main entry
- `configureBuildTools()` - Vite config
- `configureTailwindCSS()` - CSS setup

**Dependencies:** TemplateLoader, Logger

---

#### 4. DatabaseManager

**Purpose:** Handle database configuration

**Responsibilities:**

- Environment file generation
- Migration execution
- Multi-environment support
- App key generation

**Key Methods:**

- `setupDatabase()` - Main entry
- `createEnvironmentFiles()` - Generate .env files
- `buildDeploymentScript()` - Create deploy.sh

**Dependencies:** Logger

---

#### 5. GitHubPublisher

**Purpose:** Manage Git operations

**Responsibilities:**

- Git repository initialization
- GitHub remote configuration
- Repository publishing
- URL parsing

**Key Methods:**

- `publishToGitHub()` - Publish to remote
- `initializeGit()` - Local git setup
- `extractRepoPath()` - Parse URLs

**Dependencies:** Logger

---

#### 6. LinearIntegration

**Purpose:** Handle Linear project management

**Responsibilities:**

- Team creation/selection
- Project creation
- Issue generation
- Dependency detection (AI + rules)
- Cursor agent assignment

**Key Methods:**

- `createLinearProject()` - Main entry
- `createIssues()` - Issue creation
- `detectDependenciesWithAI()` - AI analysis

**Dependencies:** LinearClient, Logger

---

#### 7. ForgeDeployment

**Purpose:** Create Laravel Forge sites

**Responsibilities:**

- Server selection
- Site creation
- SSL certificate setup
- Automatic deployment

**Key Methods:**

- `createForgeSite()` - Main entry
- `enableSSL()` - Configure SSL
- `deploySite()` - Trigger deployment

**Dependencies:** Logger, axios

---

#### 8. GitProviderFactory

**Purpose:** Multi-platform git support

**Responsibilities:**

- Provider detection
- URL parsing for different platforms
- Remote URL generation

**Supported Providers:**

- GitHub
- GitLab
- Bitbucket
- Custom (extensible)

**Key Methods:**

- `getProvider()` - Auto-detect provider
- `isSupported()` - Check URL validity
- `registerProvider()` - Add custom provider

---

#### 9. ProjectUpdater

**Purpose:** Update existing projects

**Responsibilities:**

- Feature addition
- Dependency updates
- Migration running
- Backup creation

**Key Methods:**

- `updateProject()` - Main entry
- `addFeatures()` - Add new features
- `createBackup()` - Backup before update

---

### Utilities (`src/utils/`)

#### Logger

- Multi-level logging
- Context management
- Stack trace capture
- File + console output

#### TemplateLoader

- Load template files
- Variable replacement
- Bulk operations

#### CodeModifier

- AST-based code modification
- Safe code generation
- Import management
- JSON file editing

#### ProgressTracker

- Visual progress bars
- ETA calculation
- Task tracking
- Summary reports

#### DryRunHandler

- Action recording
- Preview mode
- User confirmation
- Export to JSON

#### ConfigTemplateManager

- Template loading
- Template application
- Custom template creation

---

### Schemas (`src/schemas/`)

#### ConfigValidation

- Zod schemas for all config
- Runtime validation
- Type guards
- Default values

---

## 🔄 Data Flow

### Application Creation Flow

```
1. User runs: npm run create-laravel-app
          ↓
2. LaravelForgeAppCreator.createApp()
          ↓
3. testLinearConnection()
          ↓
4. ConfigurationManager.getConfiguration()
   - Shows interactive prompts
   - Validates with Zod
   - Saves preferences
          ↓
5. Create project directory
   - Track in rollbackState
          ↓
6. LaravelSetup.initializeLaravelBackend()
   - composer create-project
   - Install packages
   - Generate controllers/models
          ↓
7. ReactSetup.setupReactFrontend()
   - create-react-app
   - Install packages
   - Configure TailwindCSS
          ↓
8. DatabaseManager.setupDatabase()
   - Generate .env files
   - Run migrations
          ↓
9. GitHubPublisher.publishToGitHub()
   - git init
   - Add remote
   - Push to GitHub
          ↓
10. LinearIntegration.createLinearProject()
    - Create team/project
    - Generate issues
    - Assign to agent
          ↓
11. Generate documentation
          ↓
12. ForgeDeployment.createForgeSite() (optional)
    - Create site
    - Enable SSL
    - Deploy
          ↓
13. Finalize and report success
```

### Error Handling Flow

```
Any step fails
     ↓
Error caught in try-catch
     ↓
Logger.error() - Log with full context
     ↓
rollback() method called
     ↓
Remove project directory
     ↓
Delete Linear issues/labels
     ↓
Archive Linear project
     ↓
Report rollback complete
     ↓
Throw error to halt execution
```

---

## 🧪 Testing Strategy

### Unit Tests

Each module has isolated unit tests testing its core functionality without dependencies.

**Example:**

```typescript
// Test ConfigurationManager without Linear
describe("ConfigurationManager", () => {
  it("should validate app names correctly", () => {
    expect(isValidAppName("my-app")).toBe(true);
  });
});
```

### Integration Tests

Test multiple modules working together.

**Example:**

```typescript
describe("Laravel + React Setup", () => {
  it("should create both backend and frontend", async () => {
    const laravel = new LaravelSetup(...);
    const react = new ReactSetup(...);

    await laravel.initializeLaravelBackend();
    await react.setupReactFrontend();

    expect(fs.existsSync("backend")).toBe(true);
    expect(fs.existsSync("frontend")).toBe(true);
  });
});
```

---

## 🔌 Extension Points

### Adding a New Module

```typescript
// 1. Create module file
// src/modules/MyNewModule.ts

import { Logger } from "../utils/logger";
import { LaravelForgeAppConfig } from "./ConfigurationManager";

export class MyNewModule {
  constructor(private config: LaravelForgeAppConfig, private logger: Logger) {}

  async execute(): Promise<void> {
    this.logger.info("Executing MyNewModule");
    // Implementation
  }
}

// 2. Import in main class
import { MyNewModule } from "./modules/MyNewModule";

// 3. Use in createApp()
const myModule = new MyNewModule(this.config, this.logger);
await myModule.execute();
```

### Adding a New Git Provider

```typescript
import { GitProvider } from "./modules/GitProviderFactory";

class MyGitProvider implements GitProvider {
  name = "MyGit";

  extractRepoInfo(url: string) {
    // Implementation
  }

  // ... other methods
}

// Register
factory.registerProvider(new MyGitProvider());
```

### Adding a New Configuration Template

```json
// src/config-templates/my-template.json
{
  "name": "My Template",
  "description": "Custom template description",
  "template": {
    "deploymentTarget": "both",
    "features": ["auth", "custom-feature"],
    ...
  },
  "customIssues": [...]
}
```

---

## 🛠️ Development Workflow

### Making Changes

1. **Identify the module** responsible for the functionality
2. **Write tests first** (TDD approach)
3. **Implement the change** in the module
4. **Run tests** to verify
5. **Update documentation** if needed
6. **Commit with descriptive message**

### Adding Features

1. **Create new module** if it's a major feature
2. **Add to existing module** if it's minor
3. **Update configuration** if user-facing
4. **Add templates** if generating code
5. **Write tests** for the feature
6. **Document** in JSDoc and guides

---

## 📖 Best Practices

### Module Design

- **Single Responsibility** - One purpose per module
- **Dependency Injection** - Pass dependencies via constructor
- **Clear Interfaces** - Well-defined public APIs
- **Error Handling** - Always use try-catch with logging

### Testing

- **Test in Isolation** - Mock external dependencies
- **Test Edge Cases** - Invalid inputs, errors, edge conditions
- **Test Happy Path** - Ensure normal flow works
- **Test Integration** - Verify modules work together

### Logging

- **Use Appropriate Levels** - DEBUG/INFO/WARN/ERROR
- **Include Context** - Add relevant data
- **Log Operations** - Use logOperation for important tasks
- **Don't Over-Log** - Avoid spam

### Error Handling

- **Specific Errors** - Throw meaningful error messages
- **Context Logging** - Log errors with full context
- **Graceful Degradation** - Continue when possible
- **User Feedback** - Clear error messages for users

---

## 🎓 FAQs

### Q: How do I add a new feature?

A: Create a method in the appropriate module or create a new module if it's substantial.

### Q: How do I modify generated code?

A: Use the CodeModifier utility with AST instead of regex.

### Q: How do I add support for a new git provider?

A: Implement GitProvider interface and register with GitProviderFactory.

### Q: How do I create a custom configuration template?

A: Create a JSON file in `src/config-templates/` following the schema.

### Q: Where are logs stored?

A: `~/.laravel-forge-creator.log` (configurable in Logger constructor)

### Q: How do I run only specific tests?

A: `npm test -- --testPathPattern=logger` (or any file name)

---

## 📞 Support

For questions or issues:

1. Check this ARCHITECTURE.md
2. Review FINAL_COMPLETION_REPORT.md
3. Read module JSDoc comments
4. Check test files for usage examples
5. Review log file for debugging

---

**Version:** 2.0.0 (Refactored)  
**Last Updated:** October 22, 2025  
**Status:** ✅ Production-Ready

