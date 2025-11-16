# Linear Dependency Management Guide

## 🎯 **The Problem We're Solving**

**Without dependencies:**

- Agent creates issues in any order
- Agent starts work on #5 when #1-4 aren't done yet
- Agent creates duplicates of completed work
- Work gets done in wrong order
- Blockers cause failures

**With dependencies:**

- ✅ Issues created in proper sequence
- ✅ Agent only works on unblocked issues
- ✅ No duplicate work
- ✅ Proper order enforced
- ✅ Clear visibility of what's next

---

## 🚀 **Quick Start**

### **1. Copy Rules to Your Project**

```bash
cp ~/Documents/apps/linearadmin/.cursorrules.template ~/your-project/.cursorrules
```

### **2. Agent Now Knows:**

- Check blockers before starting
- Search for duplicates before creating
- Use dependencies for sequential work
- Report what's unblocked after completion

---

## 📋 **21 MCP Tools (Now Complete!)**

### **Dependency Management (4 new tools)**

1. ✅ `check_issue_blockers` - Check if issue is safe to start
2. ✅ `get_next_available_issues` - Get only unblocked issues
3. ✅ `get_issue_dependencies` - Show full dependency chain
4. ✅ `create_issues_with_dependencies` - Create with proper order

### **All Other Tools (17 existing)**

- Issue creation, updates, search, comments, etc.
- See FUNCTIONS_INVENTORY.md for complete list

---

## 💡 **How to Use Dependencies**

### **Pattern 1: Creating Issues in Order**

**User says:**

```
"Create these issues for building authentication:
1. Setup database
2. Create User model
3. Add authentication endpoints
4. Build login page"
```

**Agent does:**

```typescript
create_issues_with_dependencies({
  teamId: "team-abc-123",
  issues: [
    {
      title: "Setup database schema",
      description: "Create users table...",
      priority: 3,
    }, // Index 0
    {
      title: "Create User model",
      blockedBy: [0], // Needs issue 0 done first
    }, // Index 1
    {
      title: "Add authentication endpoints",
      blockedBy: [1], // Needs issue 1 done first
    }, // Index 2
    {
      title: "Build login page",
      blockedBy: [2], // Needs issue 2 done first
    }, // Index 3
  ],
});
```

**Result:**

```
Created with dependencies:
#101: Setup database (✅ Ready to start)
#102: Create User model (⛔ Blocked by #101)
#103: Add auth endpoints (⛔ Blocked by #102)
#104: Build login page (⛔ Blocked by #103)
```

---

### **Pattern 2: Check Before Starting**

**User says:**

```
"Work on issue #102"
```

**Agent MUST do:**

```typescript
// Step 1: Check blockers
check_issue_blockers("#102")

// Returns:
{
  isBlocked: true,
  canStart: false,
  blockers: [
    { number: "#101", title: "Setup database", state: "In Progress" }
  ],
  message: "⛔ Cannot start. Blocked by: #101 Setup database (In Progress)"
}

// Step 2: Report to user
"Cannot start #102 yet. It's blocked by:
- #101: Setup database (In Progress)

Would you like to work on #101 instead?"
```

---

### **Pattern 3: Find Available Work**

**User says:**

```
"What can I work on?"
```

**Agent does:**

```typescript
get_next_available_issues(teamId, projectId)

// Returns only unblocked issues:
{
  availableIssues: [
    { number: "#101", title: "Setup database", state: "Todo" },
    { number: "#87", title: "Update docs", state: "Todo" }
  ],
  count: 2,
  message: "Found 2 issues ready to start"
}
```

**Agent responds:**

```
"You can work on these (no blockers):
✅ #101: Setup database
✅ #87: Update docs

Blocked issues (not ready yet):
⛔ #102: Create User model (blocked by #101)
⛔ #103: Add auth endpoints (blocked by #102)
⛔ #104: Build login page (blocked by #103)"
```

---

### **Pattern 4: Understanding Dependencies**

**User says:**

```
"Show me what #104 depends on"
```

**Agent does:**

```typescript
get_issue_dependencies("#104")

// Returns:
{
  issue: { number: "#104", title: "Build login page" },
  blockedBy: [
    { number: "#103", title: "Add auth endpoints", state: "Todo" }
  ],
  blocks: [],
  dependencyChain: {
    mustCompleteBefore: [
      "#103: Add auth endpoints (Todo)",
      "#102: Create User model (Todo)",
      "#101: Setup database (In Progress)"
    ],
    thisWillUnblock: []
  }
}
```

