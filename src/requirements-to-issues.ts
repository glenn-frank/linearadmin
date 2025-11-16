/**
 * requirements-to-linear
 * --------------------
 * Parses structured requirements documents and creates comprehensive Linear issues
 * with automatic labeling, team selection, and issue organization.
 */

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import inquirer from "inquirer";

dotenv.config();

/* ---------------- ENV Validation ---------------- */
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();
const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();
const TEAM_ID = process.env.LINEAR_TEAM_ID?.trim();

if (!OPENAI_KEY || !LINEAR_KEY) {
  console.error("❌ Missing required .env values:");
  if (!OPENAI_KEY) console.error("  - OPENAI_API_KEY missing");
  if (!LINEAR_KEY) console.error("  - LINEAR_API_KEY missing");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Path Handling ---------------- */
function sanitizePath(input: string) {
  return input.trim().replace(/^'|'$/g, "").replace(/^"|"$/g, "");
}

function extractJsonArrayFromText(text: string) {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  // Fallback: extract the first top-level JSON array substring
  const start = text.indexOf("[");
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return text;
}

function mapPriorityToLinear(priority: any) {
  if (typeof priority !== "string") return 1;
  const p = priority.trim().toLowerCase();
  if (p === "high") return 3;
  if (p === "medium") return 2;
  if (p === "low") return 1;
  if (p === "none" || p === "no" || p === "0") return 0;
  return 1;
}

function sanitizeIssueForLinear(issue: any) {
  const rawTitle = issue?.Title ?? issue?.title ?? "";
  const rawDescription = issue?.Description ?? issue?.description ?? "";
  const rawPriority = issue?.Priority ?? issue?.priority ?? "";
  const rawRequirements = issue?.Requirements ?? issue?.requirements ?? [];
  const rawAcceptanceCriteria =
    issue?.Acceptance_Criteria ?? issue?.acceptance_criteria ?? [];
  const rawTechnicalNotes =
    issue?.Technical_Notes ?? issue?.technical_notes ?? "";

  const title = String(rawTitle).trim().slice(0, 255);
  const description = String(rawDescription).trim();
  const priority = mapPriorityToLinear(rawPriority);

  // Handle both array and string formats for requirements
  let requirements: string[] = [];
  if (Array.isArray(rawRequirements)) {
    requirements = rawRequirements
      .map(String)
      .filter((r) => r.trim().length > 0);
  } else if (typeof rawRequirements === "string" && rawRequirements.trim()) {
    requirements = [rawRequirements.trim()];
  }

  // Handle both array and string formats for acceptance criteria
  let acceptanceCriteria: string[] = [];
  if (Array.isArray(rawAcceptanceCriteria)) {
    acceptanceCriteria = rawAcceptanceCriteria
      .map(String)
      .filter((c) => c.trim().length > 0);
  } else if (
    typeof rawAcceptanceCriteria === "string" &&
    rawAcceptanceCriteria.trim()
  ) {
    acceptanceCriteria = [rawAcceptanceCriteria.trim()];
  }

  // Handle both array and string formats for technical notes
  let technicalNotes = "";
  if (Array.isArray(rawTechnicalNotes)) {
    technicalNotes = rawTechnicalNotes
      .map(String)
      .filter((n) => n.trim().length > 0)
      .join("\n");
  } else {
    technicalNotes = String(rawTechnicalNotes).trim();
  }

  return {
    title,
    description,
    priority,
    requirements,
    acceptanceCriteria,
    technicalNotes,
  };
}

function buildRequirementsSection(
  requirements: string[],
  acceptanceCriteria: string[],
  technicalNotes: string
): string {
  const sections: string[] = [];

  if (requirements.length > 0) {
    sections.push("## Requirements");
    requirements.forEach((req, i) => {
      sections.push(`${i + 1}. ${req}`);
    });
  }

  if (acceptanceCriteria.length > 0) {
    sections.push("## Acceptance Criteria");
    acceptanceCriteria.forEach((criteria, i) => {
      sections.push(`${i + 1}. ${criteria}`);
    });
  }

  if (technicalNotes.trim()) {
    sections.push("## Technical Notes");
    sections.push(technicalNotes);
  }

  return sections.join("\n\n");
}

/* ---------------- Requirements Document Processing ---------------- */
async function parseRequirementsDocument(filePath: string) {
  console.log(`📄 Reading requirements document: ${path.basename(filePath)}`);

  const content = fs.readFileSync(filePath, "utf8");
  const fileExt = path.extname(filePath).toLowerCase();

  // Determine document type and extract text accordingly
  let textContent = "";

  if (fileExt === ".md" || fileExt === ".txt") {
    textContent = content;
  } else if (fileExt === ".pdf") {
    console.error(
      "❌ PDF files are not supported yet. Please convert to .txt or .md format."
    );
    throw new Error("PDF format not supported");
  } else {
    console.warn(`⚠️ Unknown file format: ${fileExt}. Treating as plain text.`);
    textContent = content;
  }

  if (!textContent.trim()) {
    throw new Error("Document appears to be empty");
  }

  console.log(`📊 Document size: ${textContent.length} characters`);
  return textContent;
}

async function generateSubIssues(parentIssues: any[]) {
  console.log("\n🔧 Generating sub-issues for parent issues...");

  const subIssuePrompt = `
You are an expert project manager. Your task is to break down parent issues into specific, implementable sub-issues.

For each parent issue provided, create 3-4 sub-issues that represent specific components or modules within that system.

Each sub-issue must include:
- Title: Specific component name (e.g., "User Registration Module")
- Description: What this specific component does
- Requirements: Array of specific requirements for this component
- Acceptance_Criteria: Array of testable criteria for this component
- Technical_Notes: Array of implementation guidance for this component

Example:
Parent Issue: "Implement User Management System"
Sub-issues:
1. "User Registration Module" - Handles user signup and email verification
2. "Authentication Module" - Handles login, logout, and session management
3. "Profile Management Module" - Handles user profile updates and preferences
4. "Role-Based Access Control Module" - Handles permissions and user roles

Respond in pure JSON array format with all sub-issues.
`;

  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: subIssuePrompt },
          { role: "user", content: JSON.stringify(parentIssues, null, 2) },
        ],
        temperature: 0.2,
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }
    );

    const raw = res.data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No response content from OpenAI.");

    const jsonCandidate = extractJsonArrayFromText(raw);
    const subIssues = JSON.parse(jsonCandidate);

    console.log(`✅ Generated ${subIssues.length} sub-issues`);
    return subIssues;
  } catch (err: any) {
    console.error(
      "\n❌ OpenAI sub-issue generation failed:",
      err.response?.data || err.message
    );
    throw err;
  }
}

