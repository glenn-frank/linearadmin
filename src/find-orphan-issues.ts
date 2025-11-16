import { LinearClient } from "@linear/sdk";
import dotenv from "dotenv";

dotenv.config();

const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();

if (!LINEAR_KEY) {
  console.error("❌ Missing LINEAR_API_KEY in .env");
  process.exit(1);
}

interface OrphanIssue {
  id: string;
  identifier: string;
  title: string;
  state: string;
  priority: number;
  labels: string[];
  createdAt: Date;
}

async function findOrphanIssues() {
  const linear = new LinearClient({ apiKey: LINEAR_KEY });

  console.log("\n🔍 Searching for Schedule App team...\n");

  const teams = await linear.teams();

  console.log("📋 Available teams:");
  for (const team of teams.nodes) {
    console.log(`  - ${team.name} (${team.key}) - ID: ${team.id}`);
  }
  console.log("");

  const scheduleAppTeam = teams.nodes.find(
    (team: any) =>
      team.name.toLowerCase().includes("schedule") ||
      team.name.toLowerCase().includes("app"),
  );

  if (!scheduleAppTeam) {
    console.log(
      '\n⚠️  Could not find "Schedule App" team. Please check team name.\n',
    );
    process.exit(1);
  }

  console.log(
    `✅ Found team: ${scheduleAppTeam.name} (${scheduleAppTeam.key})`,
  );
  console.log(`   Team ID: ${scheduleAppTeam.id}\n`);

  console.log("📊 Fetching all projects in team...\n");

  const projects = await scheduleAppTeam.projects();
  console.log(`Found ${projects.nodes.length} project(s):\n`);

  for (const project of projects.nodes) {
    const projectIssues = await linear.issues({
      filter: { project: { id: { eq: project.id } } },
      first: 250,
    });
    console.log(`  - ${project.name}: ${projectIssues.nodes.length} issue(s)`);
  }

  console.log("\n🔍 Searching for ALL issues in team...\n");

  const allIssues = await linear.issues({
    filter: {
      team: { id: { eq: scheduleAppTeam.id } },
    },
    first: 250,
  });

  console.log(`📊 Total issues in team: ${allIssues.nodes.length}\n`);

  console.log("🔍 Filtering for orphan issues (no project assigned)...\n");

  const orphanIssues = await linear.issues({
    filter: {
      team: { id: { eq: scheduleAppTeam.id } },
      project: { null: true },
    },
    first: 250,
  });

  if (orphanIssues.nodes.length === 0) {
    console.log(
      "✅ No orphan issues found! All issues are assigned to projects.\n",
    );

    if (allIssues.nodes.length === 0) {
      console.log("⚠️  Actually, there are NO issues in this team at all.\n");
      console.log(
        "💡 Your issues may have been deleted or moved to another team.\n",
      );
      return;
    }

    console.log(
      `💡 All ${allIssues.nodes.length} issues in the team are assigned to projects.\n`,
    );
    return;
  }

  console.log(
    `📌 Found ${orphanIssues.nodes.length} issue(s) without a project:\n`,
  );
  console.log("=".repeat(80));

  const orphans: OrphanIssue[] = [];

  for (const issue of orphanIssues.nodes) {
    const state = await issue.state;
    const labels = await issue.labels();

    const orphan: OrphanIssue = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state: state?.name || "Unknown",
      priority: issue.priority ?? 0,
      labels: labels.nodes.map((l: any) => l.name),
      createdAt: issue.createdAt,
    };

    orphans.push(orphan);
  }

  orphans.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const orphan of orphans) {
    const priorityText =
      orphan.priority === 1
        ? "🔴 Urgent"
        : orphan.priority === 2
          ? "🟠 High"
          : orphan.priority === 3
            ? "🟡 Medium"
            : orphan.priority === 4
              ? "🟢 Low"
              : "⚪ None";

    console.log(`\n[${orphan.identifier}] ${orphan.title}`);
    console.log(`  State: ${orphan.state}`);
    console.log(`  Priority: ${priorityText}`);
    if (orphan.labels.length > 0) {
      console.log(`  Labels: ${orphan.labels.join(", ")}`);
    }
    console.log(
      `  Created: ${orphan.createdAt.toLocaleDateString()} ${orphan.createdAt.toLocaleTimeString()}`,
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log(
    `\n📊 Summary: ${orphanIssues.nodes.length} issue(s) need project assignment\n`,
  );

  console.log("💡 Suggested projects based on labels:\n");

  const labelGroups: Record<string, string[]> = {};

  for (const orphan of orphans) {
    for (const label of orphan.labels) {
      if (!labelGroups[label]) {
        labelGroups[label] = [];
      }
      labelGroups[label].push(orphan.identifier);
    }
  }

  const sortedLabels = Object.entries(labelGroups).sort(
    (a, b) => b[1].length - a[1].length,
  );

  for (const [label, issueIds] of sortedLabels) {
    console.log(
      `  "${label}" → ${issueIds.length} issue(s): ${issueIds.join(", ")}`,
    );
  }

  console.log("\n✅ Analysis complete!\n");
}

findOrphanIssues().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
