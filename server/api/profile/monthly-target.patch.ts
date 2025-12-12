import { createError } from "h3";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { UpdateMonthlyTargetSchema } from "~/lib/schema/profile";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const params = await readValidatedBody(event, UpdateMonthlyTargetSchema.safeParse);

  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      monthlyWorkloadTargetHours: params.data.monthly_target_hours,
    },
  });

  const currentUserContext = event.context.user ?? {};
  event.context.user = {
    ...currentUserContext,
    monthlyWorkloadTargetHours: updatedUser.monthlyWorkloadTargetHours,
  };

  return {
    monthlyWorkloadTargetHours: updatedUser.monthlyWorkloadTargetHours,
  };
});
