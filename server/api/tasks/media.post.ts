import { createError, isError } from "h3";

import {
  MediaUploadStorageError,
  MediaUploadTooLargeError,
  storePendingMedia,
} from "~/server/lib/media-upload-service";
import {
  MultipartMediaUploadError,
  parseMediaMultipart,
} from "~/server/lib/multipart-media-upload";
import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { getPrivateStorage } from "~/server/lib/storage";
import { UnsupportedMediaTypeError } from "~/server/lib/storage/file-policy";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { config } = getPrivateStorage();

  try {
    const uploadedFiles = await parseMediaMultipart(event, {
      maxFiles: config.maxFilesPerUpload,
      maxFileSizeBytes: config.maxFileSizeBytes,
      async authorizeWorkspace(workspaceId) {
        await requireWorkspaceMembership(event, workspaceId);
      },
      uploadFile(input) {
        return storePendingMedia({
          workspaceId: input.workspaceId,
          userId: user.id,
          originalName: input.originalName,
          claimedMime: input.claimedMime,
          stream: input.stream,
        });
      },
    });

    return { files: uploadedFiles };
  } catch (error) {
    if (isError(error)) {
      throw error;
    }
    if (error instanceof MediaUploadTooLargeError) {
      throw createError({ statusCode: 413, statusMessage: "File too large" });
    }
    if (
      error instanceof UnsupportedMediaTypeError ||
      error instanceof MultipartMediaUploadError
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid media upload",
      });
    }
    if (error instanceof MediaUploadStorageError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to upload media",
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to upload media",
    });
  }
});
