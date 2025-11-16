# Linear Admin - Complete Functions Inventory

## 📋 Overview

Complete list of all functions available in the Linear Admin toolkit, organized by category.

---

## 1️⃣ **Video & Audio Processing**

### `src/index.ts` - Video to Linear Issues

**What it does:**

- Uploads videos to AssemblyAI for transcription
- Transcribes audio with speaker labels, chapters, and highlights
- Uses AI (OpenAI) to extract actionable issues from transcript
- Creates Linear issues with:
  - Time-coded links to video moments
  - Transcript context
  - Auto-generated labels
  - Requirements and acceptance criteria
  - Technical notes

**Use Cases:**

- Client feedback videos → Linear issues
- Screen recording bug reports → tracked issues
- Meeting recordings → action items
- Demo feedback → feature requests

**Command:** `npm run video`

**Key Features:**

- Video compression for faster upload
- Real-time progress tracking
- Automatic label creation
- Time-stamped references
- Speaker identification

---

## 2️⃣ **Requirements Processing**

### `src/requirements-to-issues.ts` - Requirements to Issues

**What it does:**

- Parses requirements documents (.md, .txt files)
- Uses AI to break down requirements into structured issues
- Creates parent issues + sub-issues automatically
- Generates comprehensive issue descriptions with:
  - Requirements
  - Acceptance criteria
  - Technical notes
  - Auto-labels based on content

**Use Cases:**

- PRD → Linear issues
- Feature specs → development tasks
- Technical docs → implementation issues
- Client requirements → organized backlog

**Commands:**

- `npm run requirements` - Interactive mode
- `npm run requirements:env` - Use team from .env

**Key Features:**

- AI-powered issue breakdown
- Parent/child issue relationships
- Comprehensive detail generation
- Automatic categorization
- Smart labeling

---

## 3️⃣ **Codebase Analysis**

### `src/analysis.ts` - Codebase to Issues

**What it does:**

- Analyzes codebase structure
- Identifies technical debt
- Creates Linear issues for:
  - Missing documentation
  - Code quality improvements
  - Refactoring needs
  - Architecture improvements

**Use Cases:**

- Technical debt tracking
- Refactoring planning
- Code quality initiatives
- Architecture documentation

**Command:** `npm run analysis`

---

## 4️⃣ **Team Management**

### `src/team-management.ts` - Team Duplication

**What it does:**

- Duplicates entire Linear teams
- Two modes:
  1. **Skeleton**: Just structure (workflow states, templates)
  2. **Full**: Everything (labels, projects, issues with their labels)
- Preserves relationships and structure

**Use Cases:**

- Create new team from template
- Backup team before major changes
- Set up identical team for new project
- Clone team structure for new client

**Command:** `npm run duplicate`

**Key Features:**

- Full team cloning
- Label preservation
- Project structure copying
- Issue duplication with labels
- Orphan issue handling

---

## 5️⃣ **Team Backup & Restore**

### `src/backup-team.ts` - Team Backup

**What it does:**

- Creates complete JSON backup of team
- Backs up:
  - Labels
  - Projects
  - Issues (with all metadata)
  - Workflow states
  - Templates
- Saves to timestamped file

**Command:** `npm run backup-team`

---

## 6️⃣ **Issue Labeling**

### `src/relabel-issues.ts` - Intelligent Relabeling

**What it does:**

- Uses AI to suggest labels for issues
- Fuzzy matching to reuse existing labels
- Multiple modes:
  - **Preview** - See what labels would be added
  - **Add** - Add labels (keep existing)
  - **Clean** - Remove all labels and re-label
  - **Selective** - Choose specific issues

**Commands:**

- `npm run relabel` - Preview mode
- `npm run relabel:all` - Add labels to all issues
- `npm run relabel:clean` - Clean slate re-labeling
- `npm run relabel:env` - Use team from .env

**Key Features:**

- AI-powered label suggestion
- Prevents duplicate labels
- Smart categorization
- Batch processing
- Dry-run mode

### `src/update-label-colors.ts` - Update Label Colors

**What it does:**

- Updates all existing labels with distinct colors
- Color-coded by category (Bug=red, Feature=green, etc.)

**Command:** `npm run update-colors`

---

## 7️⃣ **Orphan Issue Management**

### `src/find-orphan-issues.ts` - Find Orphans

**What it does:**

- Finds all issues without project assignment
- Analyzes and groups by labels
- Suggests project assignments
- Shows priority and state

**Command:** `npm run find-orphans`

**Output:**

- List of orphan issues
- Label-based grouping
- Priority distribution
- Creation dates

### `src/assign-orphans-to-projects.ts` - Assign Orphans

**What it does:**

- Assigns orphan issues to projects
- Uses predefined mappings
- Batch assignment
- Reports success/failure

**Command:** `npm run assign-orphans`

---

## 8️⃣ **Project Management**

### `src/list-projects.ts` - List Projects

**What it does:**

- Lists all projects in a team
- Shows issue counts per project
- Displays project state

**Command:** `npm run list-projects`

### `src/reorganize-by-versions.ts` - Version Organization

**What it does:**

- Organizes issues by version labels (V1, V1.1, V2, etc.)
- Creates version-based projects
- Moves issues to appropriate projects
- Creates "Unassigned (to triage)" for unlabeled issues

**Command:** `npm run reorganize-versions`

### `src/reorganize-scheduleapp-versions.ts` - ScheduleApp Specific

**What it does:**

- Specialized version of above for ScheduleApp team
- Handles specific version structure

**Command:** `npm run reorganize-scheduleapp`

