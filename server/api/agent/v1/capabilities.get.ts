import { getRequestURL } from "h3";

import { requireAgentApiKey } from "~/server/lib/agent-api-key";

export default defineEventHandler(async (event) => {
  await requireAgentApiKey(event);
  const baseUrl = new URL("/api/agent/v1", getRequestURL(event)).toString().replace(/\/$/, "");
  return {
    api: "collab-agent-api",
    version: "1.0",
    base_url: baseUrl,
    authentication: "Authorization: Bearer clb_live_…",
    safety: "All mutations create PENDING proposals and require manual approval in the profile.",
    endpoints: {
      workspaces: "GET /workspaces",
      context: "GET /workspaces/{workspaceId}/context",
      proposals: "POST /proposals",
      proposal_status: "GET /proposals/{proposalId}",
    },
    operation_types: [
      "project.create",
      "project.update",
      "task.create",
      "task.update",
    ],
    task_statuses: ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"],
    task_priorities: ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "REAL_TIME"],
    limits: { operations_per_proposal: 50, requests_per_minute: 120 },
  };
});
