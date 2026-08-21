import Busboy, {
  type BusboyHeaders,
  type BusboyFileStream,
} from "@fastify/busboy";
import type { H3Event } from "h3";

import type { PublicPendingMedia } from "./media-upload-service.ts";

export type MultipartMediaUploadHandlers = {
  maxFiles: number;
  maxFileSizeBytes: number;
  authorizeWorkspace(workspaceId: string): Promise<void>;
  uploadFile(input: {
    workspaceId: string;
    originalName: string;
    claimedMime?: string | null;
    stream: BusboyFileStream;
  }): Promise<PublicPendingMedia>;
};

export class MultipartMediaUploadError extends Error {
  constructor() {
    super("Invalid media upload.");
    this.name = "MultipartMediaUploadError";
  }
}

function drain(stream: BusboyFileStream): void {
  if (!stream.destroyed && !stream.readableEnded) {
    stream.resume();
  }
}

export async function parseMediaMultipart(
  event: H3Event,
  handlers: MultipartMediaUploadHandlers,
): Promise<PublicPendingMedia[]> {
  let parser: ReturnType<typeof Busboy>;
  try {
    parser = new Busboy({
      headers: event.node.req.headers as BusboyHeaders,
      limits: {
        files: handlers.maxFiles,
        fileSize: handlers.maxFileSizeBytes,
      },
    });
  } catch {
    throw new MultipartMediaUploadError();
  }

  let failure: unknown;
  let workspaceId: string | undefined;
  let authorization: Promise<void> | undefined;
  let parserTerminal = false;
  let sawFile = false;
  let nextFileIndex = 0;
  const uploads: Promise<void>[] = [];
  const files: PublicPendingMedia[] = [];

  const fail = (error: unknown) => {
    failure ??= error;
  };

  const rejectUpload = (stream: BusboyFileStream, error: unknown) => {
    fail(error);
    if (stream.destroyed && !stream.readableEnded) {
      event.node.req.unpipe(parser);
      event.node.req.resume();
      if (!parserTerminal) {
        parser.destroy(new MultipartMediaUploadError());
      }
      return;
    }
    drain(stream);
  };

  parser.on("field", (fieldName, value, fieldNameTruncated, valueTruncated) => {
    if (fieldName !== "workspace_id") {
      return;
    }

    if (
      sawFile ||
      workspaceId !== undefined ||
      fieldNameTruncated ||
      valueTruncated ||
      value.trim() === ""
    ) {
      fail(new MultipartMediaUploadError());
      return;
    }

    workspaceId = value;
    authorization = Promise.resolve().then(() =>
      handlers.authorizeWorkspace(value),
    );
    void authorization.catch(() => undefined);
  });

  parser.on(
    "file",
    (fieldName, stream, filename, _transferEncoding, mimeType) => {
      sawFile = true;
      stream.on("error", () => {
        fail(new MultipartMediaUploadError());
        event.node.req.unpipe(parser);
        event.node.req.resume();
        if (!parserTerminal) {
          parser.destroy(new MultipartMediaUploadError());
        }
      });

      if (
        failure ||
        fieldName !== "files" ||
        !workspaceId ||
        !authorization ||
        !filename
      ) {
        fail(new MultipartMediaUploadError());
        drain(stream);
        return;
      }

      const fileIndex = nextFileIndex++;
      const authorizedWorkspaceId = workspaceId;
      const upload = (async () => {
        try {
          await authorization;
        } catch (error) {
          drain(stream);
          throw error;
        }

        const uploaded = await handlers.uploadFile({
          workspaceId: authorizedWorkspaceId,
          originalName: filename,
          claimedMime: mimeType,
          stream,
        });
        files[fileIndex] = uploaded;
      })().catch((error) => rejectUpload(stream, error));

      uploads.push(upload);
    },
  );

  parser.on("filesLimit", () => fail(new MultipartMediaUploadError()));
  parser.on("partsLimit", () => fail(new MultipartMediaUploadError()));
  parser.on("fieldsLimit", () => fail(new MultipartMediaUploadError()));

  await new Promise<void>((resolve) => {
    const settleParser = () => {
      if (parserTerminal) {
        return;
      }
      parserTerminal = true;
      resolve();
    };

    parser.once("finish", settleParser);
    parser.on("error", () => {
      fail(new MultipartMediaUploadError());
      settleParser();
    });
    event.node.req.once("aborted", () => {
      fail(new MultipartMediaUploadError());
      settleParser();
    });
    event.node.req.pipe(parser);
  });

  await Promise.all(uploads);
  if (authorization) {
    await authorization.catch(fail);
  }

  if (!sawFile) {
    fail(new MultipartMediaUploadError());
  }
  if (failure) {
    throw failure;
  }

  return files;
}
