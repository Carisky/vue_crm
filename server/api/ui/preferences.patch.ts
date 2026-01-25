import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

const BodySchema = z.object({
  workspace_id: z.string().min(1),
  key: z.string().min(1).max(191),
  value: z.record(z.union([z.boolean(), z.number()])),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody(event);

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ status: 400, statusText: parsed.error.message });
  }

  const { workspace_id, key, value } = parsed.data;
  await requireWorkspaceMembership(event, workspace_id);

  await prisma.uiPreference.upsert({
    where: {
      userId_workspaceId_key: {
        userId: user.id,
        workspaceId: workspace_id,
        key,
      },
    },
    create: {
      userId: user.id,
      workspaceId: workspace_id,
      key,
      value,
    },
    update: { value },
    select: { id: true },
  });

  return { ok: true };
});
