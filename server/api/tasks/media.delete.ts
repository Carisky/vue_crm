import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";
import { deleteTaskMediaFile } from "~/server/lib/task-media";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { path, workspace_id } = await readBody<{
    path?: string;
    workspace_id?: string;
  }>(event);

  if (!path) {
    throw createError({ status: 400, statusText: "Media path required" });
  }

  if (!workspace_id) {
    throw createError({ status: 400, statusText: "Workspace ID required" });
  }

  await requireWorkspaceMembership(event, workspace_id);

  await deleteTaskMediaFile(path);

  return { ok: true };
});
