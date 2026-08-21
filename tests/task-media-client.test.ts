import assert from "node:assert/strict";
import test from "node:test";

import {
  TASK_MEDIA_ACCEPT,
  deleteTaskMedia,
  uploadTaskMedia,
  type TaskMediaClientDependencies,
} from "../lib/task-media-client.ts";

test("uploads workspace before files and returns opaque pending media IDs", async () => {
  const opened: string[] = [];
  const progress: number[] = [];
  let sentBody: unknown;

  const response = {
    files: [
      {
        id: "media-1",
        name: "photo one.png",
        mime: "image/png",
        size: 42,
        kind: "image" as const,
      },
      {
        id: "media-2",
        name: "notes.pdf",
        mime: "application/pdf",
        size: 84,
        kind: "pdf" as const,
      },
    ],
  };

  const request = {
    status: 201,
    response,
    responseText: "",
    responseType: "" as XMLHttpRequestResponseType,
    upload: {
      onprogress: null as ((event: ProgressEvent) => void) | null,
    },
    onload: null as ((event: ProgressEvent) => void) | null,
    onerror: null as ((event: ProgressEvent) => void) | null,
    open(method: string, url: string) {
      opened.push(`${method} ${url}`);
    },
    send(body: unknown) {
      sentBody = body;
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: 1,
        total: 4,
      } as ProgressEvent);
      this.onload?.({} as ProgressEvent);
    },
  };

  const formData = new FormData();
  const dependencies: TaskMediaClientDependencies = {
    createFormData: () => formData,
    createUploadRequest: () => request,
    request: async () => ({ ok: true }),
  };
  const files = [
    Object.assign(new Blob(["photo"], { type: "image/png" }), {
      name: "photo one.png",
      lastModified: 0,
      webkitRelativePath: "",
    }) as File,
    Object.assign(new Blob(["notes"], { type: "application/pdf" }), {
      name: "notes.pdf",
      lastModified: 0,
      webkitRelativePath: "",
    }) as File,
  ];

  const result = await uploadTaskMedia(
    "workspace-1",
    files,
    (percent) => progress.push(percent),
    dependencies,
  );

  assert.deepEqual(opened, ["POST /api/tasks/media"]);
  assert.equal(sentBody, formData);
  const entries = [...formData.entries()];
  assert.deepEqual(
    entries.map(([name]) => name),
    ["workspace_id", "files", "files"],
  );
  assert.deepEqual(entries[0], ["workspace_id", "workspace-1"]);
  assert.equal((entries[1]?.[1] as File).name, "photo one.png");
  assert.equal((entries[2]?.[1] as File).name, "notes.pdf");
  assert.deepEqual(progress, [25]);
  assert.deepEqual(result, response);
  assert.deepEqual(
    result.files.map((file) => file.id),
    ["media-1", "media-2"],
  );
  assert.equal(
    TASK_MEDIA_ACCEPT,
    ".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.csv",
  );
});

test("deletes pending media with only its opaque ID", async () => {
  const calls: Array<[string, unknown]> = [];
  const dependencies: TaskMediaClientDependencies = {
    createFormData: () => new FormData(),
    createUploadRequest: () => {
      throw new Error("upload request should not be created");
    },
    async request(url, options) {
      calls.push([url, options]);
      return { ok: true };
    },
  };

  const result = await deleteTaskMedia("media-1", dependencies);

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    ["/api/tasks/media", { method: "DELETE", body: { media_id: "media-1" } }],
  ]);
});
