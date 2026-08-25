import { ConversationType, MemberRole, Prisma } from "@prisma/client";

import { CreateWorkspaceGroupSchema } from "~/lib/schema/workspaceGroup";
import prisma from "~/server/lib/prisma";
import { serializeWorkspaceGroup } from "~/server/lib/serializers";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";
import {
  assertWorkspaceGroupMembers,
  uniqueGroupMemberIds,
} from "~/server/lib/workspace-groups";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);
  await ensureWorkspaceAccess(event, workspaceId, [MemberRole.ADMIN]);

  const params = await readValidatedBody(event, (body) =>
    CreateWorkspaceGroupSchema.safeParse(body),
  );
  if (!params.success) {
    throw createError({ statusCode: 400, statusMessage: params.error.message });
  }
  const memberIds = uniqueGroupMemberIds(params.data.member_ids);

  try {
    const group = await prisma.$transaction(async (tx) => {
      await assertWorkspaceGroupMembers(tx, workspaceId, memberIds);
      const created = await tx.workspaceGroup.create({
        data: {
          workspaceId,
          name: params.data.name,
          description: params.data.description ?? null,
          color: params.data.color ?? null,
          members: {
            create: memberIds.map((userId) => ({ userId })),
          },
        },
      });
      await tx.conversation.create({
        data: {
          workspaceId,
          type: ConversationType.GROUP,
          name: created.name,
          channelKey: `group:${created.id}`,
          groupId: created.id,
          participants: {
            create: memberIds.map((userId) => ({
              userId,
              lastReadAt: new Date(),
            })),
          },
        },
      });
      return tx.workspaceGroup.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          members: { include: { user: true } },
          conversation: { select: { id: true } },
        },
      });
    });
    broadcastInboxEvent(workspaceId, { type: "INBOX_UPDATED", workspaceId });
    return { group: serializeWorkspaceGroup(group) };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: "Group name already exists",
      });
    }
    throw error;
  }
});
