import prisma from "~/server/lib/prisma";
import { requireUser, requireWorkspaceMembership } from "~/server/lib/permissions";

type DocSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sectionId: string | null;
  isLocked: boolean;
};

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { projectId } = getRouterParams(event);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });

  if (!project) {
    throw createError({ status: 404, statusText: "Project not found" });
  }

  await requireWorkspaceMembership(event, project.workspaceId);

  const [sections, docs] = await Promise.all([
    prisma.projectDocSection.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true },
      take: 200,
    }),
    prisma.projectDoc.findMany({
      where: { projectId: project.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdAt: true,
        sectionId: true,
        isLocked: true,
      },
      take: 500,
    }),
  ]);

  const docsBySection = docs.reduce<Record<string, DocSummary[]>>(
    (acc, doc) => {
      const key = doc.sectionId ?? "__none__";
      (acc[key] ??= []).push({
        id: doc.id,
        title: doc.title,
        sectionId: doc.sectionId ?? null,
        isLocked: doc.isLocked,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      });
      return acc;
    },
    {},
  );

  return {
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      docs: docsBySection[section.id] ?? [],
    })),
    unsectioned: docsBySection["__none__"] ?? [],
  };
});
