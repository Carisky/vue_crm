import { MemberRole } from "@prisma/client";

import { InviteCodeSchema } from "~/lib/schema/inviteCode";
import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { ensureWorkspaceGeneralConversation } from "~/server/lib/workspace-channels";
import {
  enqueueConversationUpsert,
  enqueueMembershipUpsert,
} from "~/server/lib/mattermost/domain-events";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { workspaceId } = getRouterParams(event);
  const params = await readValidatedBody(event, InviteCodeSchema.safeParse);

  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const existingMembership = await prisma.member.findFirst({
    where: { workspaceId, userId: user.id },
  });
  if (existingMembership) {
    throw createError({ status: 400, statusText: "Already a member" });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { inviteCode: true },
  });
  if (!workspace || workspace.inviteCode !== params.data.code) {
    throw createError({ status: 400, statusText: "Invalid invite code" });
  }

  const membership = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        workspaceId,
        userId: user.id,
        role: MemberRole.MEMBER,
      },
    });
    const general = await ensureWorkspaceGeneralConversation(workspaceId, tx);
    await enqueueMembershipUpsert(tx, { workspaceId, userId: user.id });
    await enqueueConversationUpsert(tx, { conversationId: general.id });
    return created;
  });

  return { membership };
});
