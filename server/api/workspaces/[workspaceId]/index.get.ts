import { MemberRole } from "@prisma/client";

import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeWorkspace } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);
  const user = requireUser(event);

  const { workspace, membership } = await ensureWorkspaceAccess(
    event,
    workspaceId,
  );

  return {
    workspace: serializeWorkspace(workspace),
    is_owner: workspace.ownerId === user.id,
    is_admin: membership.role === MemberRole.ADMIN,
  };
});
