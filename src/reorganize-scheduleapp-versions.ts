import { LinearClient } from "@linear/sdk";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

  console.log("\n🔄 Reorganize ScheduleApp with Version Numbers");
  console.log("=".repeat(60) + "\n");

  // Find ScheduleApp team
  const teams = await linear.teams();
  const scheduleApp = teams.nodes.find(
    (t: any) => t.name === "ScheduleApp" && t.key === "SCH",
  );

  if (!scheduleApp) {
    console.error("❌ ScheduleApp team not found");
    process.exit(1);
  }

  console.log(`✅ Found: ${scheduleApp.name} (${scheduleApp.key})\n`);

  // Get current projects
  const team = await linear.team(scheduleApp.id);
  const projects = await team.projects();

  console.log(`📊 Current projects (${projects.nodes.length}):`);
  for (const project of projects.nodes) {
    console.log(`   - ${project.name}`);
  }

  console.log("\n🔄 Renaming to version numbers...\n");

  // Define the version mapping based on current project names
  const versionMap: Record<string, string> = {
    "V1 Foundation Setup": "V1.0",
    "V1 Class Management": "V1.1",
    "V1 Scheduling Engine": "V1.2",
    "V1 System Integration": "V1.3",
    "V1 Parent & Family Features": "V1.4",
    "V1 Persona & Permissions": "V1.5",
    "V1.1 Payment System": "V1.6",
    "V2 Advanced Features": "V2.0",
  };

  // Sort projects to ensure consistent ordering
  const sortedProjects = projects.nodes.sort((a: any, b: any) => {
    // Custom sort: V1 Foundation first, then others, V2 last
    const aVersion = versionMap[a.name];
    const bVersion = versionMap[b.name];
    if (!aVersion) return 1;
    if (!bVersion) return -1;
    return aVersion.localeCompare(bVersion);
  });

  for (const project of sortedProjects) {
    const version = versionMap[project.name];

    if (!version) {
      console.log(`⏭️  Skipping: ${project.name} (not in mapping)`);
      continue;
    }

    // Clean up the name - remove existing version prefix
    let coreName = project.name;
    // Remove patterns like "V1 ", "V1.1 ", "V2 "
    coreName = coreName.replace(/^V[\d.]+\s*/, "");

    const newName = `${version} ${coreName}`;

    if (project.name === newName) {
      console.log(`✓ ${project.name} (already correct)`);
      continue;
    }

    console.log(`📝 ${project.name}`);
    console.log(`   → ${newName}`);

    try {
      await linear.updateProject(project.id, { name: newName });
      console.log(`   ✅ Updated`);
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Reorganization complete!");
  console.log("=".repeat(60));

  console.log("\n📋 Your projects are now ordered:");
  console.log("   V1.0 Foundation Setup");
  console.log("   V1.1 Class Management");
  console.log("   V1.2 Scheduling Engine");
  console.log("   V1.3 System Integration");
  console.log("   V1.4 Parent & Family Features");
  console.log("   V1.5 Persona & Permissions");
  console.log("   V1.6 Payment System");
  console.log("   V2.0 Advanced Features");

  console.log("\n💡 Workflow:");
  console.log("   1. Complete V1.0 before starting V1.1");
  console.log("   2. Complete V1.1 before starting V1.2");
  console.log("   3. etc.");
  console.log("\n🤖 Assign all issues in V1.0 to Cursor Agent to start!\n");
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
