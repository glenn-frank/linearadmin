import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const LINEAR_KEY = process.env.LINEAR_API_KEY;

if (!LINEAR_KEY) {
  console.error("❌ LINEAR_API_KEY environment variable is required");
  process.exit(1);
}

function getLabelColor(labelName: string): string {
  const colorMap: Record<string, string> = {
    // Negative/Problem labels - use red tones
    Bug: "#ff6b6b", // Red
    Error: "#ff6b6b", // Red
    Issue: "#ff6b6b", // Red
    Problem: "#ff6b6b", // Red
    Critical: "#e74c3c", // Darker red

    // UI/Design labels - use blue tones
    UI: "#74b9ff", // Light blue
    UX: "#74b9ff", // Light blue
    "User Experience": "#74b9ff", // Light blue
    Design: "#74b9ff", // Light blue
    Interface: "#74b9ff", // Light blue

    // Feature/Enhancement labels - use green tones
    Feature: "#00b894", // Teal green
    Enhancement: "#00b894", // Teal green
    Improvement: "#00b894", // Teal green
    "New Feature": "#00b894", // Teal green

    // Technical/Backend labels - use purple tones
    Backend: "#a29bfe", // Light purple
    API: "#a29bfe", // Light purple
    Database: "#a29bfe", // Light purple
    Server: "#a29bfe", // Light purple
    Integration: "#a29bfe", // Light purple

    // Communication labels - use pink tones
    "Email System": "#fd79a8", // Pink
    "Chat Feature": "#fd79a8", // Pink
    Notification: "#fd79a8", // Pink
    Communication: "#fd79a8", // Pink

    // Document/Data labels - use yellow tones
    "Document Management": "#fdcb6e", // Light orange
    Data: "#fdcb6e", // Light orange
    Information: "#fdcb6e", // Light orange
    Content: "#fdcb6e", // Light orange

    // Platform/System labels - use gray tones
    Platform: "#636e72", // Gray
    System: "#636e72", // Gray
    Infrastructure: "#636e72", // Gray

    // Security labels - use dark blue
    Security: "#2d3436", // Dark gray
    Auth: "#2d3436", // Dark gray
    Permission: "#2d3436", // Dark gray

    // Testing labels - use cyan
    Testing: "#00cec9", // Cyan
    QA: "#00cec9", // Cyan
    Test: "#00cec9", // Cyan

    // Mobile labels - use indigo
    Mobile: "#6c5ce7", // Indigo
    Responsive: "#6c5ce7", // Indigo
    App: "#6c5ce7", // Indigo

    // Branding labels - use magenta
    Branding: "#e84393", // Magenta
    Brand: "#e84393", // Magenta
    Identity: "#e84393", // Magenta

    // Invitation labels - use coral
    "Invitation System": "#ff7675", // Coral
    Invitation: "#ff7675", // Coral
    Invite: "#ff7675", // Coral
  };

  // Return mapped color or default pastel color
  return colorMap[labelName] || "#ddd6fe"; // Default light purple
}

async function fetchLinearTeams(): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query { teams { nodes { id name } } }`,
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    const teams = res.data?.data?.teams?.nodes || [];
    return teams.map((t: any) => ({ id: t.id, name: t.name }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear teams:",
      err.response?.data || err.message
    );
    return [];
  }
}

async function fetchLinearLabels(
  teamId: string
): Promise<Array<{ id: string; name: string; color?: string }>> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `query($id: String!) { team(id: $id) { labels { nodes { id name color } } } }`,
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
    return labels.map((l: any) => ({ id: l.id, name: l.name, color: l.color }));
  } catch (err: any) {
    console.error(
      "❌ Failed to fetch Linear labels:",
      err.response?.data || err.message
    );
    return [];
  }
}

async function updateLabelColor(
  labelId: string,
  color: string
): Promise<boolean> {
  try {
    const res = await axios.post(
      "https://api.linear.app/graphql",
      {
        query: `mutation($id: String!, $color: String!) { issueLabelUpdate(id: $id, input: { color: $color }) { issueLabel { id name color } } }`,
        variables: {
          id: labelId,
          color,
        },
      },
      {
        headers: {
          Authorization: LINEAR_KEY as string,
          "Content-Type": "application/json",
        },
      }
    );
    return !!res.data?.data?.issueLabelUpdate?.issueLabel;
  } catch (err: any) {
    console.error(
      "❌ Failed to update label color:",
      err.response?.data || err.message
    );
    return false;
  }
}

(async () => {
  try {
    console.log("🎨 Linear Label Color Update Tool");
    console.log("=".repeat(50));

    // Fetch all teams
    const teams = await fetchLinearTeams();
    if (teams.length === 0) {
      console.log("❌ No teams found");
      return;
    }

    console.log(`📋 Found ${teams.length} teams:`);
    teams.forEach((team, index) => {
      console.log(`  ${index + 1}. ${team.name} (${team.id})`);
    });

    let updatedCount = 0;
    let totalLabels = 0;

    // Process each team
    for (const team of teams) {
      console.log(`\n🏷️ Processing team: ${team.name}`);
      console.log("-".repeat(30));

      const labels = await fetchLinearLabels(team.id);
      totalLabels += labels.length;

      if (labels.length === 0) {
        console.log("  ℹ️ No labels found");
        continue;
      }

      console.log(`  📋 Found ${labels.length} labels`);

      // Check each label and update if needed
      for (const label of labels) {
        const expectedColor = getLabelColor(label.name);
        const currentColor = label.color;

        if (currentColor !== expectedColor) {
          console.log(
            `  🔄 Updating "${label.name}": ${
              currentColor || "no color"
            } → ${expectedColor}`
          );

          const success = await updateLabelColor(label.id, expectedColor);
          if (success) {
            updatedCount++;
            console.log(`  ✅ Updated "${label.name}"`);
          } else {
            console.log(`  ❌ Failed to update "${label.name}"`);
          }
        } else {
          console.log(
            `  ✅ "${label.name}" already has correct color: ${expectedColor}`
          );
        }
      }
    }

    console.log("\n🎉 Color update complete!");
    console.log(`📊 Summary:`);
    console.log(`  - Teams processed: ${teams.length}`);
    console.log(`  - Total labels: ${totalLabels}`);
    console.log(`  - Labels updated: ${updatedCount}`);
    console.log(`  - Labels already correct: ${totalLabels - updatedCount}`);
  } catch (err: any) {
    console.error("\n❌ FATAL ERROR:", err.response?.data || err.message);
    console.error("🔍 Full stack:", err.stack);
  }
})();
