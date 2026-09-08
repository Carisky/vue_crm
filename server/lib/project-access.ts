import { createError, type H3Event } from "h3";

import {
  calculateVisibleProjectIds,
  type ProjectAccessNode,
} from "./project-access-policy.ts";

type AccessMembership = { userId: string; role: "ADMIN" | "MEMBER" };

export type ProjectAccessDatabase = {
  member: {
    findUnique(input: unknown): Promise<AccessMembership | null>;
    findMany(input: unknown): Promise<AccessMembership[]>;
  };
  project: {
    findMany(input: unknown): Promise<ProjectAccessNode[]>;
  };
  projectAccess: {
    findMany(input: unknown): Promise<Array<{ projectId: string; userId: string }>>;
  };
};

export async function getVisibleProjectIdsForUser(
  db: ProjectAccessDatabase,
  input: { workspaceId: string; userId: string },
) {
  const membership = await db.member.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    },
    select: { userId: true, role: true },
  });
  if (!membership) return new Set<string>();

  const projects = await db.project.findMany({
    where: { workspaceId: input.workspaceId },
    select: {
      id: true,
      parentId: true,
      visibility: true,
      creatorId: true,
    },
  });
  const grants = membership.role === "ADMIN"
    ? []
    : await db.projectAccess.findMany({
        where: { userId: input.userId, project: { workspaceId: input.workspaceId } },
        select: { projectId: true, userId: true },
      });

  return calculateVisibleProjectIds({
    userId: input.userId,
    isAdmin: membership.role === "ADMIN",
    projects,
    grantedProjectIds: new Set(grants.map(({ projectId }) => projectId)),
  });
}

type ProjectAccessEventContext = H3Event["context"] & {
  projectVisibilityCache?: Map<string, Set<string>>;
};

export async function getVisibleProjectIds(event: H3Event, workspaceId: string) {
  const user = event.context.user;
  if (!user) throw createError({ status: 401, statusText: "Unauthorized" });

  const context = event.context as ProjectAccessEventContext;
  context.projectVisibilityCache ??= new Map();
  const cacheKey = `${workspaceId}:${user.id}`;
  const cached = context.projectVisibilityCache.get(cacheKey);
  if (cached) return cached;

  const { default: prisma } = await import("./prisma.ts");
  const visible = await getVisibleProjectIdsForUser(
    prisma as unknown as ProjectAccessDatabase,
    { workspaceId, userId: user.id },
  );
  context.projectVisibilityCache.set(cacheKey, visible);
  return visible;
}

export async function requireProjectAccess(event: H3Event, projectId: string) {
  const user = event.context.user;
  if (!user) throw createError({ status: 401, statusText: "Unauthorized" });
  const { default: prisma } = await import("./prisma.ts");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  const visible = await getVisibleProjectIds(event, project.workspaceId);
  if (!visible.has(project.id)) {
    throw createError({ status: 404, statusText: "Project not found" });
  }
  const membership = await prisma.member.findUniqueOrThrow({
    where: {
      workspaceId_userId: {
        workspaceId: project.workspaceId,
        userId: user.id,
      },
    },
  });
  return { project, membership };
}

export async function getProjectVisibleUserIds(
  db: ProjectAccessDatabase,
  input: { workspaceId: string; projectId: string },
) {
  const members = await db.member.findMany({
    where: { workspaceId: input.workspaceId },
    select: { userId: true, role: true },
  });
  const visibleUsers = new Set<string>();
  for (const member of members) {
    const visible = await getVisibleProjectIdsForUser(db, {
      workspaceId: input.workspaceId,
      userId: member.userId,
    });
    if (visible.has(input.projectId)) visibleUsers.add(member.userId);
  }
  return visibleUsers;
}