**Agent responds:**

```
"Issue #104 depends on this chain:
#101 (In Progress) → #102 (Todo) → #103 (Todo) → #104

Must complete in this order:
1. ✅ #101: Setup database (currently working)
2. ⏳ #102: Create User model (waiting)
3. ⏳ #103: Add auth endpoints (waiting)
4. ⏳ #104: Build login page (this issue)

Cannot start #104 until #101, #102, and #103 are completed."
```

---

### **Pattern 5: After Completing Work**

**User says:**

```
"Close issue #101"
```

**Agent does:**

```typescript
// Step 1: Close the issue
close_issue("#101", true);

// Step 2: Check what it unblocks
get_issue_dependencies("#101");

// Returns:
{
  blocks: [{ number: "#102", title: "Create User model", state: "Todo" }];
}
```

**Agent responds:**

```
"✅ Issue #101 completed!

This unblocked:
🎉 #102: Create User model (now ready to start!)

Still blocked:
⏳ #103: Add auth endpoints (waiting for #102)
⏳ #104: Build login page (waiting for #102 → #103)"
```

---

## 🎬 **Real-World Example: Full Workflow**

### **Day 1: Project Setup**

```
User: "Create a new project called 'User Authentication' with these features in order:
1. Database setup
2. User model
3. Auth endpoints
4. Login UI
5. Password reset"

Agent:
[Creates project]
[Uses create_issues_with_dependencies]

Created project: User Authentication

Created issues with dependencies:
✅ #101: Setup database schema (Ready)
⛔ #102: Create User model (Blocked by #101)
⛔ #103: Add authentication endpoints (Blocked by #102)
⛔ #104: Build login page (Blocked by #103)
⛔ #105: Add password reset (Blocked by #103)

You can start with #101!
```

---

### **Day 2: Starting Work**

```
User: "What can I work on?"

Agent:
[Calls get_next_available_issues]

Ready to work:
✅ #101: Setup database schema

Everything else is blocked. Start with #101?
```

```
User: "Yes, work on #101"

Agent:
[Checks blockers - none found]
✅ No blockers. Starting work on #101...
[Creates branch, makes changes]
```

---

### **Day 3: Completing Work**

```
User: "I finished #101. Close it."

Agent:
[Closes #101]
[Checks dependencies]

✅ #101 completed!

This unblocked:
🎉 #102: Create User model (now ready!)

Next available work:
- #102: Create User model
```

---

### **Day 4: Attempting Blocked Work**

```
User: "Work on #104"

Agent:
[Checks blockers first]

⛔ Cannot start #104. It's blocked by:
- #102: Create User model (In Progress)
- #103: Add auth endpoints (Todo)

Dependency chain:
#102 → #103 → #104

Would you like to:
- Continue with #102 instead?
- See all available issues?
```

---

## 🎯 **For Agents: Simple Decision Tree**

```
User requests work on issue X
         ↓
    [Check blockers]
         ↓
    Is blocked?
    ↙         ↘
  YES          NO
   ↓            ↓
Report       Start work
blockers
   ↓
Ask user
what to do
instead
```

---

## 📝 **Creating Issues: Agent Instructions**

### **When User Says:**

**"Create issue for X"** → Search first, then create

**"Create issues for A, B, C"** → Use `create_bulk_issues` (no order needed)

**"Create issues in order" / "Create A, then B, then C"** → Use `create_issues_with_dependencies`

**"X must be done before Y"** → Use `link_issues` after creation

---

### **Examples: What Agent Should Do**

#### **Example 1: Single Issue**

```
User: "Create an issue for user authentication"

Agent:
1. [search_issues "user authentication"]
2. Check results
3. If duplicate found: Ask user
4. If not: Create issue
```

#### **Example 2: Multiple Unrelated Issues**

```
User: "Create issues for: update docs, fix typo, add tests"

Agent: Uses create_bulk_issues (no dependencies needed)
```

#### **Example 3: Sequential Issues**

```
User: "Create issues for building login system:
- Setup database
- Create models
- Add authentication
- Build UI"

Agent: Uses create_issues_with_dependencies:
issues: [
  { title: "Setup database" },                  // 0
  { title: "Create models", blockedBy: [0] },   // 1
  { title: "Add authentication", blockedBy: [1] }, // 2
  { title: "Build UI", blockedBy: [2] }         // 3
]
```

#### **Example 4: Complex Dependencies**

