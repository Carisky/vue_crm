import { createError } from "h3";

import { UpdateLocaleSchema } from "~/lib/schema/profile";
import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const params = await readValidatedBody(event, UpdateLocaleSchema.safeParse);

  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { locale: params.data.locale },
  });

  event.context.user = {
    ...user,
    locale: updatedUser.locale,
  };

  return { locale: updatedUser.locale };
});
