/**
 * Linear Issue Relabeling Tool
 * ----------------------------
 * Adds labels to existing Linear issues using the same fuzzy matching logic
 */

import axios from "axios";
import * as dotenv from "dotenv";
import inquirer from "inquirer";
import {
  fetchLinearTeams,
  fetchLinearLabels,
  inferCategories,
  findLabelIdByPreferredNames,
  findSimilarLabelId,
  createLinearLabel,
} from "./index";

dotenv.config();

/* ---------------- ENV Validation ---------------- */
const LINEAR_KEY = process.env.LINEAR_API_KEY?.trim();

if (!LINEAR_KEY) {
  console.error("❌ Missing LINEAR_API_KEY in .env");
  process.exit(1);
}

/* ---------------- Helper Functions ---------------- */
function tokenizeForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

async function inferCategories(
  title: string,
  description: string
): Promise<string[]> {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a project manager analyzing Linear issues. Based on the issue title and description, suggest 1-2 relevant labels from this list:

Available labels:
- Bug (for actual bugs, errors, failures)
- Improvement (for enhancements, optimizations, better UX)
- UI (for user interface, design, visual elements)
- Branding (for brand identity, logos, colors)
- Invitation System (for invitations, events, RSVPs)
- Chat Feature (for chat, messaging, conversations)
- Document Management (for documents, forms, data)
- Email System (for emails, notifications, templates)
- Backend (for APIs, server, database, integrations)
- Testing (for testing, validation, QA)
- Platform (for platform, dashboard, system)
- User Experience (for UX, user journey, usability)
- Security (for authentication, permissions, access)
- Mobile (for mobile apps, responsive design)

Rules:
1. Choose 1-2 most relevant labels
2. Prefer specific functional labels over generic ones
3. Only use "Bug" for actual bugs, not feature requests
4. Return labels as a JSON array

Example: ["Bug", "Chat Feature"]`,
          },
          {
            role: "user",
            content: `Title: ${title}\nDescription: ${description}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 100,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const content = response.data.choices[0].message.content.trim();

    // Try to parse as JSON array
    try {
      const labels = JSON.parse(content);
      if (Array.isArray(labels)) {
        return labels.slice(0, 2); // Limit to 2 labels
      }
    } catch (parseError) {
      // If not JSON, try to extract labels from text
      const labelMatches = content.match(
        /(?:Bug|Improvement|UI|Branding|Invitation System|Chat Feature|Document Management|Email System|Backend|Testing|Platform|User Experience|Security|Mobile)/g
      );
      if (labelMatches) {
        return Array.from(new Set(labelMatches)).slice(0, 2);
      }
    }

    return [];
  } catch (error) {
    console.error(
      "❌ OpenAI API error:",
      error.response?.data || error.message
    );
    return [];
  }
}

function isLabelRedundant(newLabel: string, existingLabels: string[]): boolean {
  const label = newLabel.toLowerCase();
  const existing = existingLabels.map((l) => l.toLowerCase());

  // If we already have this exact label, it's redundant
  if (existing.includes(label)) {
    return true;
  }

  // If we already have "User Experience", don't add "UI" (too similar)
  if (label === "ui" && existing.includes("user experience")) {
    return true;
  }
  if (label === "user experience" && existing.includes("ui")) {
    return true;
  }

  // If we already have "Bug", don't add it again
  if (label === "bug" && existing.includes("bug")) {
    return true;
  }

  // If we already have "Improvement", don't add it again
  if (label === "improvement" && existing.includes("improvement")) {
    return true;
  }

  // If we already have "Invitation System", don't add it again
  if (label === "invitation system" && existing.includes("invitation system")) {
    return true;
  }

  // If we already have "Chat Feature", don't add it again
  if (label === "chat feature" && existing.includes("chat feature")) {
    return true;
  }

  // If we already have "Document Management", don't add it again
  if (
    label === "document management" &&
    existing.includes("document management")
  ) {
    return true;
  }

  // If we already have "Backend" and the issue is about integration, don't add "Bug" or "UI"
  if (label === "bug" && existing.includes("backend")) {
    return true;
  }
  if (label === "ui" && existing.includes("backend")) {
    return true;
  }

  // If we already have "Backend" and "User Experience", don't add "Bug" or "UI"
  if (
    label === "bug" &&
    existing.includes("backend") &&
    existing.includes("user experience")
  ) {
    return true;
  }
  if (
    label === "ui" &&
    existing.includes("backend") &&
    existing.includes("user experience")
  ) {
    return true;
  }

  return false;
}

