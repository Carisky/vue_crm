import { createError } from "h3";
import type { H3Event } from "h3";

import prisma from "./prisma";
import { requireWorkspaceMembership } from "./permissions";

export async function getWorkspaceOrThrow(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    throw createError({ status: 404, statusText: "Workspace not found" });
  }

  return workspace;
}

export async function ensureWorkspaceAccess(
  event: H3Event,
  workspaceId: string,
  roles?: Parameters<typeof requireWorkspaceMembership>[2],
) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  const membership = await requireWorkspaceMembership(event, workspaceId, roles);

  return { workspace, membership };
}
