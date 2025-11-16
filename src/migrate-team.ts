/**
 * migrate-team
 * ------------
 * Copies team structure (labels, projects, issues) from one Linear team to another
 * Useful for creating test teams or duplicating team setups
 */

import axios from "axios";
import * as dotenv from "dotenv";
import inquirer from "inquirer";

dotenv.config();

const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();

if (!LINEAR_KEY) {
  console.error("❌ Missing LINEAR_API_KEY in .env");
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

/* ---------------- Fetch Team Data ---------------- */
async function fetchTeamLabels(teamId: string) {
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
                description 
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

async function fetchTeamProjects(teamId: string) {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query($id: String!) { 
          team(id: $id) { 
            projects { 
              nodes { 
                id 
                name 
                description 
                state 
                targetDate 
                startDate 
                progress 
                color 
                icon 
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
    return res.data?.data?.team?.projects?.nodes || [];
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch projects:",
      err.response?.data || err.message
    );
    return [];
  }
}

async function fetchTeamIssues(teamId: string, limit: number = 100) {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query($id: String!, $first: Int!) { 
          team(id: $id) { 
            issues(first: $first) { 
              nodes { 
                id 
                title 
                description 
                priority 
                state { 
                  id 
                  name 
                  type 
                }
                labels { 
                  nodes { 
                    id 
                    name 
                  } 
                }
                project { 
                  id 
                  name 
                }
                assignee { 
                  id 
                  name 
                }
                createdAt 
                updatedAt 
              } 
            } 
          } 
        }`,
        variables: { id: teamId, first: limit },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    return res.data?.data?.team?.issues?.nodes || [];
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch issues:",
      err.response?.data || err.message
    );
    return [];
  }
}

/* ---------------- Create Team Resources ---------------- */
async function createLabel(
  name: string,
  color: string,
  description: string,
  teamId: string
) {
  try {
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
            description,
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

async function createProject(
  name: string,
  description: string,
  teamId: string
) {
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
    return res.data?.data?.projectCreate?.project?.id;
  } catch (err: any) {
    console.error(
      `❌ Failed to create project "${name}":`,
      err.response?.data || err.message
    );
    return null;
  }
}

async function createIssue(
  issueData: any,
  teamId: string,
  labelMap: Map<string, string>,
  projectMap: Map<string, string>
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
            priority: issueData.priority,
            labelIds: issueData.labels?.nodes
              ?.map((l: any) => labelMap.get(l.id))
              .filter(Boolean),
            projectId: issueData.project?.id
              ? projectMap.get(issueData.project.id)
              : undefined,
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

/* ---------------- Migration Functions ---------------- */
async function migrateLabels(sourceTeamId: string, destTeamId: string) {
  console.log("📋 Migrating labels...");
  const sourceLabels = await fetchTeamLabels(sourceTeamId);
  const labelMap = new Map<string, string>();

  for (const label of sourceLabels) {
    console.log(`  📝 Creating label: "${label.name}"`);
    const newLabelId = await createLabel(
      label.name,
      label.color,
      label.description || "",
      destTeamId
    );
    if (newLabelId) {
      labelMap.set(label.id, newLabelId);
      console.log(`  ✅ Created label: "${label.name}"`);
    }
    await sleep(200); // Rate limiting
  }

  console.log(`✅ Migrated ${labelMap.size} labels`);
  return labelMap;
}

async function migrateProjects(sourceTeamId: string, destTeamId: string) {
  console.log("📁 Migrating projects...");
  const sourceProjects = await fetchTeamProjects(sourceTeamId);
  const projectMap = new Map<string, string>();

  for (const project of sourceProjects) {
    console.log(`  📁 Creating project: "${project.name}"`);
    const newProjectId = await createProject(
      project.name,
      project.description || "",
      destTeamId
    );
    if (newProjectId) {
      projectMap.set(project.id, newProjectId);
      console.log(`  ✅ Created project: "${project.name}"`);
    }
    await sleep(200); // Rate limiting
  }

  console.log(`✅ Migrated ${projectMap.size} projects`);
  return projectMap;
}

async function migrateIssues(
  sourceTeamId: string,
  destTeamId: string,
  labelMap: Map<string, string>,
  projectMap: Map<string, string>
) {
  console.log("📝 Migrating issues...");
  const sourceIssues = await fetchTeamIssues(sourceTeamId);
  let migratedCount = 0;

  for (const issue of sourceIssues) {
    console.log(`  📝 Creating issue: "${issue.title}"`);
    const newIssueId = await createIssue(
      issue,
      destTeamId,
      labelMap,
      projectMap
    );
    if (newIssueId) {
      migratedCount++;
      console.log(`  ✅ Created issue: "${issue.title}"`);
    }
    await sleep(500); // Rate limiting for issues
  }

  console.log(`✅ Migrated ${migratedCount} issues`);
}

/* ---------------- Main Migration Flow ---------------- */
async function migrateTeam() {
  try {
    console.log("🔄 Linear Team Migration Tool");
    console.log("=============================");

    const sourceTeamId = await selectTeam("Select source team to copy from:");
    const destTeamId = await selectTeam("Select destination team to copy to:");

    if (sourceTeamId === destTeamId) {
      console.error("❌ Source and destination teams cannot be the same");
      return;
    }

    console.log("\n🚀 Starting migration...");

    // Migrate labels first
    const labelMap = await migrateLabels(sourceTeamId, destTeamId);

    // Migrate projects
    const projectMap = await migrateProjects(sourceTeamId, destTeamId);

    // Migrate issues
    await migrateIssues(sourceTeamId, destTeamId, labelMap, projectMap);

    console.log("\n🎉 Migration completed successfully!");
    console.log("📊 Summary:");
    console.log(`  - Labels: ${labelMap.size}`);
    console.log(`  - Projects: ${projectMap.size}`);
    console.log(`  - Issues: Migrated`);
  } catch (err: any) {
    console.error("\n❌ Migration failed:", err.message);
  }
}

/* ---------------- CLI Entry Point ---------------- */
if (require.main === module) {
  migrateTeam();
}