async function summarizeRequirementsToIssues(text: string) {
  console.log("\n🧠 Parsing requirements into comprehensive issues...");

  const prompt = `
You are an expert project manager and technical analyst. Your task is to parse a structured requirements document and break it down into comprehensive, actionable Linear issues that will be worked on by AI agents (like Cursor agents). Each issue must be extremely detailed and self-contained.

For each requirement, feature, or specification mentioned in the document, create a detailed issue that includes:

1. **Title**: Clear, actionable title (max 255 characters)
2. **Description**: Comprehensive description including:
   - Detailed problem statement and current state
   - Specific desired outcome and expected behavior
   - Business value and user impact analysis
   - Technical constraints and considerations
   - Integration points and dependencies
   - Performance and scalability requirements
   - Security and compliance considerations
   - User experience implications
3. **Priority**: High/Medium/Low based on:
   - Business criticality and revenue impact
   - User experience impact
   - Technical complexity and risk
   - Dependencies and blocking factors
   - Compliance and security requirements
4. **Requirements**: Array of specific, detailed technical requirements including:
   - Functional requirements (what the system must do)
   - Non-functional requirements (performance, security, usability)
   - API specifications and data requirements
   - Integration requirements
   - Compliance and regulatory requirements
   - Performance benchmarks and SLAs
5. **Acceptance_Criteria**: Array of comprehensive, testable criteria including:
   - Functional acceptance criteria (feature works as specified)
   - Performance acceptance criteria (response times, throughput)
   - Security acceptance criteria (authentication, authorization, data protection)
   - Usability acceptance criteria (user experience, accessibility)
   - Integration acceptance criteria (external system compatibility)
   - Error handling and edge case criteria
   - Data validation and integrity criteria
6. **Technical_Notes**: Array of detailed implementation guidance including:
   - Architecture and design considerations
   - Technology stack recommendations
   - Database schema and data model requirements
   - API design and interface specifications
   - Security implementation details
   - Performance optimization strategies
   - Testing strategy and test cases
   - Deployment and configuration requirements
   - Monitoring and logging requirements
   - Error handling and recovery procedures

**CRITICAL: AI Agent Requirements**
These issues will be worked on by AI agents, so they need to be extremely detailed and self-contained:

- **Each issue must be implementable by an AI agent without additional context**
- **Include specific code examples, API endpoints, and data structures where possible**
- **Provide detailed step-by-step implementation guidance**
- **Include specific testing scenarios and validation criteria**
- **Specify exact error handling and edge cases**
- **Include performance benchmarks and monitoring requirements**
- **Provide clear success criteria and completion metrics**

**STRUCTURE REQUIREMENTS:**
Each issue MUST include these exact sections in this order:
1. **Description** - Detailed problem statement and context
2. **Requirements** - Bulleted list of specific requirements
3. **Acceptance Criteria** - Bulleted list of testable criteria
4. **Technical Notes** - Implementation guidance and considerations

**SUB-ISSUE CREATION - MANDATORY:**
For complex features or large requirements, you MUST break them down into sub-issues:
- Create parent issues for major features (e.g., "Implement User Management System")
- Create child issues for specific components (e.g., "User Registration Module", "Authentication Module", "Profile Management Module")
- Each sub-issue should be independently implementable
- Include dependencies and relationships between issues
- Ensure each sub-issue has complete requirements and acceptance criteria
- Use descriptive titles that indicate the parent-child relationship
- Include a "parent_issue" field to link related issues

**CRITICAL REQUIREMENT:** For each major system mentioned in the requirements, you MUST create:
1. One parent issue for the overall system
2. AT LEAST 3-4 sub-issues for specific components/modules within that system
3. Each sub-issue should be a specific, implementable component

**MANDATORY SUB-ISSUE BREAKDOWN:**
- If you see "User Management System" → Create sub-issues: "User Registration Module", "Authentication Module", "Profile Management Module", "Role-Based Access Control Module"
- If you see "Product Catalog Management" → Create sub-issues: "Product Creation Module", "Category Management Module", "Inventory Tracking Module", "Search and Filtering Module"
- If you see "Shopping Cart and Checkout" → Create sub-issues: "Cart Management Module", "Payment Processing Module", "Shipping Calculation Module", "Order Confirmation Module"

**YOU MUST CREATE SUB-ISSUES - THIS IS NOT OPTIONAL**

**Example Sub-Issue Structure:**
- Parent: "Implement User Management System"
  - Sub-issue: "User Registration Module"
  - Sub-issue: "Authentication Module" 
  - Sub-issue: "Profile Management Module"
  - Sub-issue: "Role-Based Access Control Module"

**Detailed Analysis Guidelines:**
- Break down large features into smaller, manageable issues
- Include both functional and non-functional requirements
- Consider UI/UX, backend, frontend, testing, and documentation needs
- Identify dependencies between issues and their impact
- Prioritize based on business value and technical dependencies
- Include comprehensive edge cases and error handling requirements
- Consider performance, security, and scalability requirements
- Analyze user workflows and user experience implications
- Consider data flow and integration patterns
- Include compliance and regulatory considerations

**Issue Categories to Consider:**
- Core functionality implementation with detailed specifications
- User interface and experience with wireframes and user flows
- Backend services and APIs with detailed endpoint specifications
- Database design and migrations with schema requirements
- Testing and quality assurance with comprehensive test plans
- Documentation and user guides with content requirements
- Performance optimization with specific benchmarks
- Security and compliance with detailed security requirements
- Integration with external services with API specifications
- Deployment and infrastructure with environment requirements
- Monitoring and analytics with specific metrics and alerts

**Quality Standards for AI Agents:**
- Each issue should be actionable and specific enough for an AI agent to implement
- Include sufficient detail for estimation and planning
- Consider the full software development lifecycle
- Include both positive and negative test scenarios
- Address scalability and maintainability concerns
- Consider backward compatibility and migration strategies
- Provide specific implementation details and code examples
- Include detailed testing and validation procedures
- Specify exact performance and security requirements

**Example Structure for AI Agent Issues:**
Each issue should follow this detailed structure:

**Title:** "Implement User Authentication System"

**Description:** 
"The current system lacks user authentication, creating security vulnerabilities and preventing personalized user experiences. Users need secure login/logout functionality with role-based access control."

**Requirements:**
1. "Implement secure user registration and login"
2. "Add password encryption and validation"
3. "Create role-based access control system"
4. "Implement session management"
5. "Add password reset functionality"

**Acceptance_Criteria:**
1. "Users can register with valid email and password"
2. "Users can login with correct credentials"
3. "Invalid credentials are rejected with appropriate error messages"
4. "Sessions expire after 24 hours of inactivity"
5. "Password reset emails are sent successfully"
6. "Role-based permissions are enforced correctly"

**Technical_Notes:**
1. "Use JWT tokens for session management"
2. "Implement bcrypt for password hashing"
3. "Store user data in PostgreSQL with proper indexing"
4. "Add rate limiting for login attempts"
5. "Include comprehensive error handling and logging"

**EXAMPLE OUTPUT FORMAT:**
Here is exactly how you should structure your response:

Create a JSON array with both parent issues and sub-issues. For example:
- Parent: "Implement User Management System" 
- Sub-issues: "User Registration Module", "Authentication Module", "Profile Management Module"

**CRITICAL:** You MUST create both parent issues AND their sub-issues. Do not stop at just parent issues.

Respond in pure JSON array format with all issues found. Each issue should be comprehensive and detailed enough to serve as a complete specification for AI agent implementation.
`;

  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text.slice(0, 25000) }, // Increased limit for more detailed analysis
        ],
        temperature: 0.2,
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }
    );

    const raw = res.data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No response content from OpenAI.");

    const jsonCandidate = extractJsonArrayFromText(raw);
    const issues = JSON.parse(jsonCandidate);

    console.log(`✅ Generated ${issues.length} issues from requirements`);
    return issues;
  } catch (err: any) {
    console.error(
      "\n❌ OpenAI requirements parsing failed:",
      err.response?.data || err.message
    );
    throw err;
  }
}