---

## 9️⃣ **Repository Management**

### `src/create-repo-labels.ts` - Create GitHub Labels

**What it does:**

- Mirrors Linear labels to GitHub repository
- Syncs colors and names
- Creates labels that don't exist

**Command:** `npm run create-repo-labels`

---

## 🔟 **Full Stack App Creator**

### `src/create-laravel-app.ts` + `src/laravel-forge-app-creator.ts`

**What it does:**

- Creates complete Laravel + React + TypeScript applications
- Sets up:
  - Laravel backend with authentication
  - React frontend with TypeScript
  - Database migrations
  - Linear project and issues
  - GitHub repository
  - Laravel Forge deployment (optional)
- Auto-creates development roadmap in Linear

**Command:** `npm run create-laravel-app`

**Key Features:**

- Full-stack scaffolding
- Automatic Linear integration
- Issue dependency detection (AI-powered)
- Deployment-ready code
- Rollback on failure

**Modules Used:**

- `ConfigurationManager.ts` - User prompts
- `LaravelSetup.ts` - Backend setup
- `ReactSetup.ts` - Frontend setup
- `DatabaseManager.ts` - DB configuration
- `GitHubPublisher.ts` - Git integration
- `LinearIntegration.ts` - Project/issue creation
- `ForgeDeployment.ts` - Deployment

---

## 1️⃣1️⃣ **ScheduleApp Specific Tools**

### `src/duplicate-scheduleapp-full.ts`

- Duplicates ScheduleApp team completely

### `src/setup-original-scheduleapp.ts`

- Sets up original ScheduleApp structure

### `src/setup-team-for-cursor.ts`

- Configures team specifically for Cursor agent work

### `src/backup-and-organize-scheduleapp.ts`

- Backs up and reorganizes ScheduleApp team

### `src/check-all-schedule-teams.ts`

- Analyzes all teams with "schedule" in name

**Commands:**

- `npm run duplicate-scheduleapp`
- `npm run setup-original`
- `npm run setup-for-cursor`
- `npm run organize-scheduleapp`
- `npm run check-all-schedule`

---

## 📊 **Summary by Category**

| Category               | Functions | Best For                                         |
| ---------------------- | --------- | ------------------------------------------------ |
| **Content Processing** | 3         | Video feedback, requirements docs, code analysis |
| **Team Management**    | 2         | Team setup, duplication, backup                  |
| **Issue Organization** | 5         | Labeling, orphan management, project assignment  |
| **Project Management** | 3         | Project listing, version organization            |
| **Integration**        | 2         | GitHub labels, full-stack app creation           |
| **ScheduleApp Tools**  | 5         | Specialized ScheduleApp management               |

**Total Functions: 20+**

---

## 🎯 **MCP Server Status**

### **✅ Currently Implemented (17 Tools)**

#### **Issue Management (8 tools)**

1. ✅ **create_linear_issue** - Create single issue
2. ✅ **create_bulk_issues** - Create multiple issues
3. ✅ **parse_requirements_to_issues** - AI-powered requirement parsing
4. ✅ **get_issue_by_id** - Get specific issue details
5. ✅ **update_issue** - Modify existing issue
6. ✅ **close_issue** - Complete or cancel issue
7. ✅ **search_issues** - Find issues by keyword/label/state
8. ✅ **add_issue_comment** - Add comments to issues

#### **Label Management (2 tools)**

9. ✅ **get_team_labels** - List all labels
10. ✅ **add_labels_to_issue** - Add labels to issue

#### **Project Management (3 tools)**

11. ✅ **get_team_projects** - List projects
12. ✅ **create_project** - Create new project
13. ✅ **find_orphan_issues** - Find unassigned issues

#### **Team & Organization (2 tools)**

14. ✅ **list_linear_teams** - List all teams
15. ✅ **assign_issue** - Assign to team member

#### **Relationships (2 tools)**

16. ✅ **link_issues** - Create issue relationships
17. ✅ **get_team_issues** - Get all team issues

### **📋 CLI-Only Tools** (Keep as administrative)

These remain as CLI commands for setup/admin tasks:

- **duplicate_team** - Clone entire team (admin)
- **backup_team** - Create team backup (admin)
- **relabel_issues** - Bulk AI-powered relabeling (cleanup)
- **video_to_issues** - Video feedback processing (specialized)
- **analyze_codebase** - Code analysis (specialized)
- **create_laravel_app** - Full stack app creator (setup)
- **sync_github_labels** - Mirror labels to GitHub (integration)
- **organize_by_versions** - Auto-organize by version (admin)

---

## 💡 **Implementation Complete!**

**✅ Phase 1: Core Tools (DONE)**

- 17 MCP tools implemented
- Covers all essential development workflows
- Fully functional with Cursor/Claude

**🚀 Ready to Use:**

1. Start MCP server: `npm run mcp:server`
2. Configure Cursor (see USAGE_GUIDE.md)
3. Start creating issues while coding!

**📖 For detailed workflow examples, see:**

- **USAGE_GUIDE.md** - Complete CLI vs MCP workflows
- **mcp-config.json** - Cursor configuration example

---

## 🎯 **Workflow Architecture**

```
CLI Tools (linearadmin)          MCP Server (Cursor)
────────────────────────         ───────────────────
• Project setup                  • Create issues on the fly
• Bulk operations                • Search & filter issues
• Team management                • Update & comment
• Requirements parsing           • Label & organize
• Video processing               • Close completed work
• Backups                        • Link relationships
                                • Assign to team
```

**Perfect separation of concerns!** 🎉
