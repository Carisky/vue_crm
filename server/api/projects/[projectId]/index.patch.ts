import { MemberRole, Prisma } from "@prisma/client";
import { Buffer } from "node:buffer";

import { UpdateProjectSchema } from "~/lib/schema/updateProject";
import prisma from "~/server/lib/prisma";
import { normalizeImageInput } from "~/server/lib/images";
import { requireWorkspaceMembership } from "~/server/lib/permissions";
import { serializeProject } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const { projectId } = getRouterParams(event);
  const formData = await readMultipartFormData(event);
  const name = formData?.find(({ name }) => name === "name");
  const workspaceIdField = formData?.find(
    ({ name }) => name === "workspace_id",
  );
  const imageData = formData?.find(({ name }) => name === "image");

  const workspaceId = workspaceIdField?.data.toString();
  if (!workspaceId) {
    throw createError({ status: 400, statusText: "Workspace ID required" });
  }

  await requireWorkspaceMembership(event, workspaceId, [MemberRole.ADMIN]);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project || project.workspaceId !== workspaceId) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

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

  const params = UpdateProjectSchema.safeParse({
    name: name?.data.toString(),
    image: imageFile,
  });

  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.message,
    });
  }

  const updateData: Prisma.ProjectUpdateInput = {};

  if (params.data.name) {
    updateData.name = params.data.name;
  }

  if (removeImage) {
    updateData.imageUrl = null;
  } else if (params.data.image instanceof File) {
    updateData.imageUrl = await normalizeImageInput(params.data.image);
  }

  const updatedProject = await prisma.project.update({
    where: { id: projectId },
    data: updateData,
  });

  return { project: serializeProject(updatedProject) };
});
