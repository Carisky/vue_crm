import type { Prisma } from "@prisma/client";
import { createError } from "h3";

export function uniqueGroupMemberIds(memberIds: string[]) {
  const unique = [...new Set(memberIds)];
  if (unique.length !== memberIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Group members must be unique",
    });
  }
  return unique;
}

export async function assertWorkspaceGroupMembers(
  db: Prisma.TransactionClient,
  workspaceId: string,
  memberIds: string[],
) {
  if (!memberIds.length) return;
  const memberships = await db.member.count({
    where: { workspaceId, userId: { in: memberIds } },
  });
  if (memberships !== memberIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Every group member must belong to the workspace",
    });
  }
}