function findSimilarLabelId(
  category: string,
  availableLabels: Array<{ id: string; name: string }>
): string | null {
  const categoryLower = category.toLowerCase();

  // First try exact matches
  for (const label of availableLabels) {
    const labelName = String(label.name).toLowerCase();
    if (labelName === categoryLower) {
      return label.id;
    }
  }

  // Then try fuzzy matching
  for (const label of availableLabels) {
    const labelName = String(label.name).toLowerCase();

    // Check if category contains label name or vice versa
    if (
      categoryLower.includes(labelName) ||
      labelName.includes(categoryLower)
    ) {
      return label.id;
    }

    // Check for word overlap (at least 60% of words match)
    const categoryWords = categoryLower.split(/\s+/);
    const labelWords = labelName.split(/\s+/);

    if (categoryWords.length > 0 && labelWords.length > 0) {
      const commonWords = categoryWords.filter((word) =>
        labelWords.some(
          (labelWord) => word.includes(labelWord) || labelWord.includes(word)
        )
      );

      const similarity =
        commonWords.length / Math.max(categoryWords.length, labelWords.length);
      if (similarity >= 0.6) {
        return label.id;
      }
    }
  }

  return null;
}

/* ---------------- Linear API Functions ---------------- */
async function fetchLinearLabels(
  teamId: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query($id: String!) { team(id: $id) { labels { nodes { id name } } } }`,
        variables: { id: teamId },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const labels = res.data?.data?.team?.labels?.nodes || [];
    return labels.map((l: any) => ({ id: l.id, name: l.name }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear labels:",
      err.response?.data || err.message
    );
    return [];
  }
}

async function fetchLinearIssues(
  teamId: string,
  limit: number = 50
): Promise<
  Array<{
    id: string;
    title: string;
    description: string;
    labels: Array<{ id: string; name: string }>;
  }>
> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `
          query($teamId: String!, $first: Int!) {
            team(id: $teamId) {
              issues(first: $first, orderBy: createdAt) {
                nodes {
                  id
                  title
                  description
                  labels {
                    nodes {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { teamId, first: limit },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const issues = res.data?.data?.team?.issues?.nodes || [];
    return issues.map((issue: any) => ({
      id: issue.id,
      title: issue.title,
      description: issue.description || "",
      labels: issue.labels?.nodes || [],
    }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear issues:",
      err.response?.data || err.message
    );
    return [];
  }
}

async function createLinearLabel(
  name: string,
  teamId: string
): Promise<string | null> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `
          mutation($name: String!, $teamId: String!) {
            issueLabelCreate(input: { name: $name, teamId: $teamId }) {
              success
              issueLabel { id }
            }
          }
        `,
        variables: { name, teamId },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    return res.data?.data?.issueLabelCreate?.issueLabel?.id || null;
  } catch (err: any) {
    console.error(
      "❌ Failed to create label:",
      err.response?.data || err.message
    );
    return null;
  }
}

async function updateIssueLabels(
  issueId: string,
  labelIds: string[]
): Promise<boolean> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `
          mutation($id: String!, $labelIds: [String!]!) {
            issueUpdate(id: $id, input: { labelIds: $labelIds }) {
              success
            }
          }
        `,
        variables: { id: issueId, labelIds },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    return res.data?.data?.issueUpdate?.success || false;
  } catch (err: any) {
    console.error(
      "❌ Failed to update issue labels:",
      err.response?.data || err.message
    );
    return false;
  }
}

/* ---------------- Team Selection ---------------- */
async function selectLinearTeam() {
  const teams = await fetchLinearTeams();
  if (!teams.length) {
    throw new Error("No Linear teams available. Check API key.");
  }

  // Check if we should auto-select from environment variable
  const TEAM_ID = process.env.LINEAR_TEAM_ID?.trim();
  if (TEAM_ID && process.argv.includes("--use-env-team")) {
    const byId = teams.find((t: any) => t.id === TEAM_ID);
    const byKey = teams.find((t: any) => t.key === TEAM_ID);
    const foundTeam = byId || byKey;

    if (foundTeam) {
      console.log(
        `✅ Using team from env: ${foundTeam.name} (${foundTeam.key})`
      );
      return foundTeam.id;
    } else {
      console.warn(
        `⚠️ LINEAR_TEAM_ID "${TEAM_ID}" not found in available teams`
      );
    }
  }

  // Default: show team selection prompt
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "teamId",
      message: "Select a Linear team:",
      choices: teams.map((t: any) => ({
        name: `${t.name} (${t.key})`,
        value: t.id,
      })),
    },
  ]);
  return answers.teamId as string;
}

