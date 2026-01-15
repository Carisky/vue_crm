import { z } from "zod";

import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

const ImportProjectDocSchema = z.object({
  source_project_id: z.string().min(1),
  source_doc_id: z.string().min(1).optional(),
  source_section_id: z.string().min(1).optional(),
  target_section_id: z.string().min(1).nullable().optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { projectId } = getRouterParams(event);

  const params = await readValidatedBody(event, (body) =>
    ImportProjectDocSchema.safeParse(body),
  );
  if (!params.success) {
    throw createError({ status: 400, statusText: params.error.message });
  }

  const targetProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
  if (!targetProject) {
    throw createError({ status: 404, statusText: "Target project not found" });
  }

  await requireWorkspaceMembership(event, targetProject.workspaceId);

  const hasDoc = Boolean(params.data.source_doc_id);
  const hasSection = Boolean(params.data.source_section_id);
  if (Number(hasDoc) + Number(hasSection) !== 1) {
    throw createError({
      status: 400,
      statusText: "Provide either source_doc_id or source_section_id",
    });
  }

  if (Object.prototype.hasOwnProperty.call(params.data, "target_section_id")) {
    const targetSectionId = params.data.target_section_id;
    if (targetSectionId) {
      const targetSection = await prisma.projectDocSection.findFirst({
        where: { id: targetSectionId, projectId: targetProject.id },
        select: { id: true },
      });
      if (!targetSection) {
        throw createError({ status: 400, statusText: "Invalid target section" });
      }
    }
  }

  // Import a single document
  if (params.data.source_doc_id) {
    const sourceDoc = await prisma.projectDoc.findFirst({
      where: {
        id: params.data.source_doc_id,
        projectId: params.data.source_project_id,
      },
      include: {
        project: { select: { id: true, workspaceId: true } },
      },
    });
    if (!sourceDoc) {
      throw createError({ status: 404, statusText: "Source document not found" });
    }

    if (sourceDoc.project.workspaceId !== targetProject.workspaceId) {
      throw createError({
        status: 400,
        statusText: "Source and target projects must be in the same workspace",
      });
    }

    await requireWorkspaceMembership(event, sourceDoc.project.workspaceId);

    const created = await prisma.projectDoc.create({
      data: {
        workspaceId: targetProject.workspaceId,
        projectId: targetProject.id,
        authorId: user.id,
        title: sourceDoc.title,
        body: sourceDoc.body,
        sectionId: Object.prototype.hasOwnProperty.call(params.data, "target_section_id")
          ? (params.data.target_section_id ?? null)
          : (sourceDoc.sectionId ?? null),
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        sectionId: true,
      },
    });

    return {
      doc: {
        id: created.id,
        title: created.title,
        sectionId: created.sectionId,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  // Import a whole section with its documents
  const sourceSection = await prisma.projectDocSection.findFirst({
    where: {
      id: params.data.source_section_id!,
      projectId: params.data.source_project_id,
    },
    include: {
      project: { select: { workspaceId: true } },
    },
  });

  if (!sourceSection) {
    throw createError({ status: 404, statusText: "Source section not found" });
  }

  if (sourceSection.project.workspaceId !== targetProject.workspaceId) {
    throw createError({
      status: 400,
      statusText: "Source and target projects must be in the same workspace",
    });
  }

  await requireWorkspaceMembership(event, sourceSection.project.workspaceId);

  const [createdSection, sourceDocs] = await Promise.all([
    prisma.projectDocSection.create({
      data: {
        workspaceId: targetProject.workspaceId,
        projectId: targetProject.id,
        authorId: user.id,
        title: sourceSection.title,
      },
      select: { id: true, title: true },
    }),
    prisma.projectDoc.findMany({
      where: {
        projectId: sourceSection.projectId,
        sectionId: sourceSection.id,
      },
      select: { title: true, body: true },
      take: 500,
    }),
  ]);

  if (sourceDocs.length) {
    await prisma.projectDoc.createMany({
      data: sourceDocs.map((doc) => ({
        workspaceId: targetProject.workspaceId,
        projectId: targetProject.id,
        authorId: user.id,
        sectionId: createdSection.id,
        title: doc.title,
        body: doc.body,
      })),
    });
  }

  return {
    section: {
      id: createdSection.id,
      title: createdSection.title,
      imported_docs: sourceDocs.length,
    },
  };
});