/* ---------------- Linear Integration (Reused from index.ts) ---------------- */
async function fetchLinearTeams() {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      { query: `{ teams { nodes { id name key } } }` },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const teams = res.data?.data?.teams?.nodes || [];
    return teams.map((t: any) => ({ id: t.id, name: t.name, key: t.key }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear teams:",
      err.response?.data || err.message
    );
    return [];
  }
}

async function selectLinearTeam() {
  const teams = await fetchLinearTeams();
  if (!teams.length) {
    throw new Error(
      "No Linear teams available. Set LINEAR_TEAM_ID in .env or check API key."
    );
  }

  // Check if we should auto-select from environment variable
  if (TEAM_ID && process.argv.includes("--use-env-team")) {
    const byId = teams.find((t: any) => t.id === TEAM_ID);
    const byKey = teams.find((t: any) => t.key === TEAM_ID);
    const foundTeam = byId || byKey;

    if (foundTeam) {
      console.log(
        `✅ Using team from env: ${foundTeam.name} (${foundTeam.key})`
      );
      return foundTeam.id;
    } else {
      console.warn(
        `⚠️ LINEAR_TEAM_ID "${TEAM_ID}" not found in available teams`
      );
    }
  }

  // Default: show team selection prompt
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "teamId",
      message: "Select a Linear team:",
      choices: teams.map((t: any) => ({
        name: `${t.name} (${t.key})`,
        value: t.id,
      })),
    },
  ]);
  return answers.teamId as string;
}

