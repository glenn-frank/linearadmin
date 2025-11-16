import { LinearClient } from "@linear/sdk";
import dotenv from "dotenv";

dotenv.config();

const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();

if (!LINEAR_KEY) {
  console.error("❌ Missing LINEAR_API_KEY in .env");
  process.exit(1);
}

interface ProjectMapping {
  projectName: string;
  projectId: string;
  issueIdentifiers: string[];
}

async function assignOrphansToProjects() {
  const linear = new LinearClient({ apiKey: LINEAR_KEY });

  console.log("\n🔍 Finding ScheduleApp team...\n");

  const teams = await linear.teams();
  const scheduleAppTeam = teams.nodes.find(
    (team: any) => team.name === "ScheduleApp",
  );

  if (!scheduleAppTeam) {
    console.error("❌ ScheduleApp team not found");
    process.exit(1);
  }

  console.log(
    `✅ Found team: ${scheduleAppTeam.name} (${scheduleAppTeam.key})\n`,
  );

  // Get existing projects
  const projects = await scheduleAppTeam.projects();
  const projectMap = new Map<string, string>();

  for (const project of projects.nodes) {
    projectMap.set(project.name, project.id);
  }

  console.log("📋 Available projects:");
  for (const [name, id] of projectMap.entries()) {
    console.log(`   - ${name}`);
  }
  console.log("");

  // Get orphan issues
  const orphanIssues = await linear.issues({
    filter: {
      team: { id: { eq: scheduleAppTeam.id } },
      project: { null: true },
    },
    first: 250,
  });

  console.log(`📊 Found ${orphanIssues.nodes.length} orphan issues\n`);

  // Define mappings
  const projectMappings: ProjectMapping[] = [
    {
      projectName: "V1 Foundation Setup",
      projectId: projectMap.get("V1 Foundation Setup") || "",
      issueIdentifiers: [
        "SCH-175",
        "SCH-113",
        "SCH-114",
        "SCH-115",
        "SCH-116",
        "SCH-194",
        "SCH-195",
        "SCH-187",
        "SCH-191",
        "SCH-196",
        "SCH-197",
        "SCH-198",
      ],
    },
    {
      projectName: "V1 Class Management",
      projectId: projectMap.get("V1 Class Management") || "",
      issueIdentifiers: [
        "SCH-176",
        "SCH-118",
        "SCH-119",
        "SCH-120",
        "SCH-121",
        "SCH-122",
      ],
    },
    {
      projectName: "V1 Scheduling Engine",
      projectId: projectMap.get("V1 Scheduling Engine") || "",
      issueIdentifiers: [
        "SCH-177",
        "SCH-123",
        "SCH-124",
        "SCH-125",
        "SCH-126",
        "SCH-127",
      ],
    },
    {
      projectName: "V1 System Integration",
      projectId: projectMap.get("V1 System Integration") || "",
      issueIdentifiers: [
        "SCH-178",
        "SCH-117",
        "SCH-188",
        "SCH-189",
        "SCH-190",
        "SCH-192",
        "SCH-199",
      ],
    },
    {
      projectName: "V1 Parent & Family Features",
      projectId: projectMap.get("V1 Parent & Family Features") || "",
      issueIdentifiers: [
        "SCH-143",
        "SCH-144",
        "SCH-145",
        "SCH-146",
        "SCH-147",
        "SCH-151",
        "SCH-152",
        "SCH-153",
        "SCH-154",
        "SCH-155",
      ],
    },
    {
      projectName: "V1 Persona & Permissions",
      projectId: projectMap.get("V1 Persona & Permissions") || "",
      issueIdentifiers: ["SCH-156", "SCH-157", "SCH-158"],
    },
  ];

  console.log("=".repeat(80));
  console.log("ASSIGNING ORPHAN ISSUES TO PROJECTS");
  console.log("=".repeat(80) + "\n");

  let totalAssigned = 0;
  let totalFailed = 0;

  for (const mapping of projectMappings) {
    if (!mapping.projectId) {
      console.error(
        `⚠️  Project "${mapping.projectName}" not found, skipping...`,
      );
      continue;
    }

    console.log(`\n📁 ${mapping.projectName}`);
    console.log(`   Project ID: ${mapping.projectId}`);

    let assignedCount = 0;
    for (const identifier of mapping.issueIdentifiers) {
      const issue = orphanIssues.nodes.find(
        (i: any) => i.identifier === identifier,
      );

      if (issue) {
        try {
          await linear.updateIssue(issue.id, { projectId: mapping.projectId });
          assignedCount++;
          totalAssigned++;
          console.log(`   ✅ ${identifier}: ${issue.title}`);
        } catch (error: any) {
          totalFailed++;
          console.error(`   ❌ ${identifier}: ${error.message}`);
        }
      } else {
        console.log(
          `   ⚠️  ${identifier}: Not found (may already be assigned)`,
        );
      }
    }

    console.log(
      `   📊 Assigned ${assignedCount}/${mapping.issueIdentifiers.length} issue(s)`,
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80) + "\n");

  console.log(`✅ Successfully assigned: ${totalAssigned} issue(s)`);
  if (totalFailed > 0) {
    console.log(`❌ Failed to assign: ${totalFailed} issue(s)`);
  }

  // Check remaining orphans
  const remainingOrphans = await linear.issues({
    filter: {
      team: { id: { eq: scheduleAppTeam.id } },
      project: { null: true },
    },
    first: 250,
  });

  console.log(`📊 Remaining orphan issues: ${remainingOrphans.nodes.length}\n`);

  if (remainingOrphans.nodes.length > 0) {
    console.log("⚠️  The following issues still need project assignment:\n");
    for (const issue of remainingOrphans.nodes) {
      const labels = await issue.labels();
      console.log(`   [${issue.identifier}] ${issue.title}`);
      if (labels.nodes.length > 0) {
        console.log(
          `      Labels: ${labels.nodes.map((l: any) => l.name).join(", ")}`,
        );
      }
    }
  } else {
    console.log("🎉 All orphan issues have been assigned to projects!");
  }

  console.log("");
}

assignOrphansToProjects().catch((error) => {
  console.error("\n❌ Error:", error.message);
  console.error(error.stack);
  process.exit(1);
});
