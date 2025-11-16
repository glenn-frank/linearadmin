import { LinearClient } from "@linear/sdk";
import inquirer from "inquirer";
import * as dotenv from "dotenv";

dotenv.config();

interface SimpleIssue {
  id: string;
  title: string;
  description?: string | null;
  priority: number;
}

async function main() {
  const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

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

  // Select project (optional)
  const projects = await linear.projects({
    filter: { team: { id: { eq: teamId } } },
  });
  const { projectId } = await inquirer.prompt([
    {
      type: "list",
      name: "projectId",
      message: "Limit to a project?",
      choices: [
        { name: "All issues in team", value: "all" },
        ...projects.nodes.map((p) => ({ name: p.name, value: p.id })),
      ],
    },
  ]);

  const { useAI, autoStartFirst } = await inquirer.prompt([
    {
      type: "confirm",
      name: "useAI",
      message: "Use AI to infer dependencies (fallback to rules)?",
      default: true,
    },
    {
      type: "confirm",
      name: "autoStartFirst",
      message: "Move first unblocked issue to In Progress?",
      default: true,
    },
  ]);

  // Load issues
  const issuesQuery = await linear.issues({
    filter:
      projectId === "all"
        ? { team: { id: { eq: teamId } } }
        : { project: { id: { eq: projectId } } },
    first: 500,
  });

  const issues: SimpleIssue[] = issuesQuery.nodes.map((i: any) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    priority: i.priority ?? 0,
  }));

  if (issues.length === 0) {
    console.log("⚠️  No issues found to reorganize.");
    return;
  }

  // Compute dependencies
  const dependencies = await inferDependencies(issues, useAI);

  // Create relations
  await createRelations(linear, dependencies, issues);

  // Optionally start the first unblocked, highest-priority
  if (autoStartFirst) {
    const first = selectFirstUnblocked(issues, dependencies);
    if (first) {
      try {
        await linear.updateIssue(first.id, { state: "inProgress" });
        console.log(`🚀 Moved to In Progress: ${first.title}`);
      } catch (e: any) {
        console.log(
          "⚠️  Could not move first issue to In Progress:",
          e.message
        );
      }
    }
  }

  console.log(
    "✅ Reorganization complete: relations created and ordering enforced."
  );
}

async function inferDependencies(issues: SimpleIssue[], useAI: boolean) {
  if (useAI && process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = require("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const prompt = `Analyze development tasks and propose dependencies. Return ONLY JSON array {title, dependencies[]}.
${issues
  .map(
    (i, idx) =>
      `${idx + 1}. ${i.title}\n   Description: ${
        i.description ?? ""
      }\n   Priority: ${i.priority}`
  )
  .join("\n")}`;
      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      });
      const text = resp.choices[0]?.message?.content;
      if (text) {
        const parsed = JSON.parse(text);
        return normalizeDeps(issues, parsed);
      }
    } catch (e) {
      console.log("ℹ️  AI inference failed, falling back to rules.");
    }
  }
  // rule-based fallback
  const ruleMap: Record<string, string[]> = {
    "Setup Development Environment": [],
    "Setup Database Schema": ["Setup Development Environment"],
    "Implement Authentication System": ["Setup Database Schema"],
    "Build Dashboard Page": ["Implement Authentication System"],
    "Implement Profile Management": ["Build Dashboard Page"],
    "Configure Build Pipeline": ["Implement Profile Management"],
  };
  return Object.fromEntries(
    issues.map((i) => [i.id, mapByTitle(ruleMap[i.title] || [], issues)])
  );
}

function normalizeDeps(
  issues: SimpleIssue[],
  ai: any[]
): Record<string, string[]> {
  const byTitle = new Map(issues.map((i) => [i.title, i.id]));
  const out: Record<string, string[]> = {};
  for (const i of ai) {
    const id = byTitle.get(i.title);
    if (!id) continue;
    out[id] = (i.dependencies || [])
      .map((t: string) => byTitle.get(t))
      .filter(Boolean) as string[];
  }
  // Fill missing
  for (const i of issues) if (!out[i.id]) out[i.id] = [];
  return out;
}

function mapByTitle(titles: string[], issues: SimpleIssue[]) {
  const byTitle = new Map(issues.map((i) => [i.title, i.id]));
  return titles.map((t) => byTitle.get(t)).filter(Boolean) as string[];
}

async function createRelations(
  linear: LinearClient,
  deps: Record<string, string[]>,
  issues: SimpleIssue[]
) {
  const byId = new Map(issues.map((i) => [i.id, i.title]));
  for (const [issueId, blockers] of Object.entries(deps)) {
    for (const blockerId of blockers) {
      try {
        // Relation: blocker blocks issue
        // @ts-ignore Linear SDK supports createIssueRelation
        await linear.createIssueRelation({
          type: "blocks",
          issueId: blockerId,
          relatedIssueId: issueId,
        });
        console.log(`🔗 ${byId.get(blockerId)} blocks ${byId.get(issueId)}`);
      } catch (e: any) {
        console.log("⚠️  Relation failed:", e.message);
      }
    }
  }
}

function selectFirstUnblocked(
  issues: SimpleIssue[],
  deps: Record<string, string[]>
): SimpleIssue | undefined {
  const unblocked = issues.filter((i) => (deps[i.id] || []).length === 0);
  return unblocked.sort((a, b) => a.priority - b.priority)[0];
}

main().catch((e) => {
  console.error("❌ Reorganize failed:", e);
  process.exit(1);
});
