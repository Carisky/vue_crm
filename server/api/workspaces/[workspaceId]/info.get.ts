import prisma from "~/server/lib/prisma";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });

  if (!workspace) {
    throw createError({ status: 404, statusText: "Workspace not found" });
  }

  return workspace;
});
