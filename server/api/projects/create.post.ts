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
  const parentProjectId = data?.find(
    ({ name }) => name === "parent_project_id",
  );
  const image = data?.find(({ name }) => name === "image");

  const params = CreateProjectsSchema.safeParse({
    name: name?.data.toString(),
    workspace_id: workspaceId?.data.toString(),
    parent_project_id: parentProjectId?.data.toString() || null,
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

  if (params.data.parent_project_id) {
    const parent = await prisma.project.findUnique({
      where: { id: params.data.parent_project_id },
      select: { workspaceId: true },
    });
    if (!parent || parent.workspaceId !== params.data.workspace_id) {
      throw createError({
        status: 400,
        statusText: "Parent project not found",
      });
    }
  }

  const project = await prisma.project.create({
    data: {
      name: params.data.name,
      workspaceId: params.data.workspace_id,
      parentId: params.data.parent_project_id ?? null,
      imageUrl,
    },
  });

  return { project: serializeProject(project) };
});