async function fetchLinearLabels(
  teamId: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query($id: String!) { team(id: $id) { labels { nodes { id name } } } }`,
        variables: { id: teamId },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const labels = res.data?.data?.team?.labels?.nodes || [];
    return labels.map((l: any) => ({ id: l.id, name: l.name }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear labels:",
      err.response?.data || err.message
    );
    return [];
  }
}

function inferLabelIdsFromIssue(
  title: string,
  description: string,
  availableLabels: Array<{ id: string; name: string }>
): string[] {
  if (!availableLabels.length) return [];
  const haystack = ` ${title}\n${description} `.toLowerCase();

  const matched = new Set<string>();
  for (const label of availableLabels) {
    const name = String(label.name || "").trim();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped.toLowerCase()}([^a-z0-9]|$)`);
    if (re.test(haystack)) {
      matched.add(label.id);
      if (matched.size >= 3) break; // cap to 3 labels max
    }
  }
  return Array.from(matched);
}

function inferCategories(title: string, description: string): string[] {
  const text = ` ${title}\n${description} `.toLowerCase();
  const categories: string[] = [];

  // Bug indicators
  if (
    /(bug|error|exception|stack\s*trace|crash|fail|broken|doesn't work|does not work|regression|not working|broken|malfunction)/.test(
      text
    )
  ) {
    categories.push("Bug");
  }

  // Improvement indicators
  if (
    /(improvement|enhancement|optimi[sz]e|speed|faster|performance|refactor|usability|quality|better|upgrade)/.test(
      text
    )
  ) {
    categories.push("Improvement");
  }

  // UI/Branding indicators
  if (
    /(ui|ux|interface|design|layout|styling|color|colour|font|typography|spacing|alignment|button|modal|dialog|hover|focus|visual|appearance)/.test(
      text
    )
  ) {
    categories.push("UI");
  }
  if (/(brand|branding|logo|palette|identity|customization)/.test(text)) {
    categories.push("Branding");
  }

  // Domain-specific categories
  if (/(invitation|invite|accept|join|event|rsvp)/.test(text)) {
    categories.push("Invitation System");
  }
  if (/(email|template|mail|notification)/.test(text)) {
    categories.push("Email System");
  }
  if (/(chat|conversation|message|talk|discuss)/.test(text)) {
    categories.push("Chat Feature");
  }
  if (/(document|form|populate|fill|data|information)/.test(text)) {
    categories.push("Document Management");
  }
  if (/(test|testing|verify|validation|check|debug)/.test(text)) {
    categories.push("Testing");
  }
  if (/(portal|dashboard|interface|system|platform)/.test(text)) {
    categories.push("Platform");
  }
  if (/(user|customer|client|dj|planner|wedding)/.test(text)) {
    categories.push("User Experience");
  }
  if (/(security|auth|login|permission|access)/.test(text)) {
    categories.push("Security");
  }
  if (/(api|backend|server|database|integration)/.test(text)) {
    categories.push("Backend");
  }
  if (/(mobile|responsive|device|phone|tablet)/.test(text)) {
    categories.push("Mobile");
  }

  // Deduplicate while preserving order
  return Array.from(new Set(categories));
}

