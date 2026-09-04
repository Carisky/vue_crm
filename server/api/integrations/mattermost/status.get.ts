import { MemberRole } from "@prisma/client";
import { getMattermostStatusWithRuntime } from "~/server/lib/mattermost/status";
import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";

export default defineEventHandler(async (event) => {
  requireUser(event);
  const workspaceId = getQuery(event).workspace_id;
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw createError({ status: 400, statusText: "workspace_id is required" });
  }
  const { workspace, membership } = await ensureWorkspaceAccess(
    event,
    workspaceId,
  );
  if (
    workspace.ownerId !== event.context.user?.id &&
    membership.role !== MemberRole.ADMIN
  ) {
    throw createError({
      status: 403,
      statusText: "Administrator access required",
    });
  }
  return getMattermostStatusWithRuntime();
});
