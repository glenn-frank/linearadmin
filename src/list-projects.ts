import { LinearClient } from "@linear/sdk";
import dotenv from "dotenv";

dotenv.config();

const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();

if (!LINEAR_KEY) {
  console.error("❌ Missing LINEAR_API_KEY in .env");
  process.exit(1);
}

async function listProjects() {
  const linear = new LinearClient({ apiKey: LINEAR_KEY });

  const teams = await linear.teams();
  const scheduleAppTeam = teams.nodes.find(
    (team: any) => team.name === "ScheduleApp",
  );

  if (!scheduleAppTeam) {
    console.error("❌ ScheduleApp team not found");
    process.exit(1);
  }

  console.log(
    `\n📋 Projects in ${scheduleAppTeam.name} (${scheduleAppTeam.key}):\n`,
  );

  const projects = await scheduleAppTeam.projects();

  for (const project of projects.nodes) {
    const projectIssues = await linear.issues({
      filter: { project: { id: { eq: project.id } } },
      first: 250,
    });
    console.log(`  [${project.state}] ${project.name}`);
    console.log(`      ID: ${project.id}`);
    console.log(`      Issues: ${projectIssues.nodes.length}`);
    console.log("");
  }
}

listProjects().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