function findLabelIdByPreferredNames(
  availableLabels: Array<{ id: string; name: string }>,
  preferredNames: string[]
): string | null {
  const lowerToId = new Map<string, string>();
  for (const l of availableLabels)
    lowerToId.set(String(l.name).toLowerCase(), l.id);
  for (const name of preferredNames) {
    const id = lowerToId.get(name.toLowerCase());
    if (id) return id;
  }
  return null;
}

function findSimilarLabelId(
  category: string,
  availableLabels: Array<{ id: string; name: string }>
): string | null {
  const categoryLower = category.toLowerCase();

  // First try exact matches
  for (const label of availableLabels) {
    const labelName = String(label.name).toLowerCase();
    if (labelName === categoryLower) {
      return label.id;
    }
  }

  // Then try fuzzy matching
  for (const label of availableLabels) {
    const labelName = String(label.name).toLowerCase();

    // Check if category contains label name or vice versa
    if (
      categoryLower.includes(labelName) ||
      labelName.includes(categoryLower)
    ) {
      return label.id;
    }

    // Check for word overlap (at least 60% of words match)
    const categoryWords = categoryLower.split(/\s+/);
    const labelWords = labelName.split(/\s+/);

    if (categoryWords.length > 0 && labelWords.length > 0) {
      const commonWords = categoryWords.filter((word) =>
        labelWords.some(
          (labelWord) => word.includes(labelWord) || labelWord.includes(word)
        )
      );

      const similarity =
        commonWords.length / Math.max(categoryWords.length, labelWords.length);
      if (similarity >= 0.6) {
        return label.id;
      }
    }
  }

  return null;
}

