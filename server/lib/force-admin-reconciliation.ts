import type { Prisma } from "@prisma/client";

import {
  type ForceAdminMembershipChange,
  planForceAdminMembershipChanges,
} from "./force-admins.ts";
import {
  enqueueConversationUpsert,
  enqueueMembershipUpsert,
} from "./mattermost/domain-events.ts";
import { ensureWorkspaceGeneralConversation } from "./workspace-channels.ts";

export async function reconcileForceAdminMemberships(
  transaction: Prisma.TransactionClient,
  input: {
    forceAdminEmails: string[];
    userIds?: string[];
    workspaceIds?: string[];
  },
): Promise<ForceAdminMembershipChange[]> {
  if (!input.forceAdminEmails.length) return [];

  const users = await transaction.user.findMany({
    where: {
      email: { in: input.forceAdminEmails },
      ...(input.userIds?.length ? { id: { in: input.userIds } } : {}),
    },
    select: { id: true, email: true },
  });
  if (!users.length) return [];

  const workspaces = await transaction.workspace.findMany({
    where: input.workspaceIds?.length
      ? { id: { in: input.workspaceIds } }
      : undefined,
    select: { id: true },
  });
  if (!workspaces.length) return [];

  const userIds = users.map(({ id }) => id);
  const workspaceIds = workspaces.map(({ id }) => id);
  const memberships = await transaction.member.findMany({
    where: {
      userId: { in: userIds },
      workspaceId: { in: workspaceIds },
    },
    select: { userId: true, workspaceId: true, role: true },
  });
  const changes = planForceAdminMembershipChanges({
    forceAdminEmails: input.forceAdminEmails,
    users,
    workspaceIds,
    memberships,
  });

  for (const change of changes) {
    await transaction.member.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: change.workspaceId,
          userId: change.userId,
        },
      },
      create: {
        workspaceId: change.workspaceId,
        userId: change.userId,
        role: "ADMIN",
      },
      update: { role: "ADMIN" },
    });
    await enqueueMembershipUpsert(transaction, change);
  }

  const affectedWorkspaceIds = [
    ...new Set(changes.map(({ workspaceId }) => workspaceId)),
  ];
  for (const workspaceId of affectedWorkspaceIds) {
    const conversation = await ensureWorkspaceGeneralConversation(
      workspaceId,
      transaction,
    );
    await enqueueConversationUpsert(transaction, {
      conversationId: conversation.id,
    });
  }

  return changes;
}
