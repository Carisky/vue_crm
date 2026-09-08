import { getForceAdminEmails } from "~/server/lib/force-admins";
import { reconcileForceAdminMemberships } from "~/server/lib/force-admin-reconciliation";
import prisma from "~/server/lib/prisma";

export default defineNitroPlugin(async () => {
  const forceAdminEmails = getForceAdminEmails();
  if (!forceAdminEmails.length) return;

  const changes = await prisma.$transaction((transaction) =>
    reconcileForceAdminMemberships(transaction, { forceAdminEmails }),
  );
  if (changes.length) {
    console.info(
      `[force-admins] synchronized ${changes.length} workspace membership(s)`,
    );
  }
});
