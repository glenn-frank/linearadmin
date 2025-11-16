# Laravel App Creator - Prompts Audit

## 📋 ALL Current Prompts (In Order)

### **1. App Name** ✅ KEEP

```
"What is the name of your Laravel app?"
```

**Used for:** App directory, Linear project name, database name
**Worth keeping:** YES - Essential

---

### **2. Description** ✅ KEEP

```
"Describe your application:"
Default: "A modern Laravel + React + TypeScript application"
```

**Used for:** Linear project description, README
**Worth keeping:** YES - Helps document purpose

---

### **3. Project Directory** ✅ KEEP

```
"Where should the project be created?"
Default: ~/Documents/apps
```

**Used for:** Where files are created
**Worth keeping:** YES - Important for organization

---

### **4. AI Dependencies** ⚠️ SIMPLIFY

```
"Enable AI-powered dependency detection?"
Default: true
```

**Used for:** How dependencies are detected (AI vs rules)
**Worth keeping:** Maybe - Could just default to true always
**Recommendation:** Remove prompt, always use AI (fallback to rules if fails)

---

### **5. Custom Dependency Rules** ❌ REMOVE

```
"Enter custom dependency rules (optional, comma-separated):"
Only shows if AI dependencies = false
```

**Used for:** Manual dependency rules
**Worth keeping:** NO - Never used, complex
**Recommendation:** DELETE - AI handles this better

---

### **6. Team Option** ✅ KEEP (Simplify)

```
"Linear team option:"
- Create new team
- Select existing team
- Restore from backup
```

**Used for:** Linear team setup
**Worth keeping:** YES - But simplify to just "new" or "existing"
**Recommendation:** Remove "restore" option (rarely used)

---

### **7. New Team Name** ✅ KEEP

```
"What is the name of your new team?"
Only shows if creating new team
```

**Used for:** Team creation
**Worth keeping:** YES - Essential for new teams

---

### **8. Select Existing Team** ✅ KEEP

```
"Select Linear team:"
Shows list of teams
Only shows if using existing team
```

**Used for:** Team selection
**Worth keeping:** YES - Essential for existing teams

---

### **9. Backup File Selection** ❌ REMOVE

```
"Select backup file to restore:"
Only shows if restoring from backup
```

**Used for:** Team restore (rare use case)
**Worth keeping:** NO - Use separate CLI tool for this
**Recommendation:** DELETE - Use `npm run backup-team` instead

---

### **10. Create New Project** ✅ KEEP (Simplify)

```
"Create a new Linear project for this app?"
Default: true
```

**Used for:** Whether to create fresh project
**Worth keeping:** YES - But could default to true always
**Recommendation:** Remove prompt, always create new project

---

### **11. Select Existing Project** ⚠️ CONDITIONAL

```
"Select existing Linear project:"
Only shows if NOT creating new project
```

**Used for:** Reusing existing project
**Worth keeping:** Only if question #10 stays
**Recommendation:** DELETE with #10

---

### **12. Start Development** ✅ KEEP

```
"Start development and assign all issues to Cursor agent?"
Default: true
```

**Used for:** Auto-assign issues to Cursor agent
**Worth keeping:** YES - Automates workflow

---

### **13. Rerun Existing Issues** ⚠️ EDGE CASE

```
"Rerun existing issues that were started by agents?"
Only shows if startDevelopment = true
```

**Used for:** Reassign completed issues
**Worth keeping:** Edge case - Could remove
**Recommendation:** DELETE - Rarely needed

---

### **14. Create Forge Site** ✅ KEEP

```
"Create Laravel Forge site automatically?"
Default: true if FORGE_API_KEY exists
```

**Used for:** Auto-deploy to Forge
**Worth keeping:** YES - Useful for deployment

---

### **15. Deployment Target** ❌ REMOVE

```
"Deployment target:"
- Both local and Forge
- Local development only
- Laravel Forge only
```

**Used for:** Which env files to create
**Worth keeping:** NO - Always create both
**Recommendation:** DELETE - Always create both env files

---

### **16. Local Database Type** ✅ KEEP (Simplify)

```
"Local database type:"
- PostgreSQL
- MySQL
- SQLite
```

**Used for:** Local dev database
**Worth keeping:** YES
**Recommendation:** Default to SQLite (easiest)

---

### **17. Forge Database Type** ⚠️ CONDITIONAL

```
"Forge database type:"
- PostgreSQL
- MySQL
Only shows if deployment includes Forge
```

**Used for:** Production database
**Worth keeping:** Only if using Forge
**Recommendation:** Keep but simplify

---

### **18. Forge Database Name** ⚠️ CONDITIONAL

```
"Forge database name:"
Default: appname_lowercase
Only shows if deployment includes Forge
```

**Used for:** Database name on Forge
**Worth keeping:** Only if using Forge
**Recommendation:** Auto-generate, don't ask

---

### **19. Use Forge Storage** ⚠️ CONDITIONAL

```
"Use Laravel Forge storage (S3-compatible)?"
Default: true
Only shows if deployment includes Forge
```

**Used for:** S3 storage config
**Worth keeping:** Only if using Forge
**Recommendation:** Default to true, don't ask

