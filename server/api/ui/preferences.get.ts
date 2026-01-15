import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

const QuerySchema = z.object({
  workspace_id: z.string().min(1),
  key: z.string().min(1).max(191),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const parsed = QuerySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({ status: 400, statusText: parsed.error.message });
  }

  const { workspace_id, key } = parsed.data;
  await requireWorkspaceMembership(event, workspace_id);

  const pref = await prisma.uiPreference.findUnique({
    where: {
      userId_workspaceId_key: {
        userId: user.id,
        workspaceId: workspace_id,
        key,
      },
    },
    select: { value: true },
  });

  return { value: pref?.value ?? null };
});

