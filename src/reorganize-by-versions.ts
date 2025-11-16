import { LinearClient } from "@linear/sdk";
import inquirer from "inquirer";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Reorganizes a Linear team to use:
 * - Projects named with version numbers (V1.0, V1.1, V2.0)
 * - Milestones numbered within projects (1.1, 1.2, 1.3)
 * - Clear ordering for Cursor Agent
 */

interface ProjectPlan {
  name: string;
  version: string; // e.g., "1.0", "1.1", "2.0"
  milestones: string[]; // e.g., ["1.1", "1.2", "1.3"]
  issueIdentifiers: string[]; // Issues to move to this project
}

async function main() {
  const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

  console.log("\n🔄 Reorganize Team by Version Numbers");
  console.log("=".repeat(60) + "\n");

  // Select team
  const teams = await linear.teams();
  const { teamId } = await inquirer.prompt([
    {
      type: "list",
      name: "teamId",
      message: "Select team to reorganize:",
      choices: teams.nodes.map((t) => ({
        name: `${t.name} (${t.key})`,
        value: t.id,
      })),
    },
  ]);

  const team = await linear.team(teamId);
  console.log(`\n✅ Selected: ${team.name}\n`);

  // Get current projects and issues
  const projects = await team.projects();
  const allIssues = await linear.issues({
    filter: { team: { id: { eq: teamId } } },
    first: 500,
  });

  console.log(`📊 Current state:`);
  console.log(`   Projects: ${projects.nodes.length}`);
  console.log(`   Issues: ${allIssues.nodes.length}\n`);

  // Show current projects
  console.log("📁 Current projects:");
  for (const project of projects.nodes) {
    const projectIssues = await linear.issues({
      filter: { project: { id: { eq: project.id } } },
      first: 250,
    });
    console.log(`   - ${project.name}: ${projectIssues.nodes.length} issues`);
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "\nWhat would you like to do?",
      choices: [
        {
          name: "Rename existing projects with version numbers",
          value: "rename",
        },
        {
          name: "Create new versioned project structure",
          value: "create",
        },
        { name: "Cancel", value: "cancel" },
      ],
    },
  ]);

  if (action === "cancel") {
    console.log("❌ Cancelled");
    return;
  }

  if (action === "rename") {
    await renameExistingProjects(linear, teamId, projects.nodes);
  } else if (action === "create") {
    await createVersionedStructure(linear, teamId);
  }

  console.log("\n✅ Reorganization complete!");
  console.log("\n💡 Next steps:");
  console.log("   1. Review projects in Linear");
  console.log("   2. Assign first project (V1.0) to Cursor Agent");
  console.log("   3. Complete it before moving to V1.1, then V2.0, etc.\n");
}

async function renameExistingProjects(
  linear: LinearClient,
  teamId: string,
  projects: any[],
) {
  console.log("\n🔄 Renaming existing projects...\n");

  // Sort projects by existing name/order
  const sortedProjects = projects.sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < sortedProjects.length; i++) {
    const project = sortedProjects[i];

    // Determine version number
    let version: string;
    if (i === 0) {
      version = "1.0";
    } else if (i < 3) {
      version = `1.${i}`;
    } else {
      version = `${Math.floor(i / 3) + 1}.0`;
    }

    // Extract core name (remove version if already present)
    const coreName = project.name.replace(/^V[\d.]+\s*-?\s*/i, "");

    const newName = `V${version} - ${coreName}`;

    console.log(`📝 ${project.name} → ${newName}`);

    try {
      await linear.updateProject(project.id, { name: newName });
    } catch (error: any) {
      console.error(`   ⚠️  Failed: ${error.message}`);
    }
  }

  console.log("\n✅ Projects renamed!");
}

async function createVersionedStructure(linear: LinearClient, teamId: string) {
  console.log("\n📋 Creating version-based project structure...\n");

  // Example structure - customize this based on your needs
  const projectPlans: ProjectPlan[] = [
    {
      name: "Foundation",
      version: "1.0",
      milestones: ["1.1 Setup", "1.2 Database", "1.3 Auth"],
      issueIdentifiers: [],
    },
    {
      name: "Core Features",
      version: "1.1",
      milestones: [
        "1.1 User Management",
        "1.2 Class Management",
        "1.3 Scheduling",
      ],
      issueIdentifiers: [],
    },
    {
      name: "Advanced Features",
      version: "2.0",
      milestones: ["2.1 Analytics", "2.2 Integrations", "2.3 AI Features"],
      issueIdentifiers: [],
    },
  ];

  for (const plan of projectPlans) {
    const projectName = `V${plan.version} - ${plan.name}`;
    console.log(`\n📁 Creating: ${projectName}`);

    try {
      const projectPayload = await linear.createProject({
        name: projectName,
        description: `Version ${plan.version} - Complete before moving to next version`,
        teamIds: [teamId],
        state: "planned",
      });

      const project = await projectPayload.project;

      if (project) {
        console.log(`   ✅ Created project`);

        // Create milestones
        for (const milestoneName of plan.milestones) {
          try {
            await linear.createMilestone({
              name: milestoneName,
              projectIds: [project.id],
            });
            console.log(`      📍 Milestone: ${milestoneName}`);
          } catch (error: any) {
            console.error(`      ⚠️  Milestone failed: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
