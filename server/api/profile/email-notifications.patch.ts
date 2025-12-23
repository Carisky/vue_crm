import { createError } from "h3";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { UpdateEmailNotificationsSchema } from "~/lib/schema/profile";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const params = await readValidatedBody(
    event,
    UpdateEmailNotificationsSchema.safeParse,
  );
  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailNotificationsEnabled: params.data.email_notifications_enabled,
    },
  });

  const currentUserContext = event.context.user ?? {};
  event.context.user = {
    ...currentUserContext,
    emailNotificationsEnabled: updatedUser.emailNotificationsEnabled,
  };

  return {
    emailNotificationsEnabled: updatedUser.emailNotificationsEnabled,
  };
});
