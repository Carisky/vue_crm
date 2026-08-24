import { z } from "zod";

import { PRODUCT_TOUR_VERSION, onboardingOutcomes } from "~/lib/product-tour";
import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";

const BodySchema = z.object({
  status: z.enum(onboardingOutcomes),
  version: z.literal(PRODUCT_TOUR_VERSION),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readValidatedBody(event, BodySchema.safeParse);

  if (!body.success) {
    throw createError({ status: 400, statusText: body.error.message });
  }

  const onboarding = await prisma.user.update({
    where: { id: user.id },
    data: {
      onboardingStatus: body.data.status,
      onboardingVersion: body.data.version,
      onboardingUpdatedAt: new Date(),
    },
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
