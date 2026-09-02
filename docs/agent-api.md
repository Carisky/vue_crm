# Collab Agent API

The Agent API gives an external AI agent read access to the current user's workspaces, projects, tasks, members, and groups. It never writes project data directly. Mutation requests are stored as proposals and must be approved or rejected by the key owner under **Profile → AI agent access**.

## Setup

1. Apply the Prisma migration and deploy the application.
2. Open Profile, enter a key name, and generate an API key.
3. Copy the `clb_live_…` token immediately; only its one-way hash is stored.
4. Configure the agent process:

   ```text
   COLLAB_API_URL=https://your-collab-host.example
   COLLAB_API_KEY=clb_live_…
   ```

Revoke a key from Profile at any time. Revocation takes effect on its next request.

The application-level Basic Auth middleware explicitly allows
`/api/agent/v1/*` through because these routes authenticate every request with
their own Bearer API key. If a reverse proxy also enforces Basic Auth, allow the
same path there.

## API v1

Use `Authorization: Bearer <key>` with every request. The base path is
`/api/agent/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/capabilities` | Machine-readable API version, operations, enums, and limits |
| `GET` | `/workspaces` | Workspaces accessible to the key owner |
| `GET` | `/workspaces/{workspaceId}/context` | Project/task hierarchy, members, and groups |
| `POST` | `/proposals` | Queue an atomic proposal for manual review |
| `GET` | `/proposals/{proposalId}` | Read the proposal's current status |

The API accepts `project.create`, `project.update`, `task.create`, and `task.update`. A proposal may contain up to 50 sequential operations. A create operation can declare a client `ref`; later operations can use `project_ref`, `parent_project_ref`, or `parent_task_ref` to build a complete hierarchy before any database IDs exist.

Example:

```json
{
  "title": "Create onboarding project and first task",
  "summary": "Generated from the approved onboarding requirements.",
  "workspace_id": "workspace-id",
  "operations": [
    {
      "type": "project.create",
      "ref": "onboarding",
      "workspace_id": "workspace-id",
      "name": "Customer onboarding",
      "parent_project_id": null
    },
    {
      "type": "task.create",
      "workspace_id": "workspace-id",
      "project_ref": "onboarding",
      "name": "Confirm acceptance criteria",
      "description": "Review requirements with the project owner.",
      "status": "BACKLOG",
      "priority": "MEDIUM"
    }
  ]
}
```

The server validates resource ownership and permissions on submission and again on approval. Project changes require an admin membership; task changes require workspace membership. Approval is transactional: either every operation is applied or none are.

## Security properties

- API keys are random 256-bit secrets with a recognizable prefix and are stored as a SHA-256 hash peppered with `SESSION_SECRET`.
- Full keys are returned only once, during generation.
- Agent requests are limited to 120 requests per key per minute per server process.
- Read queries are always scoped to the key owner's current workspace memberships.
- Agent endpoints expose no approval or direct-write operation.
- Revoked and expired keys are rejected.
