import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { requireUser } from "~/server/lib/permissions";

const CreateDirectConversationSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const params = await readValidatedBody(event, (body) =>
    CreateDirectConversationSchema.safeParse(body),
  );

  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const workspaceId = params.data.workspace_id;
  const otherUserId = params.data.user_id;

  await ensureWorkspaceAccess(event, workspaceId);

  if (otherUserId === user.id) {
    throw createError({
      status: 400,
      statusText: "Cannot create a conversation with yourself",
    });
  }

  const otherMembership = await prisma.member.findFirst({
    where: { workspaceId, userId: otherUserId },
    select: { id: true },
  });
  if (!otherMembership) {
    throw createError({
      status: 400,
      statusText: "User is not a member of this workspace",
    });
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      workspaceId,
      AND: [
        { participants: { some: { userId: user.id } } },
        { participants: { some: { userId: otherUserId } } },
        {
          participants: {
            every: {
              userId: { in: [user.id, otherUserId] },
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    return { conversation_id: existing.id };
  }

  const now = new Date();
  const created = await prisma.conversation.create({
    data: {
      workspaceId,
      participants: {
        create: [
          { userId: user.id, lastReadAt: now },
          { userId: otherUserId, lastReadAt: now },
        ],
      },
    },
    select: { id: true },
  });

  return { conversation_id: created.id };
});

