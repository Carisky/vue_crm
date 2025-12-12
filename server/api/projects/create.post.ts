import { MemberRole } from "@prisma/client";
import { Buffer } from "node:buffer";

import { CreateProjectsSchema } from "~/lib/schema/createProject";
import prisma from "~/server/lib/prisma";
import { normalizeImageInput } from "~/server/lib/images";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { serializeProject } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const data = await readMultipartFormData(event);
  const name = data?.find(({ name }) => name === "name");
  const workspaceId = data?.find(({ name }) => name === "workspace_id");
  const image = data?.find(({ name }) => name === "image");

  const params = CreateProjectsSchema.safeParse({
    name: name?.data.toString(),
    workspace_id: workspaceId?.data.toString(),
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

  await requireWorkspaceMembership(event, params.data.workspace_id, [
    MemberRole.ADMIN,
  ]);

  const imageUrl = await normalizeImageInput(params.data.image);

  const project = await prisma.project.create({
    data: {
      name: params.data.name,
      workspaceId: params.data.workspace_id,
      imageUrl,
    },
  });

  return { project: serializeProject(project) };
});
