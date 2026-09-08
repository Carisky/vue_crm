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
  const visibility = data?.find(({ name }) => name === "visibility");
  const accessUserIds = data?.find(({ name }) => name === "access_user_ids");

  let parsedAccessUserIds: unknown = [];
  try {
    parsedAccessUserIds = accessUserIds
      ? JSON.parse(accessUserIds.data.toString())
      : [];
  } catch {
    throw createError({ status: 400, statusText: "Invalid access list" });
  }

  const params = CreateProjectsSchema.safeParse({
    name: name?.data.toString(),
    workspace_id: workspaceId?.data.toString(),
    parent_project_id: parentProjectId?.data.toString() || null,
    visibility: visibility?.data.toString() || "PUBLIC",
    access_user_ids: parsedAccessUserIds,
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

  const grantedUserIds = [...new Set(params.data.access_user_ids)].filter(
    (userId) => userId !== user.id,
  );
  if (grantedUserIds.length) {
    const memberCount = await prisma.member.count({
      where: {
        workspaceId: params.data.workspace_id,
        userId: { in: grantedUserIds },
      },
    });
    if (memberCount !== grantedUserIds.length) {
      throw createError({ status: 400, statusText: "Invalid project members" });
    }
  }

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

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name: params.data.name,
        workspaceId: params.data.workspace_id,
        creatorId: user.id,
        parentId: params.data.parent_project_id ?? null,
        visibility: params.data.visibility,
        imageUrl,
      },
    });
    if (params.data.visibility === "PRIVATE" && grantedUserIds.length) {
      await tx.projectAccess.createMany({
        data: grantedUserIds.map((userId) => ({ projectId: created.id, userId })),
      });
    }
    return created;
  });

  return { project: serializeProject(project) };
});
