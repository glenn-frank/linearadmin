# Linear Admin - Usage Guide

## 🎯 When to Use CLI vs MCP

This guide helps you understand **when to use the CLI tools** (for setup/admin) vs **when to use the MCP server** (for development workflow).

---

## 🔧 CLI Tools: Setup & Administration

Use CLI commands for **one-time setup, bulk operations, and administrative tasks**.

### **Setup & Project Creation**

#### Create a New Full-Stack App

```bash
npm run create-laravel-app
```

**When to use:** Starting a new project with Linear integration

**What it does:**

- Creates Laravel + React + TypeScript app
- Sets up database and migrations
- Creates Linear team and project
- Generates initial development issues
- Pushes to GitHub
- (Optional) Deploys to Laravel Forge

---

### **Team Management**

#### Duplicate a Team

```bash
npm run duplicate
```

**When to use:** Cloning team structure for new project or backup

**What it does:**

- Interactive team selection
- Duplicates labels, projects, and issues
- Preserves relationships

#### Backup a Team

```bash
npm run backup-team
```

**When to use:** Before major changes or for disaster recovery

**What it does:**

- Creates timestamped JSON backup
- Includes all labels, projects, issues
- Saves to local file

---

### **Requirements Processing**

#### Parse Requirements Document

```bash
npm run requirements
```

**When to use:** Starting new feature from PRD or spec document

**What it does:**

- Reads .md or .txt requirements
- Uses AI to break down into issues
- Creates parent/child relationships
- Generates comprehensive descriptions

---

### **Bulk Operations**

#### AI-Powered Relabeling

```bash
# Preview what labels would be added
npm run relabel

# Apply labels to all issues
npm run relabel:all

# Clean slate: remove all labels and re-label
npm run relabel:clean
```

**When to use:** Cleanup, reorganization, or initial labeling

**What it does:**

- Uses AI to suggest relevant labels
- Fuzzy matches existing labels
- Auto-creates new labels
- Preview before applying

#### Update Label Colors

```bash
npm run update-colors
```

**When to use:** One-time label color setup

#### Reorganize by Versions

```bash
npm run reorganize-versions
```

**When to use:** Organizing issues into V1, V1.1, V2 projects

---

### **Analysis & Discovery**

#### Find Orphan Issues

```bash
npm run find-orphans
```

**When to use:** Discovering unorganized issues

**What it does:**

- Lists issues without projects
- Groups by labels
- Suggests organization

#### Process Feedback Video

```bash
npm run video
```

**When to use:** Converting client feedback into actionable issues

**What it does:**

- Uploads to AssemblyAI
- Transcribes with timestamps
- Extracts issues with AI
- Links to video moments

---

## 🤖 MCP Server: Development Workflow

Use the MCP server for **real-time issue management while coding in Cursor**.

### **Start the MCP Server**

```bash
npm run mcp:server
```

The server will run and wait for connections from Cursor/Claude.

---

