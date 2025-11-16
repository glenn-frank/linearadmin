# Linear API Integration Guide

## Overview

This document provides a comprehensive guide for integrating with Linear's GraphQL API, covering all the patterns and techniques discovered through the video-to-linear project. It includes examples for creating issues, projects, labels, milestones, and managing workflow states.

## Table of Contents

1. [Authentication](#authentication)
2. [Basic API Structure](#basic-api-structure)
3. [Teams and Projects](#teams-and-projects)
4. [Issues Management](#issues-management)
5. [Labels and Workflow States](#labels-and-workflow-states)
6. [Milestones and Progress Tracking](#milestones-and-progress-tracking)
7. [Parent-Child Relationships](#parent-child-relationships)
8. [Error Handling](#error-handling)
9. [Rate Limiting](#rate-limiting)
10. [Best Practices](#best-practices)
11. [Common Pitfalls](#common-pitfalls)
12. [Complete Examples](#complete-examples)

## Authentication

### API Key Setup

```typescript
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const headers = {
  Authorization: process.env.LINEAR_API_KEY,
  "Content-Type": "application/json",
};
```

### Environment Variables

```bash
# .env file
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Basic API Structure

### GraphQL Endpoint

```typescript
const LINEAR_API_URL = "https://api.linear.app/graphql";

const makeRequest = async (query: string, variables: any = {}) => {
  const response = await axios.post(
    LINEAR_API_URL,
    {
      query,
      variables,
    },
    { headers }
  );

  return response.data;
};
```

### Error Handling

```typescript
const handleLinearError = (error: any) => {
  if (error.response?.data?.errors) {
    console.error("Linear API Errors:", error.response.data.errors);
    return error.response.data.errors;
  }
  console.error("Request Error:", error.message);
  return [{ message: error.message }];
};
```

## Teams and Projects

### Getting Teams

```typescript
const getTeams = async () => {
  const query = `
    query {
      viewer {
        teamMemberships {
          nodes {
            team {
              id
              name
              key
            }
          }
        }
      }
    }
  `;

  const response = await makeRequest(query);
  return response.data?.viewer?.teamMemberships?.nodes || [];
};
```

### Creating Projects

```typescript
const createProject = async (
  teamId: string,
  name: string,
  description: string
) => {
  const query = `
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        project {
          id
          name
          description
        }
      }
    }
  `;

  const variables = {
    input: {
      teamIds: [teamId], // Note: teamIds is an array, not teamId
      name,
      description,
    },
  };

  const response = await makeRequest(query, variables);
  return response.data?.projectCreate?.project;
};
```

### Getting Projects

```typescript
const getProjects = async (teamId: string) => {
  const query = `
    query($id: String!) {
      team(id: $id) {
        projects {
          nodes {
            id
            name
            description
          }
        }
      }
    }
  `;

  const response = await makeRequest(query, { id: teamId });
  return response.data?.team?.projects?.nodes || [];
};
```

## Issues Management

### Creating Issues

```typescript
const createIssue = async (
  teamId: string,
  title: string,
  description: string,
  projectId?: string,
  labelIds?: string[],
  stateId?: string
) => {
  const query = `
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        issue {
          id
          title
          description
          project {
            name
          }
          labels {
            nodes {
              name
            }
          }
          state {
            name
          }
        }
      }
    }
  `;

  const variables = {
    input: {
      teamId,
      title,
      description,
      ...(projectId && { projectId }),
      ...(labelIds && { labelIds }),
      ...(stateId && { stateId }),
    },
  };

  const response = await makeRequest(query, variables);
  return response.data?.issueCreate?.issue;
};
```

### Updating Issues

```typescript
const updateIssue = async (issueId: string, updates: any) => {
  const query = `
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          title
          description
          state {
            name
          }
        }
      }
    }
  `;

  const variables = {
    id: issueId,
    input: updates,
  };

  const response = await makeRequest(query, variables);
  return response.data?.issueUpdate?.issue;
};
```

### Getting Issues

```typescript
const getIssues = async (teamId: string, limit: number = 50) => {
  const query = `
    query($id: String!, $first: Int!) {
      team(id: $id) {
        issues(first: $first) {
          nodes {
            id
            title
            description
            state {
              name
            }
            project {
              name
            }
            labels {
              nodes {
                name
              }
            }
            parent {
              title
            }
            children {
              nodes {
                title
                state {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await makeRequest(query, { id: teamId, first: limit });
  return response.data?.team?.issues?.nodes || [];
};
```

## Labels and Workflow States

### Creating Labels

```typescript
const createLabel = async (
  teamId: string,
  name: string,
  color: string,
  description?: string
) => {
  const query = `
    mutation($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) {
        issueLabel {
          id
          name
          color
          description
        }
      }
    }
  `;

  const variables = {
    input: {
      teamId,
      name,
      color,
      ...(description && { description }),
    },
  };

  const response = await makeRequest(query, variables);
  return response.data?.issueLabelCreate?.issueLabel;
};
```

### Getting Labels

```typescript
const getLabels = async (teamId: string) => {
  const query = `
    query($id: String!) {
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
    }
  `;

  const response = await makeRequest(query, { id: teamId });
  return response.data?.team?.labels?.nodes || [];
};
```

### Getting Workflow States

```typescript
const getWorkflowStates = async (teamId: string) => {
  const query = `
    query($id: String!) {
      team(id: $id) {
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  `;

  const response = await makeRequest(query, { id: teamId });
  return response.data?.team?.states?.nodes || [];
};
```

## Milestones and Progress Tracking

### ⚠️ Important: Native Milestones Limitation

**Linear's native milestones cannot be linked to issues via the API.** They will always show "0% of 0" progress because:

1. The API doesn't support querying milestones through projects
2. Issues don't have a `milestone` field in the API
3. Milestone progress cannot be calculated programmatically

### Alternative: Milestone Parent Issues

Use milestone parent issues instead of native milestones:

```typescript
const createMilestoneParentIssue = async (
  teamId: string,
  milestoneName: string,
  description: string,
  projectId: string,
  labelIds: string[]
) => {
  const title = `[MILESTONE] ${milestoneName}`;
  const milestoneDescription = `
## Milestone: ${milestoneName}

**Target Date:** [Date]
**Description:** ${description}

**Issues in this milestone:**
- [List of sub-issues]

**Progress:** 0/X issues completed
  `;

  return await createIssue(
    teamId,
    title,
    milestoneDescription,
    projectId,
    labelIds
  );
};
```

### Linking Sub-issues to Milestone Parents

```typescript
const linkIssueToMilestoneParent = async (
  issueId: string,
  milestoneParentId: string
) => {
  return await updateIssue(issueId, {
    parentId: milestoneParentId,
  });
};
```

### Tracking Milestone Progress

```typescript
const getMilestoneProgress = async (teamId: string) => {
  const issues = await getIssues(teamId);
  const milestoneParents = issues.filter((issue) =>
    issue.title.startsWith("[MILESTONE]")
  );

  const progress = milestoneParents.map((milestone) => {
    const children = milestone.children?.nodes || [];
    const completed = children.filter(
      (child) => child.state?.name === "Done"
    ).length;
    const total = children.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      title: milestone.title,
      progress: percentage,
      completed,
      total,
      children: children.map((child) => ({
        title: child.title,
        state: child.state?.name,
      })),
    };
  });

  return progress;
};
```

## Parent-Child Relationships

### Creating Parent Issues

```typescript
const createParentIssue = async (
  teamId: string,
  title: string,
  description: string,
  projectId?: string
) => {
  return await createIssue(teamId, title, description, projectId);
};
```

### Creating Child Issues

```typescript
const createChildIssue = async (
  teamId: string,
  title: string,
  description: string,
  parentId: string,
  projectId?: string
) => {
  const issue = await createIssue(teamId, title, description, projectId);
  if (issue) {
    await updateIssue(issue.id, { parentId });
  }
  return issue;
};
```

### Getting Issue Hierarchy

```typescript
const getIssueHierarchy = async (teamId: string) => {
  const issues = await getIssues(teamId);

  // Separate parents and children
  const parents = issues.filter((issue) => !issue.parent);
  const children = issues.filter((issue) => issue.parent);

  // Build hierarchy
  const hierarchy = parents.map((parent) => ({
    ...parent,
    children: children.filter((child) => child.parent?.title === parent.title),
  }));

  return hierarchy;
};
```

## Error Handling

### Common API Errors

```typescript
const handleCommonErrors = (error: any) => {
  const errors = error.response?.data?.errors || [];

  errors.forEach((err) => {
    switch (err.message) {
      case "stateId must be a UUID.":
        console.error(
          "❌ Invalid state ID. Use workflow state UUID, not name."
        );
        break;
      case 'Field "teamId" is not defined by type "ProjectCreateInput". Did you mean "teamIds" or "leadId"?':
        console.error("❌ Use teamIds array for project creation, not teamId.");
        break;
      case 'Cannot query field "milestones" on type "Project".':
        console.error("❌ Milestones cannot be queried through projects.");
        break;
      case 'Cannot query field "milestone" on type "Issue".':
        console.error("❌ Issues do not have milestone field in API.");
        break;
      default:
        console.error("❌ Unknown error:", err.message);
    }
  });
};
```

### Validation Functions

```typescript
const validateUUID = (id: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const validateStateId = async (
  teamId: string,
  stateId: string
): Promise<boolean> => {
  const states = await getWorkflowStates(teamId);
  return states.some((state) => state.id === stateId);
};
```

## Rate Limiting

### Implementing Rate Limiting

```typescript
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createIssuesWithRateLimit = async (
  issues: any[],
  teamId: string,
  delayMs: number = 300
) => {
  const results = [];

  for (const issue of issues) {
    try {
      const result = await createIssue(
        teamId,
        issue.title,
        issue.description,
        issue.projectId,
        issue.labelIds
      );
      results.push(result);

      // Rate limiting
      await delay(delayMs);
    } catch (error) {
      console.error(`Failed to create issue: ${issue.title}`, error);
      results.push(null);
    }
  }

  return results;
};
```

### Batch Operations

```typescript
const batchUpdateIssues = async (
  updates: Array<{ id: string; updates: any }>,
  delayMs: number = 300
) => {
  const results = [];

  for (const update of updates) {
    try {
      const result = await updateIssue(update.id, update.updates);
      results.push(result);

      // Rate limiting
      await delay(delayMs);
    } catch (error) {
      console.error(`Failed to update issue: ${update.id}`, error);
      results.push(null);
    }
  }

  return results;
};
```

## Best Practices

### 1. Always Use UUIDs for State IDs

```typescript
// ❌ Wrong
const stateId = "Backlog";

// ✅ Correct
const states = await getWorkflowStates(teamId);
const backlogState = states.find((s) => s.name === "Backlog");
const stateId = backlogState?.id;
```

### 2. Use teamIds Array for Projects

```typescript
// ❌ Wrong
const input = { teamId: teamId, name: "Project Name" };

// ✅ Correct
const input = { teamIds: [teamId], name: "Project Name" };
```

### 3. Implement Proper Error Handling

```typescript
const safeCreateIssue = async (
  teamId: string,
  title: string,
  description: string
) => {
  try {
    const issue = await createIssue(teamId, title, description);
    console.log(`✅ Created issue: ${title}`);
    return issue;
  } catch (error) {
    console.error(`❌ Failed to create issue: ${title}`, error);
    return null;
  }
};
```

### 4. Use Milestone Parent Issues Instead of Native Milestones

```typescript
// ❌ Native milestones (cannot be linked to issues)
const createNativeMilestone = async () => {
  // This will not work - milestones cannot be linked to issues
};

// ✅ Milestone parent issues (can be linked to sub-issues)
const createMilestoneParent = async (
  teamId: string,
  name: string,
  projectId: string
) => {
  const title = `[MILESTONE] ${name}`;
  const description = `## Milestone: ${name}\n\n**Progress:** 0/X issues completed`;
  return await createIssue(teamId, title, description, projectId, [
    "Milestone",
  ]);
};
```

### 5. Organize Issues by Projects and Labels

```typescript
const organizeIssues = async (teamId: string) => {
  // Create projects for different phases
  const v1Project = await createProject(
    teamId,
    "V1 Core System",
    "Core functionality"
  );
  const v2Project = await createProject(
    teamId,
    "V2 Advanced Features",
    "Advanced features"
  );

  // Create labels for organization
  const v1Label = await createLabel(
    teamId,
    "V1",
    "#FF6B6B",
    "Version 1 features"
  );
  const v2Label = await createLabel(
    teamId,
    "V2",
    "#4ECDC4",
    "Version 2 features"
  );
  const milestoneLabel = await createLabel(
    teamId,
    "Milestone",
    "#45B7D1",
    "Milestone tracking"
  );

  return { v1Project, v2Project, v1Label, v2Label, milestoneLabel };
};
```

## Common Pitfalls

### 1. Using State Names Instead of UUIDs

```typescript
// ❌ This will fail
const updateIssue = async (issueId: string) => {
  return await updateIssue(issueId, { stateId: "Todo" });
};

// ✅ This will work
const updateIssue = async (issueId: string) => {
  const states = await getWorkflowStates(teamId);
  const todoState = states.find((s) => s.name === "Todo");
  return await updateIssue(issueId, { stateId: todoState?.id });
};
```

### 2. Expecting Native Milestones to Work

```typescript
// ❌ Native milestones cannot be linked to issues
const linkIssueToMilestone = async (issueId: string, milestoneId: string) => {
  // This field doesn't exist in the API
  return await updateIssue(issueId, { milestoneId });
};

// ✅ Use milestone parent issues instead
const linkIssueToMilestoneParent = async (
  issueId: string,
  milestoneParentId: string
) => {
  return await updateIssue(issueId, { parentId: milestoneParentId });
};
```

### 3. Not Handling Rate Limits

```typescript
// ❌ This might hit rate limits
const createManyIssues = async (issues: any[]) => {
  return Promise.all(issues.map((issue) => createIssue(issue)));
};

// ✅ This respects rate limits
const createManyIssues = async (issues: any[]) => {
  const results = [];
  for (const issue of issues) {
    const result = await createIssue(issue);
    results.push(result);
    await delay(300); // Rate limiting
  }
  return results;
};
```

### 4. Not Validating Inputs

```typescript
// ❌ No validation
const createIssue = async (teamId: string, title: string) => {
  return await makeRequest(query, { teamId, title });
};

// ✅ With validation
const createIssue = async (teamId: string, title: string) => {
  if (!validateUUID(teamId)) {
    throw new Error("Invalid team ID");
  }
  if (!title || title.trim().length === 0) {
    throw new Error("Title is required");
  }
  return await makeRequest(query, { teamId, title });
};
```

## Complete Examples

### Example 1: Creating a Complete Project Structure

```typescript
const createCompleteProjectStructure = async (teamId: string) => {
  try {
    // 1. Create projects
    const v1Project = await createProject(
      teamId,
      "V1 Core System",
      "Core functionality"
    );
    const v2Project = await createProject(
      teamId,
      "V2 Advanced Features",
      "Advanced features"
    );

    // 2. Create labels
    const v1Label = await createLabel(
      teamId,
      "V1",
      "#FF6B6B",
      "Version 1 features"
    );
    const v2Label = await createLabel(
      teamId,
      "V2",
      "#4ECDC4",
      "Version 2 features"
    );
    const milestoneLabel = await createLabel(
      teamId,
      "Milestone",
      "#45B7D1",
      "Milestone tracking"
    );

    // 3. Create milestone parent issues
    const foundationMilestone = await createMilestoneParentIssue(
      teamId,
      "Foundation Setup",
      "Core authentication and user management",
      v1Project.id,
      [v1Label.id, milestoneLabel.id]
    );

    // 4. Create sub-issues
    const authIssue = await createChildIssue(
      teamId,
      "Authentication Module",
      "User authentication system",
      foundationMilestone.id,
      v1Project.id
    );

    // 5. Apply labels to sub-issues
    await updateIssue(authIssue.id, { labelIds: [v1Label.id] });

    return {
      projects: { v1Project, v2Project },
      labels: { v1Label, v2Label, milestoneLabel },
      milestones: { foundationMilestone },
      issues: { authIssue },
    };
  } catch (error) {
    console.error("Failed to create project structure:", error);
    throw error;
  }
};
```

### Example 2: Migrating Team Structure

```typescript
const migrateTeamStructure = async (
  sourceTeamId: string,
  targetTeamId: string
) => {
  try {
    // 1. Get source team structure
    const sourceProjects = await getProjects(sourceTeamId);
    const sourceLabels = await getLabels(sourceTeamId);
    const sourceIssues = await getIssues(sourceTeamId);

    // 2. Create projects in target team
    const targetProjects = {};
    for (const project of sourceProjects) {
      const newProject = await createProject(
        targetTeamId,
        project.name,
        project.description
      );
      targetProjects[project.name] = newProject;
    }

    // 3. Create labels in target team
    const targetLabels = {};
    for (const label of sourceLabels) {
      const newLabel = await createLabel(
        targetTeamId,
        label.name,
        label.color,
        label.description
      );
      targetLabels[label.name] = newLabel;
    }

    // 4. Create issues in target team
    const targetIssues = {};
    for (const issue of sourceIssues) {
      const projectId = targetProjects[issue.project?.name]?.id;
      const labelIds = issue.labels?.nodes
        ?.map((l) => targetLabels[l.name]?.id)
        .filter(Boolean);

      const newIssue = await createIssue(
        targetTeamId,
        issue.title,
        issue.description,
        projectId,
        labelIds
      );
      targetIssues[issue.title] = newIssue;
    }

    // 5. Link parent-child relationships
    for (const issue of sourceIssues) {
      if (issue.parent) {
        const childIssue = targetIssues[issue.title];
        const parentIssue = targetIssues[issue.parent.title];
        if (childIssue && parentIssue) {
          await updateIssue(childIssue.id, { parentId: parentIssue.id });
        }
      }
    }

    return { targetProjects, targetLabels, targetIssues };
  } catch (error) {
    console.error("Failed to migrate team structure:", error);
    throw error;
  }
};
```

### Example 3: Progress Tracking System

```typescript
const createProgressTrackingSystem = async (teamId: string) => {
  try {
    // 1. Create milestone labels
    const milestoneLabels = [
      { name: "Foundation Setup", color: "#FF6B6B" },
      { name: "Class Management", color: "#4ECDC4" },
      { name: "Scheduling Engine", color: "#45B7D1" },
      { name: "System Integration", color: "#96CEB4" },
    ];

    const createdLabels = {};
    for (const label of milestoneLabels) {
      const newLabel = await createLabel(teamId, label.name, label.color);
      createdLabels[label.name] = newLabel;
    }

    // 2. Create milestone parent issues
    const milestones = {};
    for (const [index, label] of milestoneLabels.entries()) {
      const milestone = await createMilestoneParentIssue(
        teamId,
        label.name,
        `Milestone ${index + 1} description`,
        projectId,
        [createdLabels[label.name].id]
      );
      milestones[label.name] = milestone;
    }

    // 3. Create sub-issues and link to milestones
    const subIssues = [
      { title: "Authentication Module", milestone: "Foundation Setup" },
      { title: "User Registration Module", milestone: "Foundation Setup" },
      { title: "Class Creation Module", milestone: "Class Management" },
      { title: "Class Scheduling Module", milestone: "Class Management" },
    ];

    for (const subIssue of subIssues) {
      const milestoneParent = milestones[subIssue.milestone];
      const issue = await createChildIssue(
        teamId,
        subIssue.title,
        `Description for ${subIssue.title}`,
        milestoneParent.id,
        projectId
      );
    }

    // 4. Track progress
    const progress = await getMilestoneProgress(teamId);
    console.log("Milestone Progress:", progress);

    return { milestones, progress };
  } catch (error) {
    console.error("Failed to create progress tracking system:", error);
    throw error;
  }
};
```

## Conclusion

This guide covers all the essential patterns for working with Linear's GraphQL API. Key takeaways:

1. **Always use UUIDs for state IDs** - Never use state names
2. **Use teamIds array for projects** - Not teamId
3. **Native milestones cannot be linked to issues** - Use milestone parent issues instead
4. **Implement proper rate limiting** - Add delays between API calls
5. **Handle errors gracefully** - Validate inputs and catch API errors
6. **Use parent-child relationships** - For hierarchical issue organization
7. **Organize with projects and labels** - For better issue management

The Linear API is powerful but has specific limitations that must be understood to build effective integrations. This guide provides the foundation for creating robust Linear integrations.