---

### **20. Forge Storage Bucket** ⚠️ CONDITIONAL

```
"Forge storage bucket name:"
Default: appname-storage
Only shows if using Forge storage
```

**Used for:** S3 bucket name
**Worth keeping:** Only if using Forge storage
**Recommendation:** Auto-generate, don't ask

---

### **21. Repo Subfolder** ❌ REMOVE

```
"Repository subfolder for frontend (optional):"
Default: "frontend"
```

**Used for:** Adding subfolder to repo label (unused now)
**Worth keeping:** NO - Not needed
**Recommendation:** DELETE - Not relevant anymore

---

### **22. Features** ✅ KEEP (Simplify)

```
"Select features to include:"
☑ Authentication
☑ Profile Management
☑ Dashboard
☑ File Upload
☑ Email Notifications
☑ API Documentation
```

**Used for:** What features to scaffold
**Worth keeping:** YES - But could simplify
**Recommendation:** Keep but default all to checked

---

### **23. Auto-Start Servers** ✅ KEEP

```
"Automatically install dependencies and start servers when done?"
Default: true
```

**Used for:** Run npm install & start servers
**Worth keeping:** YES - Saves time

---

## 📊 Summary: Keep vs Remove

### ✅ **KEEP (Essential - 8 prompts)**

1. App name
2. Description
3. Project directory
4. Team option (new vs existing)
5. New team name (if creating new)
6. Select team (if using existing)
7. Start development (assign to Cursor)
8. Auto-start servers

### ⚠️ **SIMPLIFY (Auto-defaults - 5 prompts)**

9. Local database → Default to SQLite
10. Features → Default all checked
11. Create Forge site → Only if FORGE_API_KEY exists
12. Forge database type → Default to PostgreSQL
13. AI dependencies → Always true

### ❌ **REMOVE (Unnecessary - 10 prompts)**

14. Custom dependency rules → Never used
15. Restore from backup → Use CLI tool
16. Select backup file → Use CLI tool
17. Create new project → Always true
18. Select existing project → Removed
19. Rerun existing issues → Edge case
20. Deployment target → Always create both
21. Forge database name → Auto-generate
22. Use Forge storage → Default true
23. Forge storage bucket → Auto-generate
24. Repo subfolder → Not needed

---

## 💡 **Recommended Minimal Flow**

### **Essential Questions Only:**

```
1. App name? → myapp
2. Description? → My awesome app
3. Where to create? → ~/Documents/apps
4. Team: New or Existing? → New
5. Team name? → MyApp Team
6. Assign to Cursor agent? → Yes
7. Auto-start servers? → Yes
```

**That's it! 7 questions instead of 23!**

---

## 🎯 **Auto-Configured:**

- ✅ Database: SQLite (local), PostgreSQL (Forge if used)
- ✅ Features: All included (auth, profile, dashboard, upload, email, docs)
- ✅ Dependencies: AI-powered (fallback to rules)
- ✅ Repo label: glenn-frank/[team-name]
- ✅ Environment files: Both local & production
- ✅ Forge setup: Only if FORGE_API_KEY exists
- ✅ Storage: S3 if Forge, local otherwise

---

## 🚀 **What Actually Works & Is Worth Keeping:**

### **Working Features:**

✅ **Laravel backend** - Auth, API, controllers, models
✅ **React frontend** - TypeScript, TailwindCSS, components
✅ **Linear integration** - Team, project, issues with dependencies
✅ **Auto repo labeling** - glenn-frank/[team-name]
✅ **Dependency management** - AI-powered or rules-based
✅ **.cursorrules included** - Agent behavior configured
✅ **Auto-start servers** - npm install & start automatically

### **Questionable Features:**

⚠️ **Forge deployment** - Works but adds complexity
⚠️ **Team restore** - Better as separate tool
⚠️ **Multiple database options** - SQLite is easiest
⚠️ **Feature selection** - Just include everything

### **Broken/Unused:**

❌ **Custom dependency rules** - Never used
❌ **Existing project selection** - Adds complexity
❌ **Rerun issues** - Edge case
❌ **Repo subfolder** - Not relevant

---

## 💡 **My Recommendation:**

### **Simplify to 7 Core Questions:**

```typescript
1. appName ✅
2. description ✅
3. projectDirectory ✅
4. teamOption (new/existing only) ✅
5. newTeamName (if new) ✅
6. teamId (if existing) ✅
7. autoStartServers ✅
```

### **Auto-Configure Everything Else:**

```typescript
{
  enableAIDependencies: true,  // Always AI
  features: ["auth", "profile", "dashboard", "upload", "email", "docs"], // All
  localDatabaseType: "sqlite",  // Easiest
  startDevelopment: true,  // Always assign to Cursor
  createNewProject: true,  // Always new project
  deploymentTarget: "both",  // Always create both env files
  useForgeStorage: !!process.env.FORGE_API_KEY,  // Auto-detect
  createForgeSite: false,  // Manual Forge deploy
  githubRepo: "",  // Empty - user creates after
}
```

---

## ✅ **Want me to simplify it to just 7 questions?**

This would make app creation MUCH faster while keeping all the working features!