function getLabelColor(labelName: string): string {
  const colorMap: Record<string, string> = {
    // Negative/Problem labels - use red tones
    Bug: "#ff6b6b", // Red
    Error: "#ff6b6b", // Red
    Issue: "#ff6b6b", // Red
    Problem: "#ff6b6b", // Red
    Critical: "#e74c3c", // Darker red

    // UI/Design labels - use blue tones
    UI: "#74b9ff", // Light blue
    UX: "#74b9ff", // Light blue
    "User Experience": "#74b9ff", // Light blue
    Design: "#74b9ff", // Light blue
    Interface: "#74b9ff", // Light blue

    // Feature/Enhancement labels - use green tones
    Feature: "#00b894", // Teal green
    Enhancement: "#00b894", // Teal green
    Improvement: "#00b894", // Teal green
    "New Feature": "#00b894", // Teal green

    // Technical/Backend labels - use purple tones
    Backend: "#a29bfe", // Light purple
    API: "#a29bfe", // Light purple
    Database: "#a29bfe", // Light purple
    Server: "#a29bfe", // Light purple
    Integration: "#a29bfe", // Light purple

    // Communication labels - use orange tones
    "Email System": "#fd79a8", // Pink
    "Chat Feature": "#fd79a8", // Pink
    Notification: "#fd79a8", // Pink
    Communication: "#fd79a8", // Pink

    // Document/Data labels - use yellow tones
    "Document Management": "#fdcb6e", // Light orange
    Data: "#fdcb6e", // Light orange
    Information: "#fdcb6e", // Light orange
    Content: "#fdcb6e", // Light orange

    // Platform/System labels - use gray tones
    Platform: "#636e72", // Gray
    System: "#636e72", // Gray
    Infrastructure: "#636e72", // Gray

    // Security labels - use dark blue
    Security: "#2d3436", // Dark gray
    Auth: "#2d3436", // Dark gray
    Permission: "#2d3436", // Dark gray

    // Testing labels - use cyan
    Testing: "#00cec9", // Cyan
    QA: "#00cec9", // Cyan
    Test: "#00cec9", // Cyan

    // Mobile labels - use indigo
    Mobile: "#6c5ce7", // Indigo
    Responsive: "#6c5ce7", // Indigo
    App: "#6c5ce7", // Indigo

    // Branding labels - use magenta
    Branding: "#e84393", // Magenta
    Brand: "#e84393", // Magenta
    Identity: "#e84393", // Magenta

    // Invitation labels - use coral
    "Invitation System": "#ff7675", // Coral
    Invitation: "#ff7675", // Coral
    Invite: "#ff7675", // Coral
  };

  // Return mapped color or default pastel color
  return colorMap[labelName] || "#ddd6fe"; // Default light purple
}

