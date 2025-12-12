import type { MemberRole } from "@prisma/client";
import { createError } from "h3";
import type { H3Event } from "h3";

import prisma from "./prisma";

export function requireUser(event: H3Event) {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: "Unauthorized" });
  }

  return event.context.user;
}

export async function requireWorkspaceMembership(
  event: H3Event,
  workspaceId: string,
  allowedRoles?: MemberRole[],
) {
  const user = requireUser(event);
  const membership = await prisma.member.findFirst({
    where: {
      workspaceId,
      userId: user.id,
    },
  });

  if (!membership) {
    throw createError({ status: 401, statusText: "Unauthorized" });
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw createError({ status: 403, statusText: "Forbidden" });
  }

  return membership;
}
