import { canRemoveWorkspaceMember } from "~/server/lib/member-removal-policy";
import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { revokeConversationAccess } from "~/server/lib/conversation-events";
import { broadcastInboxEvent } from "~/server/lib/inbox-events";
import {
  enqueueConversationUpsert,
  enqueueMembershipDelete,
} from "~/server/lib/mattermost/domain-events";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { membershipId } = await readBody<{
    membershipId?: string;
  }>(event);

  if (!membershipId) {
    throw createError({ status: 400, statusText: "Member ID required" });
  }

  const membershipToDelete = await prisma.member.findUnique({
    where: { id: membershipId },
    include: {
      workspace: { include: { mattermostLink: true } },
      user: { include: { mattermostLink: true } },
    },
  });

  if (!membershipToDelete) {
    throw createError({ status: 404, statusText: "Member not found" });
  }

  const memberships = await prisma.member.findMany({
    where: { workspaceId: membershipToDelete.workspaceId },
  });

  const currentMembership = memberships.find(
    (membership) => membership.userId === user.id,
  );

  if (!currentMembership) {
    throw createError({ status: 401, statusText: "Unauthorized" });
  }

  if (
    !canRemoveWorkspaceMember({
      actorUserId: user.id,
      actorRole: currentMembership.role,
      targetUserId: membershipToDelete.userId,
      targetRole: membershipToDelete.role,
      ownerId: membershipToDelete.workspace.ownerId,
    })
  ) {
    throw createError({ status: 403, statusText: "Forbidden" });
  }

  if (memberships.length === 1) {
    throw createError({
      status: 400,
      statusText: "Cannot delete the only workspace member",
    });
  }

  const conversationParticipants =
    await prisma.conversationParticipant.findMany({
      where: {
        userId: membershipToDelete.userId,
        conversation: { workspaceId: membershipToDelete.workspaceId },
      },
      select: { conversationId: true },
    });

  await prisma.$transaction(async (tx) => {
    await tx.workspaceGroupMember.deleteMany({
      where: {
        userId: membershipToDelete.userId,
        group: { workspaceId: membershipToDelete.workspaceId },
      },
    });
    await tx.conversationParticipant.deleteMany({
      where: {
        userId: membershipToDelete.userId,
        conversation: { workspaceId: membershipToDelete.workspaceId },
      },
    });
    await tx.member.delete({ where: { id: membershipToDelete.id } });
    const teamId = membershipToDelete.workspace.mattermostLink?.mattermostTeamId;
    const remoteUserId =
      membershipToDelete.user.mattermostLink?.mattermostUserId;
    if (teamId && remoteUserId) {
      await enqueueMembershipDelete(tx, {
        workspaceId: membershipToDelete.workspaceId,
        userId: membershipToDelete.userId,
        mattermostTeamId: teamId,
        mattermostUserId: remoteUserId,
      });
    }
    for (const participant of conversationParticipants) {
      await enqueueConversationUpsert(tx, {
        conversationId: participant.conversationId,
      });
    }
  });

  await Promise.all(
    conversationParticipants.map((participant) =>
      revokeConversationAccess(participant.conversationId, [
        membershipToDelete.userId,
      ]),
    ),
  );
  broadcastInboxEvent(membershipToDelete.workspaceId, {
    type: "INBOX_UPDATED",
    workspaceId: membershipToDelete.workspaceId,
  });

  return { ok: true };
});