async function createLinearLabel(
  name: string,
  teamId?: string
): Promise<string | null> {
  try {
    const color = getLabelColor(name);
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id name } } }`,
        variables: {
          input: {
            name,
            color,
            // teamId may not be required in Linear; include only if provided
            teamId: teamId || undefined,
          },
        },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const id = res.data?.data?.issueLabelCreate?.issueLabel?.id as
      | string
      | undefined;
    return id || null;
  } catch (err: any) {
    console.error(
      "  ❌ Failed to create label:",
      err.response?.data || err.message
    );
    return null;
  }
}

async function ensureCategoryLabelId(
  category: string,
  availableLabels: Array<{ id: string; name: string }>,
  teamId: string,
  createdCache: Map<string, string>
): Promise<string | null> {
  const preferredNamesByCategory: Record<string, string[]> = {
    Bug: ["Bug"],
    Improvement: ["Improvement", "Enhancement"],
    UI: ["UI", "UX", "Design"],
    Branding: ["Branding", "Brand"],
    "Invitation System": ["Invitation System", "Invitations"],
    "Email System": ["Email System", "Email"],
    "Chat Feature": ["Chat Feature", "Chat"],
    "Document Management": ["Document Management", "Documents"],
    Testing: ["Testing", "QA"],
    Platform: ["Platform", "System"],
    "User Experience": ["User Experience", "UX"],
    Security: ["Security", "Auth"],
    Backend: ["Backend", "API"],
    Mobile: ["Mobile", "Responsive"],
  };

  const preferred = preferredNamesByCategory[category];

  // Check cache first
  for (const name of preferred) {
    const cached = createdCache.get(name.toLowerCase());
    if (cached) return cached;
  }

  // Look for exact matches using preferred names
  const existingId = findLabelIdByPreferredNames(availableLabels, preferred);
  if (existingId) {
    console.log(`    🔍 Reusing existing label: "${category}"`);
    return existingId;
  }

  // Look for similar labels using fuzzy matching
  const similarId = findSimilarLabelId(category, availableLabels);
  if (similarId) {
    const similarLabel = availableLabels.find((l) => l.id === similarId);
    console.log(
      `    🔍 Reusing similar label: "${similarLabel?.name}" for "${category}"`
    );
    return similarId;
  }

  // Auto-create label for speed
  const createName = preferred[0];
  console.log(`    📋 Auto-creating label: "${createName}"`);

  const newId = await createLinearLabel(createName, teamId);
  if (newId) {
    availableLabels.push({ id: newId, name: createName });
    createdCache.set(createName.toLowerCase(), newId);
  }
  return newId;
}

/* ---------------- Create Issues in Linear ---------------- */
async function createLinearIssues(
  issues: any[],
  teamId: string,
  availableLabels: Array<{ id: string; name: string }>,
  sourceInfo: string
) {
  console.log("📬 Creating issues in Linear...");
  const createdLabelsCache = new Map<string, string>();
  let processedCount = 0;

  for (const issue of issues) {
    processedCount++;
    console.log(`  📝 Processing issue ${processedCount}/${issues.length}...`);

    try {
      const {
        title,
        description,
        priority,
        requirements,
        acceptanceCriteria,
        technicalNotes,
      } = sanitizeIssueForLinear(issue);

      if (!title) {
        console.warn("  ⏭️ Skipping issue with empty title");
        continue;
      }

      // Infer labels for the issue
      let labelIds = inferLabelIdsFromIssue(
        title,
        description,
        availableLabels
      );

      if (labelIds.length === 0) {
        const cats = inferCategories(title, description);
        for (const c of cats) {
          const id = await ensureCategoryLabelId(
            c,
            availableLabels,
            teamId,
            createdLabelsCache
          );
          if (id) labelIds.push(id);
          if (labelIds.length >= 3) break;
        }
      }

      // Build detailed requirements section
      const requirementsSection = buildRequirementsSection(
        requirements,
        acceptanceCriteria,
        technicalNotes
      );

      // Add source document reference
      const sourceSection = `## Source Document\nProcessed from: \`${sourceInfo}\``;

      const parts = [description, requirementsSection, sourceSection].filter(
        (p) => p && p.trim().length > 0
      );

      const finalDescription = parts.join("\n\n");

      console.log(`    📤 Creating Linear issue: "${title}"...`);
      const res = await axios.post(
        "https://api.linear.app/graphql",
        {
          query: `
            mutation($input: IssueCreateInput!) {
              issueCreate(input: $input) { success issue { id title } }
            }
          `,
          variables: {
            input: {
              teamId,
              title,
              description: finalDescription,
              priority,
              labelIds: labelIds.length ? labelIds : undefined,
            },
          },
        },
        {
          headers: {
            Authorization: LINEAR_KEY as string,
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 second timeout
        }
      );

      const issueId = res.data?.data?.issueCreate?.issue?.id;
      const created = res.data?.data?.issueCreate?.issue?.title;

      if (created && issueId) {
        console.log(`  ✅ Created issue: ${created}`);
      } else {
        const errors = res.data?.errors || res.data?.data?.issueCreate?.errors;
        if (errors) {
          console.error(
            "  ❌ Linear validation errors:",
            JSON.stringify(errors, null, 2)
          );
        } else {
          console.log("  ⚠️ Unexpected Linear response:", res.data);
        }
      }

      // Reduced delay between issues for faster processing
      if (processedCount < issues.length) {
        console.log(`    ⏳ Waiting 500ms before next issue...`);
        await sleep(500);
      }
    } catch (err: any) {
      console.error(
        "  ❌ Failed to create issue:",
        err.response?.data || err.message
      );
    }
  }

  console.log("✅ All issues processed");
}