/* ---------------- Main Flow ---------------- */
(async () => {
  try {
    console.log("🏷️ Linear Issue Relabeling Tool");

    // Select team
    const selectedTeamId = await selectLinearTeam();
    console.log(`📋 Selected Team ID: ${selectedTeamId}`);

    // Fetch existing labels and issues
    console.log("📥 Fetching existing labels and issues...");
    const [labels, issues] = await Promise.all([
      fetchLinearLabels(selectedTeamId),
      fetchLinearIssues(selectedTeamId, 100),
    ]);

    console.log(`✅ Found ${labels.length} labels and ${issues.length} issues`);

    if (issues.length === 0) {
      console.log("ℹ️ No issues found to relabel");
      return;
    }

    // Check for command line arguments
    const args = process.argv.slice(2);
    let action = "preview"; // Default to preview mode

    if (args.includes("--all")) {
      action = "relabel";
    } else if (args.includes("--clean")) {
      action = "clean";
    } else if (args.includes("--selective")) {
      action = "selective";
    } else if (args.includes("--preview") || args.length === 0) {
      action = "preview";
    } else {
      // Try interactive mode as fallback
      try {
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "action",
            message: "What would you like to do?",
            choices: [
              {
                name: "Preview labels for all issues (dry run)",
                value: "preview",
              },
              { name: "Add labels to all issues", value: "relabel" },
              { name: "Add labels to specific issues", value: "selective" },
              {
                name: "Clean slate: Remove all labels and re-label",
                value: "clean",
              },
            ],
          },
        ]);
        action = answers.action;
      } catch (err) {
        console.log("⚠️ Interactive mode not available, using preview mode");
        console.log(
          "💡 Use --all, --clean, --selective, or --preview flags for non-interactive mode"
        );
        action = "preview";
      }
    }

    if (action === "preview") {
      console.log("\n🔍 Preview Mode - Labels that would be added:");
      console.log("=".repeat(60));

      for (const issue of issues) {
        const existingLabelNames = issue.labels.map((l) => l.name);
        const suggestedCategories = await inferCategories(
          issue.title,
          issue.description
        );
        const suggestedLabelIds: string[] = [];

        // Suggest labels for all issues, but avoid duplicates
        for (const category of suggestedCategories) {
          let labelId = findSimilarLabelId(category, labels);

          // If no similar label exists, create a new one
          if (!labelId) {
            console.log(`    📋 Creating new label: "${category}"`);
            labelId = await createLinearLabel(category, selectedTeamId);
            if (labelId) {
              labels.push({ id: labelId, name: category });
            }
          }

          if (labelId) {
            const labelName = labels.find((l) => l.id === labelId)?.name;
            if (labelName && !existingLabelNames.includes(labelName)) {
              suggestedLabelIds.push(labelId);
            }
          }
        }

        if (suggestedLabelIds.length > 0) {
          const suggestedNames = suggestedLabelIds
            .map((id) => labels.find((l) => l.id === id)?.name)
            .filter(Boolean);

          console.log(`\n📋 ${issue.title}`);
          console.log(`   Current: ${existingLabelNames.join(", ") || "None"}`);
          console.log(`   Would add: ${suggestedNames.join(", ")}`);
        }
      }

      console.log("\n✅ Preview complete");
      return;
    }

    if (action === "selective") {
      const issueChoices = issues.map((issue) => ({
        name: `${issue.title} (${issue.labels.length} labels)`,
        value: issue.id,
      }));

      const selectedIssues = await inquirer.prompt([
        {
          type: "checkbox",
          name: "issueIds",
          message: "Select issues to relabel:",
          choices: issueChoices,
        },
      ]);

      const issuesToProcess = issues.filter((issue) =>
        selectedIssues.issueIds.includes(issue.id)
      );

      console.log(
        `\n🏷️ Adding labels to ${issuesToProcess.length} selected issues...`
      );

      for (const issue of issuesToProcess) {
        const existingLabelIds = issue.labels.map((l) => l.id);
        const suggestedCategories = await inferCategories(
          issue.title,
          issue.description
        );
        const suggestedLabelIds: string[] = [];

        // Suggest labels for all issues, but avoid duplicates
        for (const category of suggestedCategories) {
          let labelId = findSimilarLabelId(category, labels);

          // If no similar label exists, create a new one
          if (!labelId) {
            console.log(`    📋 Creating new label: "${category}"`);
            labelId = await createLinearLabel(category, selectedTeamId);
            if (labelId) {
              labels.push({ id: labelId, name: category });
            }
          }

          if (labelId) {
            const labelName = labels.find((l) => l.id === labelId)?.name;
            if (labelName && !existingLabelNames.includes(labelName)) {
              suggestedLabelIds.push(labelId);
            }
          }
        }

        if (suggestedLabelIds.length > 0) {
          const allLabelIds = [...existingLabelIds, ...suggestedLabelIds];
          const success = await updateIssueLabels(issue.id, allLabelIds);

          if (success) {
            const addedNames = suggestedLabelIds
              .map((id) => labels.find((l) => l.id === id)?.name)
              .filter(Boolean);
            console.log(`✅ ${issue.title}: Added ${addedNames.join(", ")}`);
          } else {
            console.log(`❌ Failed to update ${issue.title}`);
          }
        } else {
          console.log(`⏭️ ${issue.title}: No new labels to add`);
        }
      }

      console.log("\n🎉 Selective relabeling complete");
      return;
    }

    if (action === "relabel") {
      // Relabel all issues
      console.log(`\n🏷️ Adding labels to all ${issues.length} issues...`);

      for (const issue of issues) {
        const existingLabelIds = issue.labels.map((l) => l.id);
        const suggestedCategories = await inferCategories(
          issue.title,
          issue.description
        );
        const suggestedLabelIds: string[] = [];

        // Suggest labels for all issues, but avoid duplicates
        const existingLabelNames = issue.labels.map((l) => l.name);
        for (const category of suggestedCategories) {
          let labelId = findSimilarLabelId(category, labels);

          // If no similar label exists, create a new one
          if (!labelId) {
            console.log(`    📋 Creating new label: "${category}"`);
            labelId = await createLinearLabel(category, selectedTeamId);
            if (labelId) {
              labels.push({ id: labelId, name: category });
            }
          }

          if (labelId) {
            const labelName = labels.find((l) => l.id === labelId)?.name;
            if (labelName && !existingLabelNames.includes(labelName)) {
              suggestedLabelIds.push(labelId);
            }
          }
        }

        if (suggestedLabelIds.length > 0) {
          const allLabelIds = [...existingLabelIds, ...suggestedLabelIds];
          const success = await updateIssueLabels(issue.id, allLabelIds);

          if (success) {
            const addedNames = suggestedLabelIds
              .map((id) => labels.find((l) => l.id === id)?.name)
              .filter(Boolean);
            console.log(`✅ ${issue.title}: Added ${addedNames.join(", ")}`);
          } else {
            console.log(`❌ Failed to update ${issue.title}`);
          }
        } else {
          console.log(`⏭️ ${issue.title}: No new labels to add`);
        }
      }

      console.log("\n🎉 Relabeling complete");
      return;
    }

    if (action === "clean") {
      console.log(
        "\n🧹 Clean Slate Mode - Removing all labels and re-labeling:"
      );
      console.log("=".repeat(60));

      for (const issue of issues) {
        console.log(`\n🔄 Processing: ${issue.title}`);

        // Remove all existing labels first
        const existingLabelIds = issue.labels.map((l) => l.id);
        if (existingLabelIds.length > 0) {
          console.log(
            `  🗑️ Removing ${existingLabelIds.length} existing labels`
          );
          const success = await updateIssueLabels(issue.id, []);
          if (!success) {
            console.log(`  ❌ Failed to remove labels from ${issue.title}`);
            continue;
          }
        }

        // Now add new labels based on content
        const suggestedCategories = await inferCategories(
          issue.title,
          issue.description
        );
        const suggestedLabelIds: string[] = [];

        for (const category of suggestedCategories) {
          let labelId = findSimilarLabelId(category, labels);

          // If no similar label exists, create a new one
          if (!labelId) {
            console.log(`    📋 Creating new label: "${category}"`);
            labelId = await createLinearLabel(category, selectedTeamId);
            if (labelId) {
              labels.push({ id: labelId, name: category });
            }
          }

          if (labelId) {
            suggestedLabelIds.push(labelId);
          }
        }

        if (suggestedLabelIds.length > 0) {
          const success = await updateIssueLabels(issue.id, suggestedLabelIds);
          if (success) {
            const addedNames = suggestedLabelIds
              .map((id) => labels.find((l) => l.id === id)?.name)
              .filter(Boolean);
            console.log(
              `  ✅ Added ${addedNames.length} new labels: ${addedNames.join(
                ", "
              )}`
            );
          } else {
            console.log(`  ❌ Failed to add labels to ${issue.title}`);
          }
        } else {
          console.log(`  ⏭️ No labels suggested for ${issue.title}`);
        }
      }

      console.log("\n🎉 Clean slate relabeling complete");
      return;
    }
  } catch (err: any) {
    console.error("\n❌ FATAL ERROR:", err.response?.data || err.message);
    console.error("🔍 Full stack:", err.stack);
  }
})();
