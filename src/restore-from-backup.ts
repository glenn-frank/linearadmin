import { LinearClient } from "@linear/sdk";
import * as fs from "fs";
import * as path from "path";

interface RestoreArgs {
  file: string; // absolute or relative path to backup json
  newTeamName?: string; // if provided, create new team
  existingTeamId?: string; // else, restore into this team
  createNewProject?: boolean; // default true
  existingProjectId?: string; // if not creating project
}

type BackupData = {
  team: { id: string; name: string; description?: string; key?: string };
  labels: Array<{ name: string; description?: string; color?: string }>;
  projects: Array<{ id: string; name: string; description?: string }>;
  issues: Array<{
    title: string;
    description?: string;
    priority?: number;
    project?: { id: string; name: string } | null;
    labels?: Array<{ name: string; color?: string }>;
  }>;
};

function readArgs(): RestoreArgs {
  const argv = process.argv.slice(2);
  const args: any = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") args.file = argv[++i];
    else if (a === "--new-team") args.newTeamName = argv[++i];
    else if (a === "--team-id") args.existingTeamId = argv[++i];
    else if (a === "--create-new-project")
      args.createNewProject = argv[++i] === "true";
    else if (a === "--project-id") args.existingProjectId = argv[++i];
  }
  if (!args.file) throw new Error("--file is required");
  if (!fs.existsSync(args.file)) {
    throw new Error(`Backup file not found: ${args.file}`);
  }
  if (!process.env.LINEAR_API_KEY) {
    throw new Error("LINEAR_API_KEY is required in env");
  }
  if (!args.newTeamName && !args.existingTeamId) {
    // default to new team from file name
    const base = path.basename(args.file).replace(/\.json$/i, "");
    args.newTeamName = `${base} - Restore`;
  }
  if (args.createNewProject === undefined) args.createNewProject = true;
  return args as RestoreArgs;
}

async function restore() {
  const args = readArgs();
  const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });
  const data: BackupData = JSON.parse(fs.readFileSync(args.file, "utf8"));

  // Select or create team
  let teamId: string;
  if (args.existingTeamId) {
    teamId = args.existingTeamId;
  } else {
    const team = await linear.createTeam({
      name: args.newTeamName!,
      description: data.team.description,
      key: (data.team.key || "APP").slice(0, 4).toUpperCase(),
    });
    teamId = team.id;
    console.log(`✅ Created team: ${args.newTeamName}`);
  }

  // Restore labels
  if (data.labels?.length) {
    for (const l of data.labels) {
      try {
        await linear.createIssueLabel({
          teamId,
          name: l.name,
          description: l.description,
          color: l.color,
        });
      } catch (_) {}
    }
  }

  // Restore or select project
  let projectId: string | undefined = args.existingProjectId;
  if (args.createNewProject) {
    const baseName = data.projects?.[0]?.name || "Restored Project";
    const p = await linear.createProject({ name: baseName, teamId });
    projectId = p.id;
    console.log(`✅ Created project: ${baseName}`);
  }

  // Restore issues
  for (const issue of data.issues || []) {
    try {
      const created = await linear.createIssue({
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        teamId,
        projectId: projectId,
      });
      // Labels best-effort
      if (issue.labels && issue.labels.length) {
        const allLabels = await linear.issueLabels({
          filter: { team: { id: { eq: teamId } } },
        });
        const nameToId = new Map(
          allLabels.nodes.map((n: any) => [n.name, n.id])
        );
        const labelIds = issue.labels
          .map((l) => nameToId.get(l.name))
          .filter(Boolean) as string[];
        if (labelIds.length) {
          await linear.updateIssue(created.id, { labelIds });
        }
      }
    } catch (e: any) {
      console.log(`⚠️  Issue restore failed: ${issue.title}:`, e.message);
    }
  }

  console.log("🎉 Restore complete.");
}

restore().catch((e) => {
  console.error("❌ Restore failed:", e.message);
  process.exit(1);
});