```
User: "Create auth system issues:
- Setup DB (no dependencies)
- User model (needs DB)
- Auth service (needs User model)
- Login page (needs Auth service)
- Signup page (needs Auth service)
- Password reset (needs Auth service)"

Agent: Uses create_issues_with_dependencies:
issues: [
  { title: "Setup DB" },                        // 0
  { title: "User model", blockedBy: [0] },      // 1
  { title: "Auth service", blockedBy: [1] },    // 2
  { title: "Login page", blockedBy: [2] },      // 3
  { title: "Signup page", blockedBy: [2] },     // 4
  { title: "Password reset", blockedBy: [2] }   // 5
]

// Note: 3, 4, 5 all depend on 2 but not on each other
```

---

## ⚠️ **Critical Rules for Agents**

### **Rule 1: ALWAYS Check Blockers**

```
BEFORE starting work on ANY issue:
→ Call check_issue_blockers
→ If blocked: STOP and report
→ If not blocked: Proceed
```

### **Rule 2: ALWAYS Search for Duplicates**

```
BEFORE creating ANY issue:
→ Call search_issues with relevant keywords
→ If similar found: ASK USER
→ If not found: Create
```

### **Rule 3: Use Dependencies for Order**

```
IF user says: "in order", "sequence", "first then", "before", "after"
→ Use create_issues_with_dependencies (NOT create_bulk_issues)
```

### **Rule 4: Report Unblocked Issues**

```
AFTER completing ANY issue:
→ Call get_issue_dependencies
→ Report what's now unblocked
```

---

## 📊 **Tool Selection Guide for Agents**

| User Intent                           | Tool to Use                          |
| ------------------------------------- | ------------------------------------ |
| "Create issue for X"                  | search_issues → create_linear_issue  |
| "Create A, B, C" (no order mentioned) | create_bulk_issues                   |
| "Create A, B, C in order"             | create_issues_with_dependencies      |
| "Work on #X"                          | check_issue_blockers → proceed       |
| "What can I work on?"                 | get_next_available_issues            |
| "Show dependencies for #X"            | get_issue_dependencies               |
| "#X must be done before #Y"           | link_issues                          |
| "Close #X"                            | close_issue → get_issue_dependencies |

---

## 🎨 **Visual Workflow**

### **Creating Issues with Dependencies**

```
User: "Create auth system issues in order"
              ↓
Agent: create_issues_with_dependencies
              ↓
        Linear Creates:
              ↓
    #101 (✅ No dependencies)
         ↓ blocks
    #102 (⛔ Blocked by #101)
         ↓ blocks
    #103 (⛔ Blocked by #102)
         ↓ blocks
    #104 (⛔ Blocked by #103)
```

### **Working Through Dependencies**

```
Week 1:
Agent works on #101 → ✅ Completes
              ↓
         #102 unblocks
              ↓
Agent: "Ready to start #102!"

Week 2:
Agent works on #102 → ✅ Completes
              ↓
         #103 unblocks
              ↓
Agent: "Ready to start #103!"

Week 3:
Agent works on #103 → ✅ Completes
              ↓
         #104 unblocks
              ↓
Agent: "Ready to start #104!"
```

---

## 📖 **Agent Training Examples**

### **Example 1: Proper Order Creation**

```
User: "Create a user management system with:
- Database schema
- User model and repository
- Authentication service
- Registration endpoint
- Login endpoint"

✅ CORRECT Agent Response:
"I'll create these issues with proper dependencies:

[Calls create_issues_with_dependencies]

Created 5 issues:
- #201: Setup database schema (✅ Ready)
- #202: Create User model (⛔ Blocked by #201)
- #203: Add authentication service (⛔ Blocked by #202)
- #204: Build registration endpoint (⛔ Blocked by #203)
- #205: Build login endpoint (⛔ Blocked by #203)

Start with #201 - the foundation."
```

---

### **Example 2: Checking Before Starting**

```
User: "Work on issue #202"

✅ CORRECT Agent Response:
[Calls check_issue_blockers(#202)]

"⛔ Cannot start #202 yet. It's blocked by:
- #201: Setup database schema (In Progress)

This issue will be ready when #201 is completed.
Would you like me to help with #201 instead?"
```

❌ **WRONG Agent Response:**

```
"Starting work on #202..."
[Fails because database doesn't exist yet]
```

---

### **Example 3: Duplicate Prevention**

```
User: "Create an issue for setting up the dev environment"

✅ CORRECT Agent Response:
[Calls search_issues("development environment")]

"I found existing issue:
#12: Setup Development Environment (Done)
Completed: 2 weeks ago

This appears to be a duplicate. Would you like to:
1. Reopen issue #12 (if redoing the setup)
2. Create new issue (if requirements changed)
3. Skip (if already complete)?"
```

