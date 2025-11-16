# GitHub MCP Server - Complete PR Automation Guide

## 🎯 **The Problem This Solves**

**Before:**

```
Cursor creates 10 draft PRs →
You manually review each one →
You manually check if tests passed →
You manually approve each →
You manually merge each →
You manually delete branches →
😫 Takes 30+ minutes
```

**After:**

```
"Show me all draft PRs with their status"
→ See which ones are ready
"Approve and merge all PRs that passed CI"
→ Done in seconds!
😎 Automated!
```

---

## 🚀 **Quick Start**

### **1. Get GitHub Token**

```
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes:
   ✅ repo (full control)
   ✅ workflow
   ✅ admin:org (if using orgs)
4. Copy token
```

### **2. Add to Cursor MCP Config**

```json
{
  "mcpServers": {
    "github-admin": {
      "command": "node",
      "args": [
        "/Users/glennrenda/Documents/apps/linearadmin/node_modules/.bin/tsx",
        "/Users/glennrenda/Documents/apps/linearadmin/src/mcp-github-server.ts"
      ],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

### **3. Start MCP Server**

```bash
npm run mcp:github
```

### **4. Reload Cursor**

```
Cmd+Shift+P → "Developer: Reload Window"
```

---

## 🎯 **Draft PR Automation Workflow**

### **Scenario: Cursor Created 10 Draft PRs**

#### **Step 1: See What Needs Review**

```
"Show me all draft PRs in glenn-frank/myapp"
```

**Response:**

```
Found 10 draft PRs:
- #45: Add authentication
- #46: Create dashboard
- #47: Fix bug in login
... etc
```

---

#### **Step 2: Batch Review with CI Status**

```
"Give me a batch review of all draft PRs with their CI status"
```

**Response:**

```
Summary:
- Total drafts: 10
- Ready to merge: 7 (CI passed ✅)
- Needs fixes: 2 (CI failed ❌)
- In progress: 1 (CI running ⏳)

Ready to merge:
✅ PR #45: Add authentication (all checks passed)
✅ PR #46: Create dashboard (all checks passed)
✅ PR #48: Update profile page (all checks passed)
...

Needs attention:
❌ PR #47: Fix login bug (tests failed)
❌ PR #50: Add email feature (linting failed)

Quick action: Can approve and merge 7 PRs now!
```

---

#### **Step 3: Review Individual PR**

```
"Show me details for PR #45"
```

**Response:**

```
PR #45: Add authentication
- Status: Draft
- Author: cursor-bot
- Branch: feature/auth
- Files changed: 5
  • src/auth.ts (+120, -0)
  • src/login.tsx (+85, -0)
  ...
- CI Status: ✅ All checks passed
- Mergeable: Yes
- Ready to merge: Yes

Recommendation: ✅ Ready to approve and merge
```

---

#### **Step 4: Approve PRs**

**Individual:**

```
"Approve PR #45 with comment: Looks good!"
```

**Batch (if you trust Cursor):**

```
"Approve all draft PRs that passed CI"
```

---

#### **Step 5: Mark as Ready**

```
"Mark PR #45 as ready for review"
```

**Or batch:**

```
"Mark all approved PRs as ready for review"
```

---

#### **Step 6: Merge**

**Individual:**

```
"Merge PR #45 using squash"
```

**Batch:**

```
"Merge all approved PRs that passed CI"
```

---

#### **Step 7: Cleanup**

```
"Delete the feature/auth branch"
```

---

## 🤖 **Complete Automated Workflow**

```
"Review all draft PRs, approve those that passed CI, mark them ready, and merge them"

Agent does:
1. Lists all draft PRs
2. Checks CI status for each
3. Filters to those that passed
4. Approves each one
5. Marks as ready
6. Merges with squash
7. Reports results

You: ☕ Get coffee while it works
```

---

## 📋 **All 17 GitHub MCP Tools**

### **Repository Management (2)**

1. `list_repos` - List your repositories
2. `create_repo` - Create new repository

### **Pull Request Management (6)**

3. `list_draft_prs` - List DRAFT PRs (key tool!)
4. `list_all_prs` - List all PRs
5. `get_pr_details` - Get PR details + files + CI status
6. `mark_pr_ready` - Convert draft → ready
7. `approve_pr` - Approve PR
8. `merge_pr` - Merge PR (merge/squash/rebase)

### **CI/Testing (2)**

9. `get_pr_ci_status` - Check if tests passed
10. `batch_review_draft_prs` - Batch review with CI status

### **Branch Management (2)**

11. `list_branches` - List all branches
12. `delete_branch` - Delete branch after merge

### **Workflows/Actions (2)**

13. `list_workflow_runs` - See Actions runs
14. `trigger_workflow` - Trigger deployment/tests

### **Issues (2)**

15. `create_github_issue` - Create GitHub issue
16. `list_github_issues` - List GitHub issues

### **Releases (1)**

17. `create_release` - Create GitHub release

---

## 💡 **Real-World Usage**

### **Daily Workflow:**

**Morning:**

```
"Show me all draft PRs that Cursor created yesterday"
→ See 8 draft PRs

"Give me a batch review"
→ 6 ready to merge, 2 need fixes

"Merge the 6 that passed CI"
→ Done in 30 seconds!
```

**After Cursor Works:**

```
Cursor: "I created 3 PRs for the features you requested"

You: "Show me those PRs with their CI status"
→ See them

You: "Merge any that passed tests"
→ Auto-merged!
```

**Deployment:**

```
"Trigger the deploy workflow on main branch"
→ Deploys to production
```

---

## 🔧 **Advanced Workflows**

### **Workflow 1: Safe Batch Merge**

```
"For all draft PRs:
1. Check CI status
2. Only approve if all tests passed
3. Mark as ready
4. Merge with squash
5. Delete source branches
6. Create a Linear issue documenting what was merged"

Agent handles entire workflow!
```

### **Workflow 2: Selective Review**

```
"Show me draft PRs that change authentication code"
→ Filters to auth-related PRs

"Get details for those PRs"
→ Shows files changed

"Approve PR #45 but request changes on #46"
→ Mixed actions
```

### **Workflow 3: Deploy After Merge**

```
"Merge PR #50 and trigger the deploy workflow"

Agent:
1. Merges PR
2. Waits for merge
3. Triggers deployment
4. Monitors deployment
5. Reports success/failure
```

---

## ⚡ **PR Review Cheat Sheet**

| Command        | What It Does             |
| -------------- | ------------------------ |
| List draft PRs | See all drafts           |
| Batch review   | See all with CI status   |
| Get PR details | Deep dive on one PR      |
| Approve PR     | Mark as approved         |
| Mark ready     | Draft → ready for review |
| Merge PR       | Merge into main          |
| Get CI status  | Check if tests passed    |
| Delete branch  | Cleanup after merge      |

---

## 🎉 **You Now Have 51 Total MCP Tools!**

- **21 Linear** - Issue management
- **13 Forge** - Deployment
- **17 GitHub** - PR automation

**Complete DevOps automation!**

---

## 📚 **Next Steps**

1. Add GitHub MCP to Cursor config
2. Reload Cursor
3. Test: "List my GitHub repos"
4. Try: "Show draft PRs"
5. Automate your PR workflow!

**See GITHUB_MCP_GUIDE.md for complete examples!**


