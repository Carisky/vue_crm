import { canRemoveWorkspaceMember } from "~/server/lib/member-removal-policy";
import { isForceAdminEmail } from "~/server/lib/force-admins";
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
  const { membershipId, successorUserId } = await readBody<{
    membershipId?: string;
    successorUserId?: string;
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
      targetIsForcedAdmin: isForceAdminEmail(membershipToDelete.user.email),
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

  const ownedProjectCount = await prisma.project.count({
    where: {
      workspaceId: membershipToDelete.workspaceId,
      creatorId: membershipToDelete.userId,
    },
  });
  let successorAncestorGrantIds: string[] = [];
  if (ownedProjectCount) {
    const successor = memberships.find(
      (membership) =>
        membership.userId === successorUserId &&
        membership.userId !== membershipToDelete.userId,
    );
    if (!successor) {
      throw createError({
        status: 400,
        statusText: "Select a project owner successor",
      });
    }
    const workspaceProjects = await prisma.project.findMany({
      where: { workspaceId: membershipToDelete.workspaceId },
      select: { id: true, parentId: true, creatorId: true, visibility: true },
    });
    const byId = new Map(workspaceProjects.map((project) => [project.id, project]));
    const grantIds = new Set<string>();
    for (const project of workspaceProjects) {
      if (project.creatorId !== membershipToDelete.userId) continue;
      let ancestor = project.parentId ? byId.get(project.parentId) : undefined;
      const visited = new Set<string>();
      while (ancestor && !visited.has(ancestor.id)) {
        visited.add(ancestor.id);
        if (ancestor.visibility === "PRIVATE" && ancestor.creatorId !== successorUserId) {
          grantIds.add(ancestor.id);
        }
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
      }
    }
    successorAncestorGrantIds = [...grantIds];
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
    if (ownedProjectCount && successorUserId) {
      await tx.project.updateMany({
        where: {
          workspaceId: membershipToDelete.workspaceId,
          creatorId: membershipToDelete.userId,
        },
        data: { creatorId: successorUserId },
      });
      if (successorAncestorGrantIds.length) {
        await tx.projectAccess.createMany({
          data: successorAncestorGrantIds.map((projectId) => ({
            projectId,
            userId: successorUserId,
          })),
          skipDuplicates: true,
        });
      }
    }
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
    const teamId =
      membershipToDelete.workspace.mattermostLink?.mattermostTeamId;
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
