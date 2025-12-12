import { createError } from "h3";

import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { UpdateThemeSchema } from "~/lib/schema/profile";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const params = await readValidatedBody(event, UpdateThemeSchema.safeParse);
  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      themePreference: params.data.theme,
    },
  });

  const currentUserContext = event.context.user ?? {};
  event.context.user = {
    ...currentUserContext,
    themePreference: updatedUser.themePreference,
  };

  return {
    themePreference: updatedUser.themePreference,
  };
});