❌ **WRONG Agent Response:**

```
[Creates #213: Setup development environment]
// Duplicate created!
```

---

### **Example 4: Complex Dependencies**

```
User: "Create a shopping cart system with:
- Product catalog (no dependencies)
- Shopping cart (needs catalog)
- Checkout (needs cart)
- Payment processing (needs checkout)
- Order confirmation (needs payment)"

✅ CORRECT Agent Response:
[Calls create_issues_with_dependencies]

issues: [
  { title: "Product catalog" },                    // 0
  { title: "Shopping cart", blockedBy: [0] },      // 1
  { title: "Checkout flow", blockedBy: [1] },      // 2
  { title: "Payment processing", blockedBy: [2] }, // 3
  { title: "Order confirmation", blockedBy: [3] }  // 4
]

"Created 5 issues in dependency order:
#301 → #302 → #303 → #304 → #305

Start with #301!"
```

---

## 🎯 **User Phrases That Trigger Dependencies**

### **Agent Should Detect These:**

- "in order"
- "in sequence"
- "first, then, finally"
- "step 1, step 2, step 3"
- "must be done before"
- "depends on"
- "needs X first"
- "after X is complete"
- "once X is done"
- "X blocks Y"

### **When You See These → Use `create_issues_with_dependencies`**

---

## 🚦 **Decision Flow for Agents**

```mermaid
User requests issue creation
         ↓
   Multiple issues?
    ↙         ↘
  NO          YES
   ↓            ↓
Search      Order mentioned?
duplicates   ↙         ↘
   ↓        YES         NO
Create    Use           Use
single    create_issues create_bulk
issue     _with_deps    _issues
```

---

## ✅ **Testing the System**

### **Test 1: Create with Dependencies**

```
"Create 3 issues in order: Setup, Build, Test"

Expected:
- 3 issues created
- #2 blocked by #1
- #3 blocked by #2
- Only #1 is ready
```

### **Test 2: Check Blockers**

```
"Check if issue #2 is ready"

Expected:
- Reports blocked by #1
- Shows blocker status
- Suggests working on #1
```

### **Test 3: Get Available**

```
"What can I work on?"

Expected:
- Shows only unblocked issues
- Explains what's blocked
- Suggests next steps
```

### **Test 4: Complete and Unblock**

```
"Close issue #1"

Expected:
- Closes #1
- Reports "#2 is now unblocked!"
- Suggests starting #2
```

---

## 💡 **Pro Tips**

### **For Users:**

1. **Be explicit about order:**
   - ✅ "Create in order: A, B, C"
   - ❌ "Create A, B, C" (might not add dependencies)

2. **Ask about blockers:**
   - "What's blocking issue #X?"
   - "Why can't I start #X?"

3. **Let agent guide you:**
   - "What should I work on next?"
   - Agent will suggest only unblocked work

### **For Agents:**

1. **Always check before starting** - Use check_issue_blockers
2. **Always search before creating** - Use search_issues
3. **Use proper tool for the job:**
   - Sequential work → create_issues_with_dependencies
   - Unrelated work → create_bulk_issues
   - Single issue → create_linear_issue (after duplicate check)

---

## 📚 **Copy-Paste Templates**

### **For Users: Add to Issue Descriptions**

```markdown
⚠️ **Before starting:** Check if this issue has blockers using check_issue_blockers. If blocked, work on blockers first.

⚠️ **Duplicate check:** Search for similar issues before starting. This may have been completed already.
```

### **For Projects: Add to Project Description**

```markdown
## Dependency Rules

All issues in this project may have dependencies.

**AI Agents MUST:**

1. Check blockers before starting any issue
2. Only work on unblocked issues
3. Report what's unblocked after completion
4. Never skip dependency checks
```

---

## 🎉 **Summary**

**You now have:**

- ✅ 21 MCP tools (4 new for dependencies)
- ✅ Automatic blocker checking
- ✅ Duplicate detection
- ✅ Proper issue ordering
- ✅ Clear visibility of what's next

**Agents will:**

- ✅ Always check blockers first
- ✅ Never start blocked work
- ✅ Create issues in proper order
- ✅ Prevent duplicates
- ✅ Report progress clearly

**Result: No more wasted work, no more dependency failures!** 🚀

---

**Start using:** Copy `.cursorrules.template` to your projects and restart Cursor!
