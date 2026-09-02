import {
  AgentProposalStatus,
  MemberRole,
  Prisma,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";
import { createError } from "h3";

import {
  CreateAgentProposalSchema,
  summarizeAgentOperation,
  type AgentOperation,
  type CreateAgentProposal,
} from "~/lib/schema/agentProposal";
import prisma from "./prisma";
import { serializeAgentApiKey } from "./agent-api-key";

type Db = Prisma.TransactionClient | typeof prisma;
type AppliedResource = {
  operation: AgentOperation["type"];
  id: string;
  ref: string | null;
};

function badRequest(statusText: string): never {
  throw createError({ status: 400, statusText });
}

async function requireMembership(db: Db, userId: string, workspaceId: string) {
  const membership = await db.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) {
    throw createError({ status: 403, statusText: "Workspace access denied" });
  }
  return membership;
}

async function assertProjectInWorkspace(
  db: Db,
  projectId: string,
  workspaceId: string,
) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || project.workspaceId !== workspaceId) {
    badRequest(`Project ${projectId} was not found in this workspace`);
  }
  return project;
}

async function assertTaskInWorkspace(
  db: Db,
  taskId: string,
  workspaceId: string,
) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.workspaceId !== workspaceId) {
    badRequest(`Task ${taskId} was not found in this workspace`);
  }
  return task;
}

async function assertAssignee(
  db: Db,
  workspaceId: string,
  operation: Extract<AgentOperation, { type: "task.create" | "task.update" }>,
) {
  if (operation.assignee_id) {
    const membership = await db.member.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: operation.assignee_id,
        },
      },
    });
    if (!membership) badRequest("Task assignee is not a workspace member");
  }
  if (operation.assignee_group_id) {
    const group = await db.workspaceGroup.findFirst({
      where: { id: operation.assignee_group_id, workspaceId },
    });
    if (!group) badRequest("Task assignee group was not found");
  }
}

export async function assertAgentProposalAccess(
  data: CreateAgentProposal,
  userId: string,
  db: Db = prisma,
) {
  const membership = await requireMembership(db, userId, data.workspace_id);

  for (const operation of data.operations) {
    if (
      (operation.type === "project.create" ||
        operation.type === "project.update") &&
      membership.role !== MemberRole.ADMIN
    ) {
      throw createError({
        status: 403,
        statusText: "Only workspace admins can propose project changes",
      });
    }

    if (operation.type === "project.create" && operation.parent_project_id) {
      await assertProjectInWorkspace(
        db,
        operation.parent_project_id,
        data.workspace_id,
      );
    } else if (operation.type === "project.update") {
      await assertProjectInWorkspace(db, operation.project_id, data.workspace_id);
    } else if (operation.type === "task.create") {
      if (operation.project_id) {
        await assertProjectInWorkspace(db, operation.project_id, data.workspace_id);
      }
      if (operation.parent_task_id) {
        await assertTaskInWorkspace(db, operation.parent_task_id, data.workspace_id);
      }
      await assertAssignee(db, data.workspace_id, operation);
    } else if (operation.type === "task.update") {
      await assertTaskInWorkspace(db, operation.task_id, data.workspace_id);
      await assertAssignee(db, data.workspace_id, operation);
    }
  }
}

export async function createAgentProposal(input: {
  body: unknown;
  userId: string;
  apiKeyId: string;
}) {
  const parsed = CreateAgentProposalSchema.safeParse(input.body);
  if (!parsed.success) {
    throw createError({
      status: 400,
      statusText: parsed.error.issues.map((issue) => issue.message).join("; "),
    });
  }

  await assertAgentProposalAccess(parsed.data, input.userId);
  return await prisma.agentProposal.create({
    data: {
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      workspaceId: parsed.data.workspace_id,
      title: parsed.data.title,
      summary: parsed.data.summary,
      operations: parsed.data.operations as Prisma.InputJsonValue,
    },
  });
}

