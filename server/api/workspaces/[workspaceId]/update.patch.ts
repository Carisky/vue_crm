import { MemberRole, Prisma } from "@prisma/client";
import { Buffer } from "node:buffer";

import { UpdateWorkspaceSchema } from "~/lib/schema/updateWorkspace";
import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { normalizeImageInput } from "~/server/lib/images";
import { serializeWorkspace } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);

  await ensureWorkspaceAccess(event, workspaceId, [MemberRole.ADMIN]);

  const formData = await readMultipartFormData(event);
  const name = formData?.find(({ name }) => name === "name");
  const imageData = formData?.find(({ name }) => name === "image");

  let imageFile: File | undefined;
  let removeImage = false;

  if (imageData) {
    const value = imageData.data.toString();
    if (value === "null") {
      removeImage = true;
    } else if (imageData.filename) {
      const fileData = Buffer.isBuffer(imageData.data)
        ? Uint8Array.from(imageData.data)
        : new Uint8Array(imageData.data);

      imageFile = new File([fileData], imageData.filename!, {
        type: imageData.type,
      });
    }
  }

  const params = UpdateWorkspaceSchema.safeParse({
    name: name?.data.toString(),
    image: imageFile,
  });

  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const updatePayload: Prisma.WorkspaceUpdateInput = {};

  if (params.data.name) {
    updatePayload.name = params.data.name;
  }

  if (removeImage) {
    updatePayload.imageUrl = null;
  } else if (params.data.image instanceof File) {
    updatePayload.imageUrl = await normalizeImageInput(params.data.image);
  }

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: updatePayload,
  });

  return { workspace: serializeWorkspace(workspace) };
});
