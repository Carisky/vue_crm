export type PendingMedia = {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "video" | "pdf" | "document";
};

export const TASK_MEDIA_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.csv";

type UploadRequest = {
  status: number;
  response: unknown;
  responseText: string;
  responseType: XMLHttpRequestResponseType;
  upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
  };
  onload: ((event: ProgressEvent) => void) | null;
  onerror: ((event: ProgressEvent) => void) | null;
  open(method: string, url: string): void;
  send(body: FormData): void;
};

export type TaskMediaClientDependencies = {
  createFormData(): FormData;
  createUploadRequest(): UploadRequest;
  request(
    url: string,
    options: { method: "DELETE"; body: { media_id: string } },
  ): Promise<unknown>;
};

function defaultDependencies(): TaskMediaClientDependencies {
  return {
    createFormData: () => new FormData(),
    createUploadRequest: () => new XMLHttpRequest(),
    request: (url, options) => $fetch(url, options),
  };
}

export function uploadTaskMedia(
  workspaceId: string,
  files: File[],
  onProgress: (percent: number) => void,
  dependencies: TaskMediaClientDependencies = defaultDependencies(),
): Promise<{ files: PendingMedia[] }> {
  const formData = dependencies.createFormData();
  formData.append("workspace_id", workspaceId);
  files.forEach((file, index) => {
    const name = file.name || `upload-${index}`;
    formData.append("files", file, name);
  });

  return new Promise((resolve, reject) => {
    const request = dependencies.createUploadRequest();
    request.open("POST", "/api/tasks/media");
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        const response =
          request.response ??
          (request.responseText ? JSON.parse(request.responseText) : {});
        resolve(response as { files: PendingMedia[] });
        return;
      }
      reject(new Error(`Upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error("Upload failed"));
    request.send(formData);
  });
}

export function deleteTaskMedia(
  mediaId: string,
  dependencies: TaskMediaClientDependencies = defaultDependencies(),
): Promise<{ ok: true }> {
  return dependencies.request("/api/tasks/media", {
    method: "DELETE",
    body: { media_id: mediaId },
  }) as Promise<{ ok: true }>;
}