### **Configure Cursor**

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "linear-admin": {
      "command": "node",
      "args": [
        "/Users/glennrenda/Documents/apps/linearadmin/node_modules/.bin/tsx",
        "/Users/glennrenda/Documents/apps/linearadmin/src/mcp-server.ts"
      ],
      "env": {
        "LINEAR_API_KEY": "your-key-here",
        "OPENAI_API_KEY": "your-key-here",
        "LINEAR_TEAM_ID": "your-default-team-id"
      }
    }
  }
}
```

---

## 🚀 MCP Tools Available (17 Total)

### **1. Issue Creation**

#### `create_linear_issue`

**Use in Cursor:** "Create a Linear issue for this bug"

```
Cursor finds bug → Creates issue automatically
```

#### `create_bulk_issues`

**Use in Cursor:** "Create issues for all the TODOs in this file"

```
Cursor scans TODOs → Creates multiple issues
```

#### `parse_requirements_to_issues`

**Use in Cursor:** "Parse these requirements and create issues"

```
Paste requirements → AI generates structured issues
```

---

### **2. Issue Discovery**

#### `get_team_issues`

**Use in Cursor:** "What issues do we have in this team?"

```
Lists all issues with details
```

#### `search_issues`

**Use in Cursor:** "Find all authentication-related issues"

```
Searches by keyword, label, state
```

#### `get_issue_by_id`

**Use in Cursor:** "Get details for issue #123"

```
Shows full issue information
```

#### `find_orphan_issues`

**Use in Cursor:** "Find issues without projects"

```
Discovers unorganized issues
```

---

### **3. Issue Updates**

#### `update_issue`

**Use in Cursor:** "Update issue #123 to high priority"

```
Modifies title, description, priority, state, etc.
```

#### `add_issue_comment`

**Use in Cursor:** "Add a comment to issue #123 about the fix"

```
Adds timestamped comments
```

#### `close_issue`

**Use in Cursor:** "Mark issue #123 as completed"

```
Moves to completed/canceled state
```

---

### **4. Labeling & Organization**

#### `add_labels_to_issue`

**Use in Cursor:** "Add 'Backend' and 'Security' labels to issue #123"

```
Adds labels (creates if doesn't exist)
```

#### `get_team_labels`

**Use in Cursor:** "What labels are available?"

```
Lists all team labels
```

---

### **5. Assignment & Relationships**

#### `assign_issue`

**Use in Cursor:** "Assign issue #123 to me"

```
Assigns to team member
```

#### `link_issues`

**Use in Cursor:** "Issue #123 blocks issue #124"

```
Creates relationships (blocks, relates, duplicate)
```

---

### **6. Project Management**

#### `get_team_projects`

**Use in Cursor:** "List all projects in this team"

```
Shows projects with details
```

#### `create_project`

**Use in Cursor:** "Create a new project called 'Authentication System'"

```
Creates new project in team
```

#### `list_linear_teams`

**Use in Cursor:** "What Linear teams do I have access to?"

```
Lists all available teams
```

---

## 💡 Real-World Workflows

### **Workflow 1: Starting a New Project**

**Step 1: Use CLI for Setup**

```bash
cd ~/Documents/apps/linearadmin
npm run create-laravel-app
```

Prompts will ask for:

- App name
- Team (create new or use existing)
- Features to include
- Deployment target

**Result:** New app with Linear team, project, and baseline issues

---

**Step 2: Open in Cursor**

```bash
cd ~/path/to/new-app
cursor .
```

**Step 3: Use MCP for Development**

```
You: "Review the AuthController and create issues for any problems"

Cursor:
- Analyzes code
- Finds 3 issues
- Creates them via MCP
✅ Created issues #101, #102, #103
```

---

### **Workflow 2: Processing Client Feedback**

**Step 1: Video Processing (CLI)**

```bash
npm run video
# Drag & drop client feedback video
```

**Result:** 10 issues created from video feedback

---

**Step 2: Development (MCP)**

```
You: "Show me all issues labeled 'Bug'"

Cursor:
[Searches via MCP]
Found 5 bug issues:
- #101: Login button not working
- #102: Dashboard shows wrong data
...

You: "I just fixed #101. Add a comment and close it"

Cursor:
[Adds comment via MCP]
[Closes issue via MCP]
✅ Issue #101 completed
```

---

### **Workflow 3: Feature Planning**

**Step 1: Requirements (CLI)**

```bash
npm run requirements
# Upload feature-spec.md
```

**Result:** Parent issues + sub-issues with full details

---

**Step 2: Organize (MCP)**

```
You: "Create a new project called 'User Management v2'"

Cursor:
[Creates project via MCP]
✅ Project created

You: "Move issues #50-#60 to this project"

Cursor:
[Updates each issue via MCP]
✅ Moved 11 issues to User Management v2
```

---

### **Workflow 4: Code Review & Cleanup**

**Cursor automatically:**

```
While reviewing code:
- Finds TODO comments → Offers to create issues
- Spots security problems → Creates issues
- Detects technical debt → Suggests issues
- Sees orphan issues → Offers to organize
```

**Example:**

```typescript
// TODO: Add rate limiting to this endpoint
async login(req: Request) {
  // ...
}
```

```
Cursor: "Found TODO comment. Create Linear issue?"
You: "Yes"
Cursor: [Creates issue #125 via MCP]
✅ Created: Add rate limiting to login endpoint
```

---

## 📊 Quick Reference

### **Use CLI When:**

- ✅ Starting a new project
- ✅ Processing bulk requirements
- ✅ Duplicating teams
- ✅ Backing up data
- ✅ Reorganizing projects
- ✅ Processing videos
- ✅ Bulk relabeling
- ✅ One-time setup tasks

### **Use MCP When:**

- ✅ Coding in Cursor
- ✅ Finding bugs
- ✅ Creating issues on the fly
- ✅ Searching existing issues
- ✅ Updating issue details
- ✅ Adding comments
- ✅ Organizing issues
- ✅ Checking what's already tracked
- ✅ Closing completed work

---

## 🎯 Best Practices

### **CLI Best Practices:**

1. **Always backup before major operations**
   ```bash
   npm run backup-team
   ```
2. **Use requirements parser for new features**
   ```bash
   npm run requirements
   ```
3. **Preview before bulk changes**
   ```bash
   npm run relabel  # Preview first
   npm run relabel:all  # Then apply
   ```

### **MCP Best Practices:**

1. **Let Cursor discover issues** - Just describe the problem
2. **Use natural language** - "Create an issue for this bug"
3. **Search before creating** - Avoid duplicates
4. **Add context in comments** - Document decisions
5. **Close issues when done** - Keep Linear clean

---

## 🔧 Environment Setup

### **Required Environment Variables:**

```bash
# .env file
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=ac80f3bc-...  # Optional default team
OPENAI_API_KEY=sk-...        # For AI features
ASSEMBLYAI_API_KEY=...       # For video processing
GITHUB_TOKEN=ghp_...         # For GitHub integration
FORGE_API_KEY=...            # For Laravel Forge
```

---

## 📚 Additional Resources

- **FUNCTIONS_INVENTORY.md** - Complete list of all 20+ functions
- **ARCHITECTURE.md** - System architecture details
- **mcp-config.json** - Example MCP configuration
- **package.json** - All available npm scripts

---

## 🆘 Troubleshooting

### **MCP Server Issues:**

**Server won't start:**

```bash
# Check if already running
ps aux | grep mcp-server

# Kill existing process
kill <PID>

# Restart
npm run mcp:server
```

**Cursor can't connect:**

1. Verify MCP config in Cursor settings
2. Check environment variables
3. Restart Cursor: Cmd+Shift+P → "Developer: Reload Window"

**Tools not working:**

1. Check LINEAR_API_KEY is set
2. Verify team ID is correct
3. Look at server logs in terminal

### **CLI Issues:**

**Command not found:**

```bash
npm install  # Install dependencies
```

**Linear API errors:**

```bash
# Verify API key
echo $LINEAR_API_KEY

# Test connection
npm run list-projects
```

---

## ✅ Quick Start Checklist

- [ ] Install dependencies: `npm install`
- [ ] Set up `.env` with API keys
- [ ] Test CLI: `npm run list-projects`
- [ ] Start MCP server: `npm run mcp:server`
- [ ] Configure Cursor with MCP settings
- [ ] Test in Cursor: "List my Linear teams"
- [ ] Create first issue: "Create an issue for testing MCP"

**You're ready to go!** 🚀

---

**Version:** 2.0
**Last Updated:** 2025
**Status:** Production Ready