/* ---------------- Input Selection ---------------- */
async function getRequirementsInput() {
  const inputType = await inquirer.prompt([
    {
      type: "list",
      name: "inputType",
      message: "How would you like to provide the requirements?",
      choices: [
        { name: "📄 Upload a file (.md, .txt, .pdf)", value: "file" },
        { name: "📝 Paste text directly", value: "text" },
      ],
    },
  ]);

  if (inputType.inputType === "file") {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "filePath",
        message:
          "Enter the path to your requirements document (drag & drop here):",
        validate: (input) => {
          const clean = sanitizePath(input);
          if (!fs.existsSync(clean)) return `File not found: ${clean}`;
          const ext = path.extname(clean).toLowerCase();
          if (![".md", ".txt", ".pdf"].includes(ext))
            return "Please provide a valid document file (.md, .txt, .pdf)";
          return true;
        },
      },
    ]);
    return { type: "file", path: sanitizePath(answers.filePath) };
  } else {
    const textInputMethod = await inquirer.prompt([
      {
        type: "list",
        name: "method",
        message: "How would you like to enter the text?",
        choices: [
          { name: "📝 Type/paste directly in terminal", value: "direct" },
          { name: "📄 Open in external editor", value: "editor" },
        ],
      },
    ]);

    if (textInputMethod.method === "direct") {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "textContent",
          message: "Paste your requirements text here (press Enter when done):",
          validate: (input) => {
            if (!input || input.trim().length < 50) {
              return "Please provide at least 50 characters of requirements text";
            }
            return true;
          },
        },
      ]);
      return { type: "text", content: answers.textContent };
    } else {
      const answers = await inquirer.prompt([
        {
          type: "editor",
          name: "textContent",
          message:
            "Paste your requirements text (opens in your default editor):",
          default:
            "# Requirements Document\n\n## Overview\n\n## Features\n\n## Technical Requirements\n\n## Acceptance Criteria\n\n",
          validate: (input) => {
            if (!input || input.trim().length < 50) {
              return "Please provide at least 50 characters of requirements text";
            }
            return true;
          },
        },
      ]);
      return { type: "text", content: answers.textContent };
    }
  }
}

/* ---------------- Main Flow ---------------- */
if (require.main === module) {
  (async () => {
    try {
      console.log("📋 Requirements to Linear Issues Tool");
      console.log("=====================================");

      const selectedTeamId = await selectLinearTeam();
      const labels = await fetchLinearLabels(selectedTeamId);

      const input = await getRequirementsInput();

      let documentContent: string;
      let sourceInfo: string;

      if (input.type === "file") {
        documentContent = await parseRequirementsDocument(input.path);
        sourceInfo = `file: ${path.basename(input.path)}`;
      } else {
        documentContent = input.content;
        sourceInfo = "pasted text";
        console.log(`📊 Text size: ${documentContent.length} characters`);
      }

      const parentIssues = await summarizeRequirementsToIssues(documentContent);

      // Generate sub-issues for each parent issue
      const subIssues = await generateSubIssues(parentIssues);

      // Combine parent and sub-issues
      const allIssues = [...parentIssues, ...subIssues];

      // Save issues to file for reference
      const outputFile = `requirements-issues-${Date.now()}.json`;
      fs.writeFileSync(outputFile, JSON.stringify(allIssues, null, 2));
      console.log(`💾 Saved parsed issues to ${outputFile}`);

      await createLinearIssues(allIssues, selectedTeamId, labels, sourceInfo);

      console.log(
        "\n🎉 Done! Requirements parsed and issues created in Linear."
      );
    } catch (err: any) {
      console.error("\n❌ FATAL ERROR:", err.response?.data || err.message);
      console.error("🔍 Full stack:", err.stack);
    }
  })();
}
