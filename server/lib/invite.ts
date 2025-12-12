import generateInviteCode from "~/lib/generateInviteCode";
import prisma from "./prisma";

export async function generateWorkspaceInviteCode(length = 6) {
  while (true) {
    const code = generateInviteCode(length);
    const existing = await prisma.workspace.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });

    if (!existing) return code;
  }
}
