import {
  createError,
  getHeader,
  getMethod,
  getQuery,
  getRouterParam,
  sendStream,
  setHeader,
  setResponseStatus,
} from "h3";

import {
  MediaReadForbiddenError,
  MediaReadNotFoundError,
  authorizeMediaRead,
} from "~/server/lib/media-access";
import { buildMediaContentResponse } from "~/server/lib/media-content-response";
import { RangeNotSatisfiableError } from "~/server/lib/http-range";
import { requireUser } from "~/server/lib/permissions";
import prisma from "~/server/lib/prisma";
import { getPrivateStorage } from "~/server/lib/storage";

function isMissingStorageObject(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const mediaId = getRouterParam(event, "mediaId");
  if (!mediaId) {
    throw createError({ statusCode: 404, statusMessage: "Media not found" });
  }

  const query = getQuery(event);
  const variantId = typeof query.variant_id === "string" ? query.variant_id : undefined;

  let media;
  try {
    media = await authorizeMediaRead(
      { mediaId, variantId, userId: user.id },
      {
        media: {
          findById(id) {
            return prisma.taskMedia.findUnique({
              where: { id },
              select: {
                id: true,
                taskId: true,
                workspaceId: true,
                uploadedById: true,
                storageKey: true,
                mime: true,
                originalName: true,
                size: true,
                resolution: true,
                variants: {
                  select: {
                    id: true,
                    taskMediaId: true,
                    storageKey: true,
                    mime: true,
                    size: true,
                    resolution: true,
                  },
                },
              },
            });
          },
        },
        membership: {
          async exists(input) {
            return Boolean(
              await prisma.member.findFirst({
                where: { workspaceId: input.workspaceId, userId: input.userId },
                select: { id: true },
              }),
            );
          },
        },
      },
    );
  } catch (error) {
    if (error instanceof MediaReadNotFoundError || error instanceof MediaReadForbiddenError) {
      throw createError({ statusCode: 404, statusMessage: "Media not found" });
    }
    throw error;
  }

  const { storage } = getPrivateStorage();
  let object;
  try {
    object = await storage.stat(media.key);
  } catch (error) {
    if (isMissingStorageObject(error)) {
      throw createError({ statusCode: 404, statusMessage: "Media not found" });
    }
    throw createError({ statusCode: 500, statusMessage: "Unable to read media" });
  }

  let response;
  try {
    response = buildMediaContentResponse(
      { ...media, size: object.size },
      getHeader(event, "range"),
    );
  } catch (error) {
    if (error instanceof RangeNotSatisfiableError) {
      setResponseStatus(event, 416);
      setHeader(event, "Content-Range", `bytes */${error.size}`);
      setHeader(event, "Content-Length", 0);
      setHeader(event, "X-Content-Type-Options", "nosniff");
      setHeader(event, "Cache-Control", "private, no-store");
      return null;
    }
    throw error;
  }

  setResponseStatus(event, response.status);
  for (const [name, value] of Object.entries(response.headers)) {
    setHeader(event, name, value);
  }

  if (getMethod(event) === "HEAD") return null;
  return sendStream(event, storage.openReadStream(media.key, response.range ?? undefined));
});
