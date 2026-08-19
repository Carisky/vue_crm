import prisma from "~/server/lib/prisma";

export async function removeExpiredEmailVerificationAccounts() {
  const expired = await prisma.emailVerificationToken.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { userId: true },
  });

  for (const item of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.emailQueue.deleteMany({ where: { userId: item.userId } });
      await tx.emailVerificationToken.deleteMany({
        where: { userId: item.userId },
      });
      await tx.user.deleteMany({
        where: { id: item.userId, emailVerifiedAt: null },
      });
    });
  }
}
