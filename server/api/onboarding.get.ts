import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const onboarding = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      onboardingStatus: true,
      onboardingVersion: true,
      onboardingUpdatedAt: true,
    },
  });

  return {
    status: onboarding.onboardingStatus,
    version: onboarding.onboardingVersion,
    updatedAt: onboarding.onboardingUpdatedAt?.toISOString() ?? null,
  };
});
