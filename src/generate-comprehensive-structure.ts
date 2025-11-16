/**
 * generate-comprehensive-structure
 * --------------------------------
 * Generates a comprehensive ScheduleApp requirements structure with all systems,
 * modules, and detailed specifications for AI agent implementation
 */

import axios from "axios";
import * as fs from "fs";
import * as dotenv from "dotenv";
import inquirer from "inquirer";

dotenv.config();

const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();

if (!LINEAR_KEY || !OPENAI_KEY) {
  console.error("❌ Missing required .env values:");
  if (!LINEAR_KEY) console.error("  - LINEAR_API_KEY missing");
  if (!OPENAI_KEY) console.error("  - OPENAI_API_KEY missing");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Team Selection ---------------- */
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

async function selectTeam(message: string) {
  const teams = await fetchLinearTeams();
  if (!teams.length) {
    throw new Error("No Linear teams available");
  }

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "teamId",
      message,
      choices: teams.map((t: any) => ({
        name: `${t.name} (${t.key})`,
        value: t.id,
      })),
    },
  ]);
  return answers.teamId as string;
}

/* ---------------- Label Management ---------------- */
async function fetchLinearLabels(teamId: string) {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query($id: String!) { 
          team(id: $id) { 
            labels { 
              nodes { 
                id 
                name 
                color 
              } 
            } 
          } 
        }`,
        variables: { id: teamId },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    return res.data?.data?.team?.labels?.nodes || [];
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch labels:",
      err.response?.data || err.message
    );
    return [];
  }
}

function getLabelColor(labelName: string): string {
  const colorMap: Record<string, string> = {
    // Version labels
    V1: "#00b894", // Teal green
    "V1.1": "#00b894", // Teal green
    V2: "#00b894", // Teal green
    V3: "#00b894", // Teal green

    // Priority labels
    Critical: "#e74c3c", // Red
    High: "#f39c12", // Orange
    Medium: "#f1c40f", // Yellow
    Low: "#95a5a6", // Gray

    // System labels
    "User Management": "#74b9ff", // Blue
    "Payment Processing": "#a29bfe", // Purple
    "Class Management": "#fd79a8", // Pink
    "Scheduling System": "#fdcb6e", // Orange
    "Notification System": "#00cec9", // Cyan
    "Analytics System": "#6c5ce7", // Indigo
    "Security System": "#2d3436", // Dark gray

    // Technical labels
    Backend: "#636e72", // Gray
    Frontend: "#74b9ff", // Blue
    Database: "#a29bfe", // Purple
    API: "#fd79a8", // Pink
    Testing: "#00cec9", // Cyan
    Documentation: "#fdcb6e", // Orange
  };

  return colorMap[labelName] || "#ddd6fe"; // Default light purple
}

async function createLinearLabel(
  name: string,
  teamId: string
): Promise<string | null> {
  try {
    const color = getLabelColor(name);
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `mutation($input: IssueLabelCreateInput!) { 
          issueLabelCreate(input: $input) { 
            issueLabel { 
              id 
              name 
            } 
          } 
        }`,
        variables: {
          input: {
            name,
            color,
            teamId,
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
    return res.data?.data?.issueLabelCreate?.issueLabel?.id;
  } catch (err: any) {
    console.error(
      `❌ Failed to create label "${name}":`,
      err.response?.data || err.message
    );
    return null;
  }
}

async function ensureLabelExists(
  name: string,
  teamId: string,
  availableLabels: any[]
): Promise<string | null> {
  // Check if label already exists
  const existing = availableLabels.find((l) => l.name === name);
  if (existing) {
    return existing.id;
  }

  // Create new label
  console.log(`  📋 Creating label: "${name}"`);
  const newId = await createLinearLabel(name, teamId);
  if (newId) {
    availableLabels.push({ id: newId, name });
    console.log(`  ✅ Created label: "${name}"`);
  }
  return newId;
}

/* ---------------- Comprehensive Structure Definition ---------------- */
function getComprehensiveScheduleAppStructure() {
  return {
    "V1 Core System": {
      "User Management System": {
        description:
          "Complete user authentication, registration, and profile management system",
        subIssues: [
          {
            title: "User Registration Module",
            description:
              "Handle user signup, email verification, and account creation",
            requirements: [
              "User registration form with validation",
              "Email verification system",
              "Password strength requirements",
              "Account activation workflow",
              "Duplicate email prevention",
            ],
            acceptanceCriteria: [
              "Users can register with valid email and password",
              "Verification emails are sent successfully",
              "Invalid inputs show appropriate error messages",
              "Duplicate emails are rejected",
              "Account activation works correctly",
            ],
            technicalNotes: [
              "Use bcrypt for password hashing",
              "Implement email verification tokens",
              "Add rate limiting for registration attempts",
              "Store user data in PostgreSQL",
              "Include comprehensive validation",
            ],
          },
          {
            title: "Authentication Module",
            description: "Secure login, logout, and session management",
            requirements: [
              "Secure login system",
              "JWT token management",
              "Session timeout handling",
              "Password reset functionality",
              "Multi-factor authentication support",
            ],
            acceptanceCriteria: [
              "Users can login with correct credentials",
              "Invalid credentials are rejected",
              "Sessions expire after inactivity",
              "Password reset emails work",
              "JWT tokens are properly managed",
            ],
            technicalNotes: [
              "Implement JWT for session management",
              "Add refresh token rotation",
              "Include rate limiting for login attempts",
              "Store sessions in Redis",
              "Add comprehensive logging",
            ],
          },
          {
            title: "Profile Management Module",
            description: "User profile updates, preferences, and settings",
            requirements: [
              "Profile editing interface",
              "Avatar upload functionality",
              "Privacy settings management",
              "Notification preferences",
              "Account deletion option",
            ],
            acceptanceCriteria: [
              "Users can update profile information",
              "Avatar uploads work correctly",
              "Privacy settings are enforced",
              "Notification preferences are saved",
              "Account deletion is secure",
            ],
            technicalNotes: [
              "Implement file upload for avatars",
              "Add image compression and validation",
              "Store preferences in user table",
              "Include audit logging",
              "Add data export functionality",
            ],
          },
          {
            title: "Role-Based Access Control Module",
            description: "User roles, permissions, and access management",
            requirements: [
              "Role definition system",
              "Permission management",
              "Access control enforcement",
              "Role assignment interface",
              "Audit trail for access",
            ],
            acceptanceCriteria: [
              "Roles are properly defined",
              "Permissions are enforced correctly",
              "Access control works as expected",
              "Role assignments are tracked",
              "Audit trail is comprehensive",
            ],
            technicalNotes: [
              "Implement RBAC middleware",
              "Store roles and permissions in database",
              "Add permission checking utilities",
              "Include audit logging",
              "Add role hierarchy support",
            ],
          },
        ],
      },
      "Class Management System": {
        description:
          "Complete class creation, management, and organization system",
        subIssues: [
          {
            title: "Class Creation Module",
            description:
              "Create and configure new classes with detailed settings",
            requirements: [
              "Class creation form",
              "Class configuration options",
              "Template system for classes",
              "Class validation and rules",
              "Instructor assignment",
            ],
            acceptanceCriteria: [
              "Classes can be created successfully",
              "All configuration options work",
              "Templates are applied correctly",
              "Validation prevents invalid classes",
              "Instructor assignment works",
            ],
            technicalNotes: [
              "Implement class validation rules",
              "Add template management system",
              "Store class data in PostgreSQL",
              "Include instructor relationship",
              "Add class status management",
            ],
          },
          {
            title: "Class Scheduling Module",
            description:
              "Schedule classes, manage time slots, and handle conflicts",
            requirements: [
              "Class scheduling interface",
              "Time slot management",
              "Conflict detection system",
              "Recurring class support",
              "Schedule optimization",
            ],
            acceptanceCriteria: [
              "Classes can be scheduled correctly",
              "Time conflicts are detected",
              "Recurring classes work properly",
              "Schedule optimization functions",
              "Time slots are managed correctly",
            ],
            technicalNotes: [
              "Implement conflict detection algorithm",
              "Add recurring pattern support",
              "Store schedules in database",
              "Include timezone handling",
              "Add schedule validation",
            ],
          },
          {
            title: "Class Enrollment Module",
            description:
              "Handle student enrollment, waitlists, and capacity management",
            requirements: [
              "Student enrollment system",
              "Waitlist management",
              "Capacity tracking",
              "Enrollment validation",
              "Enrollment notifications",
            ],
            acceptanceCriteria: [
              "Students can enroll in classes",
              "Waitlists are managed correctly",
              "Capacity limits are enforced",
              "Enrollment validation works",
              "Notifications are sent properly",
            ],
            technicalNotes: [
              "Implement enrollment validation",
              "Add waitlist queue management",
              "Store enrollment data",
              "Include capacity tracking",
              "Add notification system",
            ],
          },
          {
            title: "Class Content Management Module",
            description: "Manage class materials, assignments, and resources",
            requirements: [
              "Content upload system",
              "Assignment management",
              "Resource organization",
              "Content versioning",
              "Access control for content",
            ],
            acceptanceCriteria: [
              "Content can be uploaded successfully",
              "Assignments are managed properly",
              "Resources are organized correctly",
              "Versioning works as expected",
              "Access control is enforced",
            ],
            technicalNotes: [
              "Implement file upload system",
              "Add content versioning",
              "Store content metadata",
              "Include access control",
              "Add content search functionality",
            ],
          },
        ],
      },
      "Scheduling System": {
        description:
          "Advanced scheduling engine with conflict resolution and optimization",
        subIssues: [
          {
            title: "Schedule Engine Module",
            description: "Core scheduling algorithm with conflict resolution",
            requirements: [
              "Advanced scheduling algorithm",
              "Conflict resolution system",
              "Schedule optimization",
              "Constraint handling",
              "Performance optimization",
            ],
            acceptanceCriteria: [
              "Scheduling algorithm works correctly",
              "Conflicts are resolved properly",
              "Optimization improves schedules",
              "Constraints are handled",
              "Performance is acceptable",
            ],
            technicalNotes: [
              "Implement constraint satisfaction algorithm",
              "Add conflict resolution logic",
              "Optimize for performance",
              "Include caching mechanisms",
              "Add monitoring and logging",
            ],
          },
          {
            title: "Calendar Integration Module",
            description: "Integrate with external calendar systems",
            requirements: [
              "Google Calendar integration",
              "Outlook integration",
              "iCal export functionality",
              "Calendar synchronization",
              "Event management",
            ],
            acceptanceCriteria: [
              "Google Calendar sync works",
              "Outlook integration functions",
              "iCal exports are correct",
              "Synchronization is reliable",
              "Events are managed properly",
            ],
            technicalNotes: [
              "Implement OAuth for calendar APIs",
              "Add synchronization logic",
              "Handle calendar conflicts",
              "Include error handling",
              "Add retry mechanisms",
            ],
          },
          {
            title: "Availability Management Module",
            description: "Manage instructor and resource availability",
            requirements: [
              "Availability tracking system",
              "Resource scheduling",
              "Availability conflicts",
              "Recurring availability",
              "Availability notifications",
            ],
            acceptanceCriteria: [
              "Availability is tracked correctly",
              "Resource scheduling works",
              "Conflicts are detected",
              "Recurring patterns work",
              "Notifications are sent",
            ],
            technicalNotes: [
              "Implement availability tracking",
              "Add conflict detection",
              "Store availability data",
              "Include notification system",
              "Add availability validation",
            ],
          },
          {
            title: "Schedule Optimization Module",
            description:
              "Optimize schedules for efficiency and user satisfaction",
            requirements: [
              "Schedule optimization algorithm",
              "User preference consideration",
              "Resource utilization optimization",
              "Performance metrics",
              "Optimization reporting",
            ],
            acceptanceCriteria: [
              "Optimization algorithm works",
              "User preferences are considered",
              "Resource utilization is optimized",
              "Performance metrics are accurate",
              "Reports are generated correctly",
            ],
            technicalNotes: [
              "Implement optimization algorithms",
              "Add preference weighting",
              "Include performance metrics",
              "Add reporting functionality",
              "Optimize for scalability",
            ],
          },
        ],
      },
    },
    "V1.1 Payment System": {
      "Payment Processing System": {
        description:
          "Complete payment processing with multiple providers and security",
        subIssues: [
          {
            title: "Stripe Integration Module",
            description: "Integrate with Stripe for payment processing",
            requirements: [
              "Stripe API integration",
              "Payment form handling",
              "Webhook processing",
              "Error handling",
              "Security compliance",
            ],
            acceptanceCriteria: [
              "Stripe payments process correctly",
              "Payment forms work properly",
              "Webhooks are processed",
              "Errors are handled gracefully",
              "Security standards are met",
            ],
            technicalNotes: [
              "Implement Stripe SDK",
              "Add webhook verification",
              "Include error handling",
              "Add payment logging",
              "Ensure PCI compliance",
            ],
          },
          {
            title: "PayPal Integration Module",
            description:
              "Integrate with PayPal for alternative payment processing",
            requirements: [
              "PayPal API integration",
              "Payment flow handling",
              "Webhook processing",
              "Error handling",
              "Security compliance",
            ],
            acceptanceCriteria: [
              "PayPal payments process correctly",
              "Payment flows work properly",
              "Webhooks are processed",
              "Errors are handled gracefully",
              "Security standards are met",
            ],
            technicalNotes: [
              "Implement PayPal SDK",
              "Add webhook verification",
              "Include error handling",
              "Add payment logging",
              "Ensure security compliance",
            ],
          },
          {
            title: "Transaction Management Module",
            description: "Manage transactions, refunds, and payment history",
            requirements: [
              "Transaction tracking",
              "Refund processing",
              "Payment history",
              "Transaction reporting",
              "Audit trail",
            ],
            acceptanceCriteria: [
              "Transactions are tracked correctly",
              "Refunds process successfully",
              "Payment history is accurate",
              "Reports are generated",
              "Audit trail is complete",
            ],
            technicalNotes: [
              "Implement transaction database",
              "Add refund processing logic",
              "Include audit logging",
              "Add reporting functionality",
              "Ensure data integrity",
            ],
          },
          {
            title: "Payment Security Module",
            description: "Ensure payment security and fraud prevention",
            requirements: [
              "Fraud detection system",
              "Security monitoring",
              "Encryption implementation",
              "Compliance reporting",
              "Security auditing",
            ],
            acceptanceCriteria: [
              "Fraud detection works",
              "Security monitoring functions",
              "Encryption is implemented",
              "Compliance reports are accurate",
              "Security audits pass",
            ],
            technicalNotes: [
              "Implement fraud detection",
              "Add security monitoring",
              "Include encryption",
              "Add compliance reporting",
              "Ensure security standards",
            ],
          },
        ],
      },
    },
    "V2 Advanced Features": {
      "Notification System": {
        description: "Comprehensive notification system with multiple channels",
        subIssues: [
          {
            title: "Email Notification Module",
            description: "Send email notifications for various events",
            requirements: [
              "Email template system",
              "Notification triggers",
              "Email delivery tracking",
              "Unsubscribe functionality",
              "Email analytics",
            ],
            acceptanceCriteria: [
              "Email templates render correctly",
              "Notifications are triggered properly",
              "Delivery tracking works",
              "Unsubscribe functions work",
              "Analytics are accurate",
            ],
            technicalNotes: [
              "Implement email service",
              "Add template engine",
              "Include delivery tracking",
              "Add unsubscribe handling",
              "Include analytics",
            ],
          },
          {
            title: "SMS Notification Module",
            description: "Send SMS notifications for urgent events",
            requirements: [
              "SMS service integration",
              "SMS template system",
              "Delivery tracking",
              "Opt-out functionality",
              "SMS analytics",
            ],
            acceptanceCriteria: [
              "SMS messages are sent correctly",
              "Templates are applied properly",
              "Delivery tracking works",
              "Opt-out functions work",
              "Analytics are accurate",
            ],
            technicalNotes: [
              "Implement SMS service",
              "Add template system",
              "Include delivery tracking",
              "Add opt-out handling",
              "Include analytics",
            ],
          },
          {
            title: "Push Notification Module",
            description: "Send push notifications to mobile devices",
            requirements: [
              "Push notification service",
              "Device token management",
              "Notification scheduling",
              "Delivery tracking",
              "Push analytics",
            ],
            acceptanceCriteria: [
              "Push notifications are sent",
              "Device tokens are managed",
              "Scheduling works correctly",
              "Delivery tracking functions",
              "Analytics are accurate",
            ],
            technicalNotes: [
              "Implement push service",
              "Add device token management",
              "Include scheduling logic",
              "Add delivery tracking",
              "Include analytics",
            ],
          },
          {
            title: "In-App Notification Module",
            description: "Display notifications within the application",
            requirements: [
              "In-app notification system",
              "Notification display",
              "Notification management",
              "User preferences",
              "Notification analytics",
            ],
            acceptanceCriteria: [
              "Notifications display correctly",
              "Management functions work",
              "User preferences are respected",
              "Analytics are accurate",
              "Performance is acceptable",
            ],
            technicalNotes: [
              "Implement notification system",
              "Add display components",
              "Include management logic",
              "Add preference handling",
              "Include analytics",
            ],
          },
        ],
      },
      "Analytics System": {
        description: "Comprehensive analytics and reporting system",
        subIssues: [
          {
            title: "Data Collection Module",
            description: "Collect and store analytics data",
            requirements: [
              "Event tracking system",
              "Data collection pipeline",
              "Data storage optimization",
              "Privacy compliance",
              "Data validation",
            ],
            acceptanceCriteria: [
              "Events are tracked correctly",
              "Data pipeline functions",
              "Storage is optimized",
              "Privacy compliance is met",
              "Data validation works",
            ],
            technicalNotes: [
              "Implement event tracking",
              "Add data pipeline",
              "Optimize storage",
              "Include privacy controls",
              "Add validation logic",
            ],
          },
          {
            title: "Reporting Dashboard Module",
            description: "Create interactive reporting dashboards",
            requirements: [
              "Dashboard interface",
              "Chart components",
              "Data visualization",
              "Interactive features",
              "Export functionality",
            ],
            acceptanceCriteria: [
              "Dashboard displays correctly",
              "Charts render properly",
              "Visualizations are accurate",
              "Interactive features work",
              "Export functions work",
            ],
            technicalNotes: [
              "Implement dashboard UI",
              "Add chart components",
              "Include visualization logic",
              "Add interactive features",
              "Include export functionality",
            ],
          },
          {
            title: "Performance Analytics Module",
            description: "Track system performance and user behavior",
            requirements: [
              "Performance monitoring",
              "User behavior tracking",
              "Performance metrics",
              "Alerting system",
              "Performance reporting",
            ],
            acceptanceCriteria: [
              "Performance is monitored",
              "User behavior is tracked",
              "Metrics are accurate",
              "Alerts are triggered",
              "Reports are generated",
            ],
            technicalNotes: [
              "Implement monitoring",
              "Add behavior tracking",
              "Include metrics collection",
              "Add alerting system",
              "Include reporting",
            ],
          },
          {
            title: "Business Intelligence Module",
            description: "Generate business insights and recommendations",
            requirements: [
              "Business metrics tracking",
              "Insight generation",
              "Recommendation engine",
              "Trend analysis",
              "Business reporting",
            ],
            acceptanceCriteria: [
              "Business metrics are tracked",
              "Insights are generated",
              "Recommendations are accurate",
              "Trend analysis works",
              "Reports are comprehensive",
            ],
            technicalNotes: [
              "Implement metrics tracking",
              "Add insight generation",
              "Include recommendation engine",
              "Add trend analysis",
              "Include business reporting",
            ],
          },
        ],
      },
    },
  };
}

/* ---------------- Project Creation ---------------- */
async function createLinearProject(
  name: string,
  description: string,
  teamId: string
): Promise<string | null> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `mutation($input: ProjectCreateInput!) { 
          projectCreate(input: $input) { 
            project { 
              id 
              name 
            } 
          } 
        }`,
        variables: {
          input: {
            name,
            description,
            teamIds: [teamId],
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
    return res.data?.data?.projectCreate?.project?.id;
  } catch (err: any) {
    console.error(
      `❌ Failed to create project "${name}":`,
      err.response?.data || err.message
    );
    return null;
  }
}

/* ---------------- Issue Creation ---------------- */
async function createLinearIssue(
  issueData: any,
  teamId: string,
  labelIds: string[],
  projectId?: string,
  parentId?: string
) {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `mutation($input: IssueCreateInput!) { 
          issueCreate(input: $input) { 
            issue { 
              id 
              title 
            } 
          } 
        }`,
        variables: {
          input: {
            teamId,
            title: issueData.title,
            description: issueData.description,
            priority: issueData.priority || 2,
            labelIds: labelIds.length ? labelIds : undefined,
            projectId: projectId || undefined,
            parentId: parentId || undefined,
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
    return res.data?.data?.issueCreate?.issue?.id;
  } catch (err: any) {
    console.error(
      `❌ Failed to create issue "${issueData.title}":`,
      err.response?.data || err.message
    );
    return null;
  }
}

function buildIssueDescription(issueData: any): string {
  const sections: string[] = [];

  sections.push(issueData.description);

  if (issueData.requirements && issueData.requirements.length > 0) {
    sections.push("## Requirements");
    issueData.requirements.forEach((req: string, i: number) => {
      sections.push(`${i + 1}. ${req}`);
    });
  }

  if (issueData.acceptanceCriteria && issueData.acceptanceCriteria.length > 0) {
    sections.push("## Acceptance Criteria");
    issueData.acceptanceCriteria.forEach((criteria: string, i: number) => {
      sections.push(`${i + 1}. ${criteria}`);
    });
  }

  if (issueData.technicalNotes && issueData.technicalNotes.length > 0) {
    sections.push("## Technical Notes");
    issueData.technicalNotes.forEach((note: string, i: number) => {
      sections.push(`${i + 1}. ${note}`);
    });
  }

  return sections.join("\n\n");
}

/* ---------------- Main Generation Flow ---------------- */
async function generateComprehensiveStructure() {
  try {
    console.log("🏗️ Comprehensive ScheduleApp Structure Generator");
    console.log("==============================================");

    const teamId = await selectTeam("Select team to create structure in:");
    const availableLabels = await fetchLinearLabels(teamId);

    console.log("\n📋 Creating version labels...");
    const versionLabels = ["V1", "V1.1", "V2"];
    const versionLabelIds: string[] = [];

    for (const version of versionLabels) {
      const labelId = await ensureLabelExists(version, teamId, availableLabels);
      if (labelId) versionLabelIds.push(labelId);
      await sleep(200);
    }

    console.log("\n📋 Creating priority labels...");
    const priorityLabels = ["Critical", "High", "Medium", "Low"];
    const priorityLabelIds: string[] = [];

    for (const priority of priorityLabels) {
      const labelId = await ensureLabelExists(
        priority,
        teamId,
        availableLabels
      );
      if (labelId) priorityLabelIds.push(labelId);
      await sleep(200);
    }

    console.log("\n📋 Creating system labels...");
    const systemLabels = [
      "User Management",
      "Payment Processing",
      "Class Management",
      "Scheduling System",
      "Notification System",
      "Analytics System",
    ];
    const systemLabelIds: string[] = [];

    for (const system of systemLabels) {
      const labelId = await ensureLabelExists(system, teamId, availableLabels);
      if (labelId) systemLabelIds.push(labelId);
      await sleep(200);
    }

    console.log("\n📋 Creating technical labels...");
    const technicalLabels = [
      "Backend",
      "Frontend",
      "Database",
      "API",
      "Testing",
      "Documentation",
    ];
    const technicalLabelIds: string[] = [];

    for (const technical of technicalLabels) {
      const labelId = await ensureLabelExists(
        technical,
        teamId,
        availableLabels
      );
      if (labelId) technicalLabelIds.push(labelId);
      await sleep(200);
    }

    console.log("\n🏗️ Creating projects for each phase...");
    const projectMap = new Map<string, string>();

    // Create projects for each phase
    const projects = [
      {
        name: "V1 Core System",
        description:
          "Core functionality including user management, class management, and scheduling system. This phase establishes the foundation of the ScheduleApp platform with essential features for user registration, authentication, class creation, enrollment, and basic scheduling capabilities.",
      },
      {
        name: "V1.1 Payment System",
        description:
          "Payment processing integration with Stripe and PayPal. This phase adds comprehensive payment functionality including transaction management, refund processing, and security features to enable monetization of the platform.",
      },
      {
        name: "V2 Advanced Features",
        description:
          "Advanced features including notification system and analytics. This phase adds sophisticated features like multi-channel notifications (email, SMS, push, in-app) and comprehensive analytics with reporting dashboards and business intelligence.",
      },
    ];

    for (const project of projects) {
      console.log(`  📁 Creating project: "${project.name}"`);
      const projectId = await createLinearProject(
        project.name,
        project.description,
        teamId
      );
      if (projectId) {
        projectMap.set(project.name, projectId);
        console.log(`  ✅ Created project: "${project.name}"`);
      }
      await sleep(500);
    }

    console.log("\n🏗️ Generating comprehensive structure...");
    const structure = getComprehensiveScheduleAppStructure();
    let totalIssues = 0;

    for (const [version, systems] of Object.entries(structure)) {
      console.log(`\n📦 Processing ${version}...`);
      const projectId = projectMap.get(version);

      for (const [systemName, systemData] of Object.entries(systems)) {
        console.log(`\n  🏢 Creating ${systemName}...`);

        // Create parent issue
        const parentIssue = {
          title: `[${version}] ${systemName}`,
          description: systemData.description,
          priority:
            version === "V1 Core System"
              ? 3
              : version === "V1.1 Payment System"
              ? 2
              : 1,
        };

        const parentDescription = buildIssueDescription(parentIssue);
        const parentIssueId = await createLinearIssue(
          { ...parentIssue, description: parentDescription },
          teamId,
          [versionLabelIds[0], systemLabelIds[0], priorityLabelIds[0]],
          projectId
        );

        if (parentIssueId) {
          console.log(`    ✅ Created parent: ${parentIssue.title}`);
          totalIssues++;
        }

        await sleep(500);

        // Create sub-issues linked to parent
        for (const subIssue of systemData.subIssues) {
          const subIssueData = {
            title: subIssue.title, // Remove version prefix for cleaner hierarchy
            description: subIssue.description,
            priority: 2,
          };

          const subDescription = buildIssueDescription(subIssue);
          const subIssueId = await createLinearIssue(
            { ...subIssueData, description: subDescription },
            teamId,
            [versionLabelIds[0], systemLabelIds[0], priorityLabelIds[1]],
            projectId,
            parentIssueId // Link to parent issue
          );

          if (subIssueId) {
            console.log(
              `    ✅ Created sub-issue: ${subIssueData.title} (linked to parent)`
            );
            totalIssues++;
          }

          await sleep(500);
        }
      }
    }

    console.log(`\n🎉 Comprehensive structure created successfully!`);
    console.log(`📊 Summary:`);
    console.log(`  - Projects created: ${projects.length}`);
    console.log(`  - Total issues created: ${totalIssues}`);
    console.log(`  - Version labels: ${versionLabels.length}`);
    console.log(`  - System labels: ${systemLabels.length}`);
    console.log(`  - Technical labels: ${technicalLabels.length}`);
    console.log(`  - Priority labels: ${priorityLabels.length}`);
  } catch (err: any) {
    console.error("\n❌ Structure generation failed:", err.message);
  }
}

/* ---------------- CLI Entry Point ---------------- */
if (require.main === module) {
  generateComprehensiveStructure();
}
