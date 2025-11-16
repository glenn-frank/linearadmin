import { LinearClient } from "@linear/sdk";
import inquirer from "inquirer";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  if (!process.env.LINEAR_API_KEY) {
    throw new Error("LINEAR_API_KEY is required");
  }
  const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

  // Pick team
  const teams = await linear.teams();
  const { teamId, useAI } = await inquirer.prompt([
    {
      type: "list",
      name: "teamId",
      message: "Select team to analyze:",
      choices: teams.nodes.map((t) => ({
        name: `${t.name} (${t.key})`,
        value: t.id,
      })),
    },
    {
      type: "confirm",
      name: "useAI",
      message: "Use AI to suggest cross-project ordering? (fallback to rules)",
      default: true,
    },
  ]);

  const team = await linear.team(teamId);
  const projects = await team.projects();

  console.log(`\n📊 Team: ${team.name}`);

  // List projects with issue counts
  const projectSummaries: Array<{
    id: string;
    name: string;
    count: number;
    sample: string[];
  }> = [];
  for (const p of projects.nodes) {
    const issues = await linear.issues({
      filter: { project: { id: { eq: p.id } } },
      first: 100,
    });
    projectSummaries.push({
      id: p.id,
      name: p.name,
      count: issues.nodes.length,
      sample: issues.nodes.slice(0, 5).map((i: any) => i.title),
    });
  }
  if (projectSummaries.length === 0) console.log("(no projects)");
  for (const s of projectSummaries) {
    console.log(`- ${s.name}: ${s.count} issue(s)`);
    if (s.sample.length) console.log(`  • Sample: ${s.sample.join(" | ")}`);
  }

  // Orphan issues (no project)
  const orphan = await linear.issues({
    filter: { team: { id: { eq: teamId } }, project: { null: true } },
    first: 200,
  });
  console.log(`\n🧭 Orphan issues (no project): ${orphan.nodes.length}`);
  if (orphan.nodes.length) {
    console.log("  • First few:");
    orphan.nodes
      .slice(0, 5)
      .forEach((i: any) => console.log(`    - ${i.title}`));
    console.log(
      "  → Suggest creating a new project to collect orphans (e.g., '<App> - Restored') or reassign to an existing project above."
    );
  }

  // Suggest execution order (cross-project)
  const allIssues = [
    ...projectSummaries.flatMap((s) => [] as any[]), // not fetching again
    ...orphan.nodes,
  ];
  if (allIssues.length) {
    console.log("\n🧩 Suggested execution order (rule-based):");
    const titles = allIssues.map((i: any) => i.title);
    const order = orderByRules(titles);
    order.slice(0, 10).forEach((t, idx) => console.log(`  ${idx + 1}. ${t}`));
    if (useAI && process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require("openai");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `Given these tasks, propose a high-level execution order (first 10). Return as a simple numbered list.\n${titles.join(
          "\n"
        )}`;
        const resp = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 400,
        });
        console.log(
          "\n🤖 AI order (top 10):\n" +
            (resp.choices[0]?.message?.content || "(no response)")
        );
      } catch (_) {
        console.log("(AI ordering unavailable)");
      }
    }
  }

  console.log(
    "\n✅ Analysis complete. Use reorganize-dependencies.ts to enforce relations and optionally start the first task."
  );
}

function orderByRules(titles: string[]): string[] {
  const precedence: Array<[string, string[]]> = [
    ["Setup Development Environment", []],
    ["Setup Database Schema", ["Setup Development Environment"]],
    ["Implement Authentication System", ["Setup Database Schema"]],
    ["Build Dashboard Page", ["Implement Authentication System"]],
    ["Implement Profile Management", ["Build Dashboard Page"]],
    ["Configure Build Pipeline", ["Implement Profile Management"]],
  ];
  // simple: list known first, then the rest as-is
  const known = precedence.map(([k]) => k).filter((k) => titles.includes(k));
  const rest = titles.filter((t) => !known.includes(t));
  return [...known, ...rest];
}

main().catch((e) => {
  console.error("❌ Analysis failed:", e.message);
  process.exit(1);
});
