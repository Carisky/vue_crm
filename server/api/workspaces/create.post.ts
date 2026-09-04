import { MemberRole } from "@prisma/client";
import { Buffer } from "node:buffer";

import { MEMBER_ROLE } from "~/lib/constant";
import { CreateWorkspaceSchema } from "~/lib/schema/createWorkspace";
import prisma from "~/server/lib/prisma";
import { requireUser } from "~/server/lib/permissions";
import { generateWorkspaceInviteCode } from "~/server/lib/invite";
import { normalizeImageInput } from "~/server/lib/images";
import { serializeWorkspace } from "~/server/lib/serializers";
import { ensureWorkspaceGeneralConversation } from "~/server/lib/workspace-channels";
import {
  enqueueConversationUpsert,
  enqueueMembershipUpsert,
  enqueueWorkspaceUpsert,
} from "~/server/lib/mattermost/domain-events";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const data = await readMultipartFormData(event);
  const name = data?.find(({ name }) => name === "name");
  const image = data?.find(({ name }) => name === "image");

  const params = CreateWorkspaceSchema.safeParse({
    name: name?.data.toString(),
    image: image
      ? new File(
          [
            Buffer.isBuffer(image.data)
              ? Uint8Array.from(image.data)
              : new Uint8Array(image.data),
          ],
          image.filename!,
          { type: image.type },
        )
      : undefined,
  });

  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const [imageUrl, inviteCode] = await Promise.all([
    normalizeImageInput(params.data.image),
    generateWorkspaceInviteCode(),
  ]);

  const workspace = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({
      data: {
        name: params.data.name,
        ownerId: user.id,
        inviteCode,
        imageUrl,
        members: {
          create: {
            role: MemberRole.ADMIN,
            userId: user.id,
          },
        },
      },
    });
    const general = await ensureWorkspaceGeneralConversation(created.id, tx);
    await enqueueWorkspaceUpsert(tx, {
      workspaceId: created.id,
      revision: created.updatedAt,
    });
    await enqueueMembershipUpsert(tx, {
      workspaceId: created.id,
      userId: user.id,
    });
    await enqueueConversationUpsert(tx, { conversationId: general.id });
    return created;
  });

  return { workspace: serializeWorkspace(workspace) };
});
