import { LinearClient } from "@linear/sdk";
import dotenv from "dotenv";

dotenv.config();

async function createRepoLabels() {
  const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

  console.log("\n🏷️  Creating Repository Labels\n");

  const teams = await linear.teams();
  const scheduleApp = teams.nodes.find(
    (t: any) => t.name === "ScheduleApp" && t.key === "SCH",
  );

  if (!scheduleApp) {
    console.error("❌ ScheduleApp not found");
    process.exit(1);
  }

  console.log(`✅ Team: ${scheduleApp.name}\n`);

  const labelsToCreate = [
    { name: "glenn-frank/scheduleapp", color: "#3b82f6" },
    { name: "glenn-frank/scheduleapp/frontend", color: "#10b981" },
    { name: "glenn-frank/scheduleapp/backend", color: "#f59e0b" },
    { name: "Frontend", color: "#10b981" },
    { name: "Backend", color: "#f59e0b" },
    { name: "Database", color: "#8b5cf6" },
    { name: "deployment", color: "#ef4444" },
    { name: "build", color: "#6366f1" },
    { name: "setup", color: "#06b6d4" },
    { name: "development", color: "#14b8a6" },
    { name: "auth", color: "#f97316" },
    { name: "dashboard", color: "#ec4899" },
    { name: "profile", color: "#a855f7" },
    { name: "upload", color: "#84cc16" },
  ];

  for (const label of labelsToCreate) {
    try {
      await linear.createIssueLabel({
        name: label.name,
        color: label.color,
        teamId: scheduleApp.id,
      });
      console.log(`✅ Created: ${label.name}`);
    } catch (error: any) {
      if (error.message.includes("duplicate")) {
        console.log(`⏭️  Exists: ${label.name}`);
      } else {
        console.error(`❌ Failed: ${label.name} - ${error.message}`);
      }
    }
  }

  console.log("\n✅ Labels ready for Laravel script!\n");
}

createRepoLabels();