function resolveRef(
  refs: Map<string, { id: string; kind: "project" | "task" }>,
  ref: string | undefined,
  kind: "project" | "task",
) {
  if (!ref) return undefined;
  const resolved = refs.get(ref);
  if (!resolved || resolved.kind !== kind) {
    badRequest(`Reference ${ref} does not identify a ${kind}`);
  }
  return resolved.id;
}

async function applyOperations(
  db: Prisma.TransactionClient,
  data: CreateAgentProposal,
) {
  const refs = new Map<string, { id: string; kind: "project" | "task" }>();
  const applied: AppliedResource[] = [];

  for (const operation of data.operations) {
    if (operation.type === "project.create") {
      const parentId =
        operation.parent_project_id ??
        resolveRef(refs, operation.parent_project_ref, "project") ??
        null;
      if (parentId) {
        await assertProjectInWorkspace(db, parentId, data.workspace_id);
      }
      const project = await db.project.create({
        data: {
          workspaceId: data.workspace_id,
          parentId,
          name: operation.name,
        },
      });
      if (operation.ref) refs.set(operation.ref, { id: project.id, kind: "project" });
      applied.push({ operation: operation.type, id: project.id, ref: operation.ref ?? null });
      continue;
    }

    if (operation.type === "project.update") {
      await assertProjectInWorkspace(db, operation.project_id, data.workspace_id);
      const project = await db.project.update({
        where: { id: operation.project_id },
        data: { name: operation.name },
      });
      applied.push({ operation: operation.type, id: project.id, ref: null });
      continue;
    }

    if (operation.type === "task.create") {
      const projectId =
        operation.project_id ?? resolveRef(refs, operation.project_ref, "project");
      if (!projectId) badRequest("Task project is required");
      await assertProjectInWorkspace(db, projectId, data.workspace_id);

      const parentId =
        operation.parent_task_id ??
        resolveRef(refs, operation.parent_task_ref, "task") ??
        null;
      if (parentId) {
        const parent = await assertTaskInWorkspace(db, parentId, data.workspace_id);
        if (parent.projectId !== projectId) {
          badRequest("A task and its parent must belong to the same project");
        }
      }
      await assertAssignee(db, data.workspace_id, operation);
      const highest = await db.task.findFirst({
        where: { workspaceId: data.workspace_id, status: operation.status as TaskStatus },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const task = await db.task.create({
        data: {
          workspaceId: data.workspace_id,
          projectId,
          parentId,
          name: operation.name,
          description: operation.description,
          status: operation.status as TaskStatus,
          priority: operation.priority as TaskPriority,
          dueDate: operation.due_date ? new Date(operation.due_date) : null,
          startedAt: operation.started_at ? new Date(operation.started_at) : null,
          assigneeId: operation.assignee_id ?? null,
          assigneeGroupId: operation.assignee_group_id ?? null,
          position: (highest?.position ?? 1000) + 1,
        },
      });
      if (operation.ref) refs.set(operation.ref, { id: task.id, kind: "task" });
      applied.push({ operation: operation.type, id: task.id, ref: operation.ref ?? null });
      continue;
    }

    const task = await assertTaskInWorkspace(db, operation.task_id, data.workspace_id);
    await assertAssignee(db, data.workspace_id, operation);
    const update: Prisma.TaskUncheckedUpdateInput = {};
    if (operation.name !== undefined) update.name = operation.name;
    if (operation.description !== undefined) update.description = operation.description;
    if (operation.status !== undefined) update.status = operation.status as TaskStatus;
    if (operation.priority !== undefined) update.priority = operation.priority as TaskPriority;
    if (Object.hasOwn(operation, "due_date")) {
      update.dueDate = operation.due_date ? new Date(operation.due_date) : null;
    }
    if (Object.hasOwn(operation, "started_at")) {
      update.startedAt = operation.started_at ? new Date(operation.started_at) : null;
    }
    if (Object.hasOwn(operation, "assignee_id")) {
      update.assigneeId = operation.assignee_id ?? null;
      if (!Object.hasOwn(operation, "assignee_group_id")) update.assigneeGroupId = null;
    }
    if (Object.hasOwn(operation, "assignee_group_id")) {
      update.assigneeGroupId = operation.assignee_group_id ?? null;
      if (!Object.hasOwn(operation, "assignee_id")) update.assigneeId = null;
    }
    await db.task.update({ where: { id: task.id }, data: update });
    applied.push({ operation: operation.type, id: task.id, ref: null });
  }

  return applied;
}

export async function approveAgentProposal(proposalId: string, userId: string) {
  const proposal = await prisma.agentProposal.findFirst({
    where: { id: proposalId, userId },
  });
  if (!proposal) throw createError({ status: 404, statusText: "Proposal not found" });
  if (proposal.status !== AgentProposalStatus.PENDING) {
    throw createError({ status: 409, statusText: "Proposal was already reviewed" });
  }

  const parsed = CreateAgentProposalSchema.safeParse({
    title: proposal.title,
    summary: proposal.summary ?? undefined,
    workspace_id: proposal.workspaceId,
    operations: proposal.operations,
  });
  if (!parsed.success) {
    throw createError({ status: 400, statusText: "Stored proposal is invalid" });
  }
  await assertAgentProposalAccess(parsed.data, userId);

  try {
    const result = await prisma.$transaction(async (db) => {
      const claimed = await db.agentProposal.updateMany({
        where: { id: proposalId, userId, status: AgentProposalStatus.PENDING },
        data: { status: AgentProposalStatus.APPROVED, reviewedAt: new Date(), error: null },
      });
      if (claimed.count !== 1) {
        throw createError({ status: 409, statusText: "Proposal was already reviewed" });
      }
      const applied = await applyOperations(db, parsed.data);
      await db.agentProposal.update({
        where: { id: proposalId },
        data: { result: applied as Prisma.InputJsonValue },
      });
      return applied;
    });
    return { proposal_id: proposalId, status: "APPROVED" as const, applied: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proposal could not be applied";
    await prisma.agentProposal.updateMany({
      where: { id: proposalId, userId, status: AgentProposalStatus.PENDING },
      data: { status: AgentProposalStatus.FAILED, reviewedAt: new Date(), error: message },
    });
    throw error;
  }
}

export async function rejectAgentProposal(proposalId: string, userId: string) {
  const updated = await prisma.agentProposal.updateMany({
    where: { id: proposalId, userId, status: AgentProposalStatus.PENDING },
    data: { status: AgentProposalStatus.REJECTED, reviewedAt: new Date() },
  });
  if (updated.count !== 1) {
    const exists = await prisma.agentProposal.count({ where: { id: proposalId, userId } });
    throw createError({
      status: exists ? 409 : 404,
      statusText: exists ? "Proposal was already reviewed" : "Proposal not found",
    });
  }
  return { proposal_id: proposalId, status: "REJECTED" as const };
}

export function serializeAgentProposal(proposal: {
  id: string;
  title: string;
  summary: string | null;
  workspaceId: string;
  operations: Prisma.JsonValue;
  status: AgentProposalStatus;
  result: Prisma.JsonValue | null;
  error: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  apiKey?: Parameters<typeof serializeAgentApiKey>[0] | null;
  workspace?: { name: string };
}) {
  const operations = Array.isArray(proposal.operations)
    ? (proposal.operations as AgentOperation[])
    : [];
  return {
    id: proposal.id,
    title: proposal.title,
    summary: proposal.summary,
    workspace_id: proposal.workspaceId,
    workspace_name: proposal.workspace?.name ?? null,
    status: proposal.status,
    operations,
    operation_summaries: operations.map(summarizeAgentOperation),
    result: proposal.result,
    error: proposal.error,
    api_key: proposal.apiKey ? serializeAgentApiKey(proposal.apiKey) : null,
    reviewed_at: proposal.reviewedAt?.toISOString() ?? null,
    created_at: proposal.createdAt.toISOString(),
  };
}
