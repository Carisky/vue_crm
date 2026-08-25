import { ConversationType, MemberRole, Prisma } from "@prisma/client";

import { UpdateWorkspaceGroupSchema } from "~/lib/schema/workspaceGroup";
import prisma from "~/server/lib/prisma";
import { serializeWorkspaceGroup } from "~/server/lib/serializers";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import {
  assertWorkspaceGroupMembers,
  uniqueGroupMemberIds,
} from "~/server/lib/workspace-groups";
import { syncConversationParticipants } from "~/server/lib/workspace-channels";
import { revokeConversationAccess } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";

export default defineEventHandler(async (event) => {
  const { workspaceId, groupId } = getRouterParams(event);
  await ensureWorkspaceAccess(event, workspaceId, [MemberRole.ADMIN]);

  const params = await readValidatedBody(event, (body) =>
    UpdateWorkspaceGroupSchema.safeParse(body),
  );
  if (!params.success) {
    throw createError({ statusCode: 400, statusMessage: params.error.message });
  }
  const existing = await prisma.workspaceGroup.findFirst({
    where: { id: groupId, workspaceId },
    include: { members: { select: { userId: true } } },
  });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Group not found" });
  }
  const memberIds = params.data.member_ids
    ? uniqueGroupMemberIds(params.data.member_ids)
    : existing.members.map((member) => member.userId);

  try {
    const group = await prisma.$transaction(async (tx) => {
      await assertWorkspaceGroupMembers(tx, workspaceId, memberIds);
      await tx.workspaceGroup.update({
        where: { id: groupId },
        data: {
          ...(params.data.name !== undefined ? { name: params.data.name } : {}),
          ...(params.data.description !== undefined
            ? { description: params.data.description ?? null }
            : {}),
          ...(params.data.color !== undefined
            ? { color: params.data.color ?? null }
            : {}),
        },
      });

      if (params.data.member_ids !== undefined) {
        await tx.workspaceGroupMember.deleteMany({ where: { groupId } });
        if (memberIds.length) {
          await tx.workspaceGroupMember.createMany({
            data: memberIds.map((userId) => ({ groupId, userId })),
          });
        }
      }

      const conversation = await tx.conversation.upsert({
        where: { groupId },
        create: {
          workspaceId,
          type: ConversationType.GROUP,
          name: params.data.name ?? existing.name,
          channelKey: `group:${groupId}`,
          groupId,
        },
        update: {
          name: params.data.name ?? existing.name,
          type: ConversationType.GROUP,
        },
        select: { id: true },
      });
      await syncConversationParticipants(tx, conversation.id, memberIds);

      return tx.workspaceGroup.findUniqueOrThrow({
        where: { id: groupId },
        include: {
          members: { include: { user: true } },
          conversation: { select: { id: true } },
        },
      });
    });
    const removedMemberIds = existing.members
      .map((member) => member.userId)
      .filter((userId) => !memberIds.includes(userId));
    if (group.conversation && removedMemberIds.length) {
      await revokeConversationAccess(group.conversation.id, removedMemberIds);
    }
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
