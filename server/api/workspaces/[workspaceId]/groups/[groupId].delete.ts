import { MemberRole } from "@prisma/client";

import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { revokeConversationAccess } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";
import { enqueueConversationDelete } from "~/server/lib/mattermost/domain-events";

export default defineEventHandler(async (event) => {
  const { workspaceId, groupId } = getRouterParams(event);
  await ensureWorkspaceAccess(event, workspaceId, [MemberRole.ADMIN]);

  const group = await prisma.workspaceGroup.findFirst({
    where: { id: groupId, workspaceId },
    select: {
      id: true,
      conversation: {
        select: {
          id: true,
          mattermostLink: { select: { mattermostChannelId: true } },
          participants: { select: { userId: true } },
        },
      },
    },
  });
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: "Group not found" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { assigneeGroupId: groupId },
      data: { assigneeGroupId: null },
    });
    if (group.conversation?.mattermostLink) {
      await enqueueConversationDelete(tx, {
        conversationId: group.conversation.id,
        mattermostChannelId:
          group.conversation.mattermostLink.mattermostChannelId,
      });
    }
    await tx.workspaceGroup.delete({ where: { id: groupId } });
  });
  if (group.conversation) {
    await revokeConversationAccess(
      group.conversation.id,
      group.conversation.participants.map((participant) => participant.userId),
    );
  }
  broadcastInboxEvent(workspaceId, { type: "INBOX_UPDATED", workspaceId });
  return { ok: true };
});
