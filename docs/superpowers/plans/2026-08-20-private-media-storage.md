# Private Task Media Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move task attachments into authenticated private storage configured by `STORAGE_ROOT`, expose only opaque media IDs to the browser, support safe previews/downloads for the approved image, video, PDF, and office formats, and provide a restartable legacy migration command.

**Architecture:** A filesystem storage adapter is the only module allowed to resolve opaque storage keys to disk paths. Uploads stream into `.part` files, pass a centralized content policy, commit atomically, and become user/workspace-owned pending `TaskMedia` rows. Task mutations attach pending IDs transactionally; one authenticated content endpoint authorizes reads and handles ranges; serializers and the UI use metadata and media IDs only. A stopped-server CLI migrates legacy public paths into the same private storage model.

**Tech Stack:** Nuxt 3/Nitro/H3, Vue 3, TypeScript, Prisma 7 with MariaDB, Node streams, `@fastify/busboy`, `file-type`, fluent-ffmpeg, Node test runner.

**Spec:** [Private Task Media Storage Design](../specs/2026-08-20-private-media-storage-design.md)

## Global Constraints

- Follow red-green-refactor. Do not write production behavior until its focused test fails for the expected reason.
- Never serialize, log, accept from the client, or render `STORAGE_ROOT`, a storage key, a legacy path, or an absolute path.
- Only files in `server/lib/storage/` may turn a storage key into an absolute path. The video and migration layers may receive a validated temporary absolute path from that adapter, but may not construct one.
- Keep `public/favicon.ico` unchanged.
- Do not add public file routes, Office conversion, SVG embedding, macro-enabled Office support, multiple byte ranges, or antivirus claims.
- Use `media_ids` for create/update and `media_id` for delete. Do not retain a legacy client path fallback.
- Run the focused test after each implementation step and commit only after it passes.

---

## Task 1: Add storage dependencies, configuration, and filesystem containment

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `server/lib/storage/config.ts`
- Create: `server/lib/storage/filesystem.ts`
- Test: `tests/storage-config.test.ts`
- Test: `tests/filesystem-storage.test.ts`

- [ ] **Step 1: Install the runtime dependencies.**

Run:

```bash
npm install @fastify/busboy file-type
npm install --save-dev tsx
```

Add these scripts to `package.json` now so later tasks have stable commands:

```json
"typecheck": "nuxt typecheck",
"storage:migrate": "tsx scripts/migrate-media-storage.ts"
```

- [ ] **Step 2: Write failing configuration tests.**

In `tests/storage-config.test.ts`, cover:

```ts
assert.equal(resolveStorageConfig({ env: {}, cwd: repo, production: false }).root, resolve(repo, ".data/storage"));
assert.throws(() => resolveStorageConfig({ env: {}, cwd: repo, production: true }), /STORAGE_ROOT/);
assert.throws(() => resolveStorageConfig({ env: { STORAGE_ROOT: "relative" }, cwd: repo, production: true }), /absolute/);
assert.throws(() => resolveStorageConfig({ env: { STORAGE_ROOT: join(repo, "public", "files") }, cwd: repo, production: true }), /public/);
assert.equal(config.maxFileSizeBytes, 50 * 1024 * 1024);
assert.equal(config.maxFilesPerUpload, 10);
```

Run `node --test --experimental-strip-types tests/storage-config.test.ts` and confirm RED because the module does not exist.

- [ ] **Step 3: Implement configuration validation.**

Export this public contract from `server/lib/storage/config.ts`:

```ts
export type StorageConfig = {
  root: string;
  maxFileSizeBytes: number;
  maxFilesPerUpload: number;
};

export function resolveStorageConfig(input?: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  production?: boolean;
}): StorageConfig;
```

Normalize with `resolve`, require an absolute configured root in production, reject roots equal to or beneath `<cwd>/public` using `relative`, and parse both numeric limits as finite positive integers. Do not use Nuxt public runtime config.

- [ ] **Step 4: Write failing filesystem-adapter tests.**

Use `mkdtemp` and cover random-key uniqueness, `.part` streaming, atomic commit, full/ranged reads, stat, idempotent remove, and rejection of `../x`, `/absolute`, `C:\\absolute`, alternate separators, and null bytes. The intended interface is:

```ts
export type StorageByteRange = { start: number; end: number };
export type PrivateStorage = {
  createKey(scope: "task-media" | "task-media-variant"): string;
  createTemporaryObject(key: string): Promise<{ path: string; stream: WriteStream }>;
  commitTemporaryObject(key: string, temporaryPath: string): Promise<void>;
  discardTemporaryObject(temporaryPath: string): Promise<void>;
  stat(key: string): Promise<{ size: number }>;
  openReadStream(key: string, range?: StorageByteRange): ReadStream;
  remove(key: string): Promise<boolean>;
  withPhysicalPath<T>(key: string, run: (path: string) => Promise<T>): Promise<T>;
};
```

Run `node --test --experimental-strip-types tests/filesystem-storage.test.ts` and confirm RED.

- [ ] **Step 5: Implement the private filesystem adapter.**

Create directories with mode `0o700` where supported, keys as `scope/<uuid>`, temporary objects under `<root>/.tmp/<uuid>.part`, and committed objects under `<root>/objects/<scope>/<uuid>`. Use `rename` for atomic commit. `resolveStorageObjectPath(root, key)` must reject absolute/traversal/null/alternate-separator input and then re-check containment after `resolve`. `remove` returns `false` on `ENOENT`. `withPhysicalPath` is the sole controlled bridge for ffmpeg and validation.

- [ ] **Step 6: Add environment examples and ignore local data.**

Add to `.env.example`:

```dotenv
STORAGE_ROOT=/var/lib/vue-crm/storage
STORAGE_MAX_FILE_SIZE_MB=50
STORAGE_MAX_FILES_PER_UPLOAD=10
```

Keep the existing `.data` ignore rule (normalize it to `/.data/` if desired). Run both focused tests and confirm GREEN.

- [ ] **Step 7: Commit.**

```bash
git add package.json package-lock.json .gitignore .env.example server/lib/storage/config.ts server/lib/storage/filesystem.ts tests/storage-config.test.ts tests/filesystem-storage.test.ts
git commit -m "feat: add private filesystem storage foundation"
```

---

## Task 2: Centralize file-format and filename policy

**Files:**

- Create: `server/lib/storage/file-policy.ts`
- Create: `server/lib/storage/content-disposition.ts`
- Test: `tests/media-file-policy.test.ts`
- Test: `tests/content-disposition.test.ts`

- [ ] **Step 1: Write failing allowlist/signature tests.**

Create small fixtures in the test temp directory and assert the returned metadata:

```ts
export type MediaKind = "image" | "video" | "pdf" | "document";
export type ValidatedMedia = {
  mime: string;
  extension: string;
  kind: MediaKind;
  disposition: "inline" | "attachment";
};
```

Cover valid JPEG/PNG/WebP/GIF, MP4/WebM, PDF, SVG, DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT/ODS/ODP, RTF, and CSV. Assert SVG and all office formats are `attachment`; PDF/images/video are `inline`. Use minimal binary fixture buffers and checked-in tiny valid package fixtures in `tests/fixtures/media/` for ZIP-based formats.

- [ ] **Step 2: Add failing rejection tests.**

Cover extension/MIME/content mismatch, renamed ZIP, executable content, macro extensions (`.docm`, `.xlsm`, `.pptm`), missing names, double-extension tricks, malformed OOXML/OpenDocument packages, wrong legacy OLE family, binary data disguised as CSV, and oversized bounded text inspection. Run the focused test and confirm RED.

- [ ] **Step 3: Implement the content policy.**

Export:

```ts
export function validateMediaFile(input: {
  path: string;
  originalName: string;
  claimedMime?: string | null;
}): Promise<ValidatedMedia>;

export function mediaKindFromMime(mime: string): MediaKind;
export const MEDIA_ACCEPT_ATTRIBUTE: string;
```

Use `fileTypeFromFile` for signature/package detection, a strict extension-to-canonical-MIME table, the OLE compound signature for legacy DOC/XLS/PPT plus `file-type`'s family result, and bounded UTF-8 inspection for RTF/CSV. Reject mismatches with a stable `UnsupportedMediaTypeError`; do not include physical paths in messages.

- [ ] **Step 4: Write failing `Content-Disposition` tests.**

Assert CR/LF stripping, ASCII fallback escaping, UTF-8 RFC 5987 encoding, and disposition selection:

```ts
assert.equal(
  buildContentDisposition("attachment", "raport ąć.xlsx"),
  "attachment; filename=\"raport __.xlsx\"; filename*=UTF-8''raport%20%C4%85%C4%87.xlsx",
);
assert.doesNotMatch(buildContentDisposition("attachment", "x\r\nSet-Cookie: bad"), /\r|\n/);
```

- [ ] **Step 5: Implement and verify filename handling.**

Export `sanitizeDownloadName` and `buildContentDisposition` from `server/lib/storage/content-disposition.ts`. Run both focused tests and confirm GREEN.

- [ ] **Step 6: Commit.**

```bash
git add server/lib/storage/file-policy.ts server/lib/storage/content-disposition.ts tests/media-file-policy.test.ts tests/content-disposition.test.ts tests/fixtures/media
git commit -m "feat: validate task attachment formats"
```

---

## Task 3: Stage the private-media database model

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260820150000_private_task_media_storage/migration.sql`
- Test: `tests/task-media-model.test.ts`

- [ ] **Step 1: Write a failing generated-model contract test.**

Read the generated Prisma DMMF and assert that `TaskMedia` contains the staged private-storage fields and relations, and `TaskMediaVariant` contains its private key and byte size:

```ts
const media = Prisma.dmmf.datamodel.models.find(model => model.name === "TaskMedia");
assert.deepEqual(
  media?.fields.filter(field => ["workspaceId", "uploadedById", "storageKey", "size"].includes(field.name)).map(field => field.name),
  ["workspaceId", "uploadedById", "storageKey", "size"],
);
```

Run the focused test against the current generated client and confirm RED because the fields do not exist.

- [ ] **Step 2: Update Prisma relations and fields.**

Use these model contracts:

```prisma
model TaskMedia {
  id           String   @id @default(cuid())
  taskId       String?
  workspaceId  String
  uploadedById String?
  storageKey   String?  @unique
  path         String?
  mime         String?
  originalName String?
  size         Int      @default(0)
  resolution   Int?
  createdAt    DateTime @default(now())
  task         Task?    @relation(fields: [taskId], references: [id], onDelete: Cascade)
  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  uploadedBy   User?    @relation("TaskMediaUploader", fields: [uploadedById], references: [id], onDelete: SetNull)
  variants     TaskMediaVariant[]
  @@index([taskId])
  @@index([workspaceId])
  @@index([uploadedById])
  @@index([taskId, createdAt])
}
```

Make `TaskMediaVariant.path` nullable and add nullable unique `storageKey` plus `size Int @default(0)`. Keep historical `mime`/`originalName` nullable in the staged schema; new uploads always write validated non-null values, and the legacy migrator normalizes old rows. Add `taskMedia TaskMedia[]` to `Workspace` and `taskMediaUploads TaskMedia[] @relation("TaskMediaUploader")` to `User`.

- [ ] **Step 3: Create the staged SQL migration.**

Generate with `npx prisma migrate dev --create-only --name private_task_media_storage`, then inspect and edit it. The SQL must add nullable `workspaceId`, backfill it with `UPDATE TaskMedia JOIN Task`, fail the `ALTER ... NOT NULL` if unresolved rows exist, then add indexes/foreign keys. Add `storageKey`, nullable `path`, uploader, and size columns without requiring files to be migrated yet. Do not run this migration against production during development.

- [ ] **Step 4: Generate and validate the staged client.**

Run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
node --test --experimental-strip-types tests/task-media-model.test.ts
```

The focused test and Prisma validation must be GREEN. Full application typecheck follows after the old path-based services and components have been replaced in Tasks 4–9; do not add casts or legacy fallbacks just to mask those known consumers.

- [ ] **Step 5: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations/20260820150000_private_task_media_storage tests/task-media-model.test.ts
git commit -m "feat: add private task media data model"
```

---

## Task 4: Stream uploads into owned pending media rows

**Files:**

- Create: `server/lib/storage/index.ts`
- Create: `server/plugins/storage.server.ts`
- Create: `server/lib/media-upload-service.ts`
- Create: `server/lib/multipart-media-upload.ts`
- Replace: `server/api/tasks/media.post.ts`
- Test: `tests/media-upload-service.test.ts`
- Test: `tests/multipart-media-upload.test.ts`

- [ ] **Step 1: Write failing service tests using real temporary storage and an in-memory repository.**

Define the dependency boundary:

```ts
export type PendingMediaRepository = {
  create(input: {
    workspaceId: string;
    uploadedById: string;
    storageKey: string;
    originalName: string;
    mime: string;
    size: number;
  }): Promise<{ id: string }>;
  remove(id: string): Promise<void>;
};
```

Test a valid stream commits once and returns `{id,name,mime,size,kind}`; oversized, unsupported, interrupted, validator-error, and repository-error paths remove `.part` and committed objects and return no storage identifiers.

- [ ] **Step 2: Implement the upload service.**

Export:

```ts
export async function storePendingMedia(input: {
  workspaceId: string;
  userId: string;
  originalName: string;
  claimedMime?: string | null;
  stream: Readable;
}, deps?: MediaUploadDependencies): Promise<PublicPendingMedia>;
```

Count bytes in a transform while piping with `node:stream/promises.pipeline`, abort immediately above `maxFileSizeBytes`, validate the temporary file, atomically commit, then create the DB row. Cleanup both temp and committed object on all later failures. `server/lib/storage/index.ts` creates one lazily validated singleton from `resolveStorageConfig()`.

- [ ] **Step 3: Write failing multipart-order/count tests.**

Test that `workspace_id` must precede the first file, at least one file is required, only the `files` field is accepted for binary parts, and the configured maximum file count is enforced. Confirm aborted file streams are drained/destroyed and no upload starts before membership authorization has completed.

- [ ] **Step 4: Implement streaming multipart parsing and the route.**

`parseMediaMultipart(event, handlers)` uses `@fastify/busboy` directly on `event.node.req`. It captures `workspace_id`, rejects a file event before that field, invokes an async `authorizeWorkspace(workspaceId)` exactly once, and sends each file stream to `storePendingMedia`. Track every async file promise and await all of them after Busboy closes; parser completion alone must not return early. The route must call `requireUser`, authorize with `requireWorkspaceMembership`, and return:

```ts
return { files: uploadedFiles };
```

Map size errors to 413, unsupported types/malformed order to 400, and internal storage errors to a generic 500 without logging paths or keys.

`server/plugins/storage.server.ts` calls `resolveStorageConfig()` and initializes the directory during Nitro startup so an invalid production `STORAGE_ROOT` prevents the server from accepting requests.

- [ ] **Step 5: Verify upload behavior.**

Run both focused tests. Then add one route-level test or inject the parser adapter to prove the JSON response has no `path`, `storageKey`, or URL. Confirm GREEN.

- [ ] **Step 6: Commit.**

```bash
git add server/lib/storage/index.ts server/plugins/storage.server.ts server/lib/media-upload-service.ts server/lib/multipart-media-upload.ts server/api/tasks/media.post.ts tests/media-upload-service.test.ts tests/multipart-media-upload.test.ts
git commit -m "feat: stream pending media into private storage"
```

---

## Task 5: Attach pending media IDs transactionally to task mutations

**Files:**

- Replace: `server/lib/task-media-service.ts`
- Modify: `server/api/tasks/create.post.ts`
- Modify: `server/lib/tasks.ts`
- Modify: `lib/schema/createTask.ts`
- Modify: `components/task/CreateTaskForm.vue`
- Modify: `components/task/UpdateTaskForm.vue`
- Create: `lib/task-media-client.ts`
- Test: `tests/task-media-attachment.test.ts`
- Test: `tests/task-media-client.test.ts`

- [ ] **Step 1: Write failing ownership/workspace/attachment tests.**

Create a dependency-injected pure attachment function around this contract:

```ts
export async function assertAndAttachPendingMedia(input: {
  taskId: string;
  mediaIds: string[];
  workspaceId: string;
  userId: string;
  db: TaskMediaTransaction;
}): Promise<void>;
```

Test success plus missing ID, duplicate ID, another uploader, another workspace, already attached row, and a row without `storageKey`. Every invalid set must attach zero rows.

- [ ] **Step 2: Implement atomic validation and update.**

Deduplicate by rejecting duplicates, fetch all requested rows inside the transaction, compare exact count and every ownership predicate, then `updateMany` only rows matching `id in`, `taskId: null`, `workspaceId`, `uploadedById`, and `storageKey: { not: null }`. Require the updated count to equal requested count or throw so the transaction rolls back.

- [ ] **Step 3: Put task mutation and attachment in one transaction.**

In `create.post.ts`, create the task and call `assertAndAttachPendingMedia` inside one `prisma.$transaction(async tx => ...)`. In `server/lib/tasks.ts`, update the task and attach new IDs in one transaction. Keep email, notification, serialization lookup, and broadcasts after commit. Pass `event.context.user.id`; never infer uploader from a client field.

Replace the old schema field with:

```ts
media_ids: z.array(z.string().trim().min(1)).max(10).optional(),
```

Assert in `tests/task-media-attachment.test.ts` that the schema accepts `{ media_ids: ["media-1"] }` and rejects the old `{ media: [{ path: "/uploads/x" }] }`.

- [ ] **Step 4: Write the shared frontend upload client test.**

`lib/task-media-client.ts` must export:

```ts
export type PendingMedia = Pick<TaskMedia, "id" | "name" | "mime" | "size" | "kind">;
export const TASK_MEDIA_ACCEPT: string;
export function uploadTaskMedia(workspaceId: string, files: File[], onProgress: (percent: number) => void): Promise<{ files: PendingMedia[] }>;
export function deleteTaskMedia(mediaId: string): Promise<{ ok: true }>;
```

Test with injected request factories that `workspace_id` is appended before `files`, the response is consumed by ID, and delete sends only `{ media_id }`.

- [ ] **Step 5: Update both task forms to IDs only.**

Replace local `UploadedMediaPreview.path` with the public pending metadata, use `file.id` as Vue key, render `file.name`, set the input `accept`, delete canceled pending media via `media_id`, and submit `media_ids: uploadedMedia.map(file => file.id)`. Existing attached items use `name`, never split a path.

- [ ] **Step 6: Verify and commit.**

Run the two focused tests. Full typecheck remains deferred until every old path consumer is removed in Task 9. Commit:

```bash
git add server/lib/task-media-service.ts server/api/tasks/create.post.ts server/lib/tasks.ts lib/schema/createTask.ts components/task/CreateTaskForm.vue components/task/UpdateTaskForm.vue lib/task-media-client.ts tests/task-media-attachment.test.ts tests/task-media-client.test.ts
git commit -m "feat: attach private media by opaque id"
```

---

## Task 6: Serve authenticated content with safe headers and byte ranges

**Files:**

- Create: `server/lib/http-range.ts`
- Create: `server/lib/media-access.ts`
- Create: `server/api/tasks/media/[mediaId]/content.get.ts`
- Test: `tests/http-range.test.ts`
- Test: `tests/media-access.test.ts`
- Test: `tests/media-content-response.test.ts`

- [ ] **Step 1: Write failing single-range tests.**

Define:

```ts
export type ParsedRange = { start: number; end: number };
export function parseSingleRange(value: string | undefined, size: number): ParsedRange | null;
```

Cover no header, `bytes=0-99`, open-ended, suffix, exact end, malformed units, reversed/negative/out-of-bounds ranges, zero-size files, and comma-separated multiple ranges. Invalid or unsatisfiable input must throw a typed `RangeNotSatisfiableError` carrying only `size`.

- [ ] **Step 2: Implement and pass the range parser.**

Return inclusive offsets, clamp an oversized end to `size - 1`, reject multiple ranges, and never parse with permissive `parseInt` trailing garbage. Run the focused test GREEN.

- [ ] **Step 3: Write failing media authorization tests.**

Use a pure decision function and cover attached media/member, attached nonmember, pending owner who remains a member, pending different uploader, pending former member, missing storage key, wrong variant ownership, and missing row. Return a normalized authorized object containing key/mime/name/size/kind/resolution but no task or user secrets.

- [ ] **Step 4: Implement database-backed authorization.**

`authorizeMediaRead({ mediaId, variantId, userId }, deps)` loads media with task and variants, checks workspace membership from the row's `workspaceId`, applies pending-owner rules, and verifies the selected variant belongs to that media. Keep 404 vs 403 behavior stable and do not expose whether inaccessible foreign media exists.

- [ ] **Step 5: Write failing response-header tests.**

Test full GET, HEAD, video range `206`, malformed range `416` with `Content-Range: bytes */<size>`, inline image/PDF, attachment office/SVG, and these invariant headers:

```text
X-Content-Type-Options: nosniff
Cache-Control: private, no-store
Content-Length: <exact bytes>
```

Only video gets `Accept-Ranges: bytes`. HEAD emits the same authorization and headers but no body.

- [ ] **Step 6: Implement the H3 content endpoint.**

Read `variant_id` only as an opaque query ID, derive the key from the authorized DB row, set `Content-Disposition` with `buildContentDisposition`, and stream via `privateStorage.openReadStream(key, range)`. Use `setResponseStatus`, `setHeader`, and `sendStream`. Never redirect to a file URL. Map storage `ENOENT` to a generic 404 and log only operation/media/workspace/error category.

- [ ] **Step 7: Verify and commit.**

Run the three focused tests, then commit. Full typecheck follows after Tasks 7–9 remove the remaining legacy path consumers:

```bash
git add server/lib/http-range.ts server/lib/media-access.ts server/api/tasks/media/[mediaId]/content.get.ts tests/http-range.test.ts tests/media-access.test.ts tests/media-content-response.test.ts
git commit -m "feat: serve authorized private media content"
```

---

## Task 7: Replace visible file paths with previews and document cards

**Files:**

- Create: `lib/task-media-presentation.ts`
- Modify: `lib/types.ts`
- Modify: `server/lib/serializers.ts`
- Modify: `components/task/TaskMediaGallery.vue`
- Modify: `components/task/CreateTaskForm.vue`
- Modify: `components/task/UpdateTaskForm.vue`
- Test: `tests/task-media-presentation.test.ts`
- Test: `tests/task-media-contract.test.ts`

- [ ] **Step 1: Write a failing public serializer/type contract test.**

Export `serializeTaskMedia` and test a Prisma-shaped object containing `path` and `storageKey`. Assert the exact output:

```ts
assert.deepEqual(serializeTaskMedia(row), {
  id: "media-1",
  name: "report.pdf",
  mime: "application/pdf",
  size: 123,
  kind: "pdf",
  resolution: null,
  variants: [{ id: "variant-1", mime: "video/mp4", size: 80, resolution: 360 }],
});
assert.equal("path" in result, false);
assert.equal("storageKey" in result, false);
```

Change frontend `TaskMedia`/`TaskMediaVariant` contracts to metadata only: `id`, `name`, `mime`, `size`, `kind`, `resolution`, and variants. No `path` or `storageKey` member may remain. Implement the safe serializer with `mediaKindFromMime` and update `serializeTask`'s included-relation type.

- [ ] **Step 2: Write failing presentation-helper tests.**

Export and test:

```ts
mediaContentUrl("m 1") === "/api/tasks/media/m%201/content"
mediaContentUrl("m1", "v 1") === "/api/tasks/media/m1/content?variant_id=v%201"
formatMediaSize(1536) === "1.5 KB"
mediaIconName("pdf") === "lucide:file-text"
```

Ensure the helper accepts IDs only—there must be no path-like parameter.

- [ ] **Step 3: Implement the pure helper.**

Add kind-to-icon mapping, size formatting, and encoded content endpoint construction. Run focused test GREEN.

- [ ] **Step 4: Rewrite gallery source selection.**

`VideoSource` contains `id`, `mime`, `resolution`, `label`, and `isOriginal`, but no path. Original source uses `mediaContentUrl(media.id)`; a variant uses `mediaContentUrl(media.id, variant.id)`. Image and PDF previews use the same authenticated endpoint. SVG and office documents are never embedded.

- [ ] **Step 5: Rewrite gallery cards and actions.**

Show `media.name`, type/kind, `formatMediaSize(media.size)`, and an icon. Keep image/video dialog behavior, add an `<iframe>` or `<object>` for authenticated PDF preview, and provide a Download button for document/SVG cards pointing to the content endpoint. Remove every visible URL and every use of `.path`, `resolveUrl`, or `split('/')`.

- [ ] **Step 6: Align form previews and verify the public boundary.**

Use the same filename, size, and icon presentation for pending and existing media in both forms. Ensure inputs contain `:accept="TASK_MEDIA_ACCEPT"`. Run:

```bash
rg -n "\.path|storageKey|STORAGE_ROOT|uploads/tasks/media" components lib --glob "*.vue" --glob "*.ts"
```

Any media-path result in frontend code is a failure; unrelated router paths are allowed after manual inspection. Run both `tests/task-media-contract.test.ts` and `tests/task-media-presentation.test.ts`. Do not require full typecheck to pass until Task 9 has replaced video path consumers, but do not introduce new errors in the files touched here.

- [ ] **Step 7: Commit.**

```bash
git add lib/task-media-presentation.ts lib/types.ts server/lib/serializers.ts components/task/TaskMediaGallery.vue components/task/CreateTaskForm.vue components/task/UpdateTaskForm.vue tests/task-media-presentation.test.ts tests/task-media-contract.test.ts
git commit -m "feat: present task media without file paths"
```

---

## Task 8: Make deletion ID-only and collect stale pending uploads

**Files:**

- Create: `server/lib/task-media-delete.ts`
- Replace: `server/api/tasks/media.delete.ts`
- Modify: `server/api/tasks/delete.delete.ts`
- Create: `server/lib/pending-media-cleanup.ts`
- Modify: `server/cron.ts`
- Test: `tests/task-media-delete.test.ts`
- Test: `tests/pending-media-cleanup.test.ts`

- [ ] **Step 1: Write failing deletion-policy tests.**

Test attached member deletion, attached nonmember rejection, pending uploader/current-member deletion, other uploader rejection, missing file with successful metadata deletion, original plus variants removal, and storage failure behavior. The API body schema is exactly `{ media_id: string }`; `path` and `workspace_id` must be rejected/ignored as authorization inputs.

- [ ] **Step 2: Implement the shared deletion service and route.**

`deleteTaskMediaById({ mediaId, userId }, deps)` authorizes from the row, collects non-null storage keys, removes objects idempotently, deletes the row, and returns the attached `taskId/workspaceId` for optional broadcast. Log only media IDs and stable categories. Replace the route's direct path deletion and remove `server/lib/task-media.ts` once no callers remain.

- [ ] **Step 3: Route task deletion through storage cleanup.**

Before deleting an admin-authorized task, load its media IDs and call an internal already-authorized batch deletion variant that reuses the object cleanup primitive. Do not construct paths. Decide DB deletion only after all attempted file removals; missing objects are not fatal, unexpected storage errors are.

- [ ] **Step 4: Write failing 24-hour cleanup tests.**

With an injected clock/repository/storage, cover only `taskId = null AND createdAt < now - 24h`, attached historical rows, young pending rows, missing physical objects, unexpected storage errors, and a bounded batch size so one cron run cannot load the entire table.

- [ ] **Step 5: Implement and schedule cleanup.**

Export `removeExpiredPendingMedia({ now, batchSize }, deps)` and schedule it every hour in `server/cron.ts` under `pending-media-cleanup`. Remove object first, then row; if object removal fails unexpectedly, keep the row for retry. Process batches sequentially or with a small fixed concurrency.

- [ ] **Step 6: Verify and commit.**

Run both focused tests and the full existing test suite. Full typecheck follows in Task 9 after video conversion is migrated. Then commit:

```bash
git add server/lib/task-media-delete.ts server/api/tasks/media.delete.ts server/api/tasks/delete.delete.ts server/lib/pending-media-cleanup.ts server/cron.ts tests/task-media-delete.test.ts tests/pending-media-cleanup.test.ts
git rm server/lib/task-media.ts
git commit -m "feat: secure media deletion and pending cleanup"
```

---

## Task 9: Store video variants privately

**Files:**

- Modify: `server/lib/video.ts`
- Modify: `server/lib/media-upload-service.ts`
- Modify: `server/lib/task-media-delete.ts`
- Test: `tests/private-video-variants.test.ts`

- [ ] **Step 1: Write failing video storage tests.**

Inject `probe` and `transcode` so tests do not require real ffmpeg. Cover: smaller 720/480/360 outputs only, temp output per variant, atomic commit, DB rows containing key/size/mime/resolution but no path, cleanup of failed partial variants, and original preserved when any/all transcodes fail.

- [ ] **Step 2: Refactor video generation around controlled physical paths.**

Change `generateVideoVariants` to accept a validated input physical path and an allocated temporary output path; return `{ temporaryPath, resolution, mime }` metadata, not public/relative paths. Delete `buildVariantPaths` and all imports of the old public resolver.

- [ ] **Step 3: Integrate generation after a pending video row is committed.**

The upload service calls `privateStorage.withPhysicalPath(originalKey, ...)`, allocates `task-media-variant` keys and temporary objects, transcodes, commits, stats, and creates `TaskMediaVariant` rows. On a variant DB failure, remove that committed variant. On generation failure, log media ID/resolution/category only and still return the valid original upload.

- [ ] **Step 4: Verify content selection and deletion.**

Extend the test to prove `authorizeMediaRead` selects only a variant belonging to the requested media and deletion removes all variant keys. Run the focused test and `npm run typecheck` GREEN.

- [ ] **Step 5: Commit.**

```bash
git add server/lib/video.ts server/lib/media-upload-service.ts server/lib/task-media-delete.ts tests/private-video-variants.test.ts
git commit -m "feat: store video variants in private storage"
```

---

## Task 10: Build the restartable legacy storage migration CLI

**Files:**

- Create: `server/lib/storage/legacy-migration.ts`
- Create: `scripts/migrate-media-storage.ts`
- Test: `tests/legacy-media-migration.test.ts`

- [ ] **Step 1: Write failing dry-run tests.**

Use a temporary fake legacy public directory, private root, and injected row repository. Assert dry-run performs zero writes/moves/DB updates and reports counts for originals, variants, missing paths, invalid traversal paths, duplicate references, referenced files, unreferenced files, and estimated bytes. Summaries contain row IDs/counts but no absolute paths.

- [ ] **Step 2: Implement inventory and dry-run.**

Resolve legacy paths only under `<cwd>/public/uploads/tasks/media`. Export:

```ts
export async function inspectLegacyMedia(input: MigrationInput, deps: MigrationDependencies): Promise<MigrationReport>;
export async function migrateLegacyMedia(input: MigrationInput, deps: MigrationDependencies): Promise<MigrationReport>;
```

Keep the engine dependency-injected; the CLI supplies Prisma, fs, crypto, and storage implementations.

- [ ] **Step 3: Write failing apply/recovery tests.**

Cover complete-directory move to `<STORAGE_ROOT>/migration-source/<timestamp>`, cross-device `EXDEV` fallback (copy, byte/hash verify, remove source), JSON manifest creation, `.part` copy, SHA-256/size validation, atomic commit, transactional DB update plus legacy path nulling, rollback removal on DB failure, untouched orphan files, interrupted rerun, already-migrated skip, missing source retention, and nonzero incomplete result.

- [ ] **Step 4: Implement apply mode.**

The manifest records a stable source-relative name, row kind/id, checksum, size, destination key, and state—never an absolute path. Before skipping a completed item, verify both DB key and destination stat. Update each original's `workspaceId` from its task, canonical MIME, fallback original filename, size, storage key, and null legacy path during the transaction; variants inherit workspace authorization through their media row and receive MIME/size/key with null legacy path. Leave the private migration source in place for audit.

- [ ] **Step 5: Implement the CLI boundary.**

Accept exactly one of `--dry-run` or `--apply`; reject missing/both flags. Load `.env` through Node's process environment as deployment already does, instantiate Prisma using `DATABASE_URL`, validate `STORAGE_ROOT`, print a concise human summary plus one JSON summary line, disconnect in `finally`, and set `process.exitCode = 1` when referenced rows remain unmigrated. `--apply` must print a prominent stopped-server requirement before mutation.

- [ ] **Step 6: Verify idempotency and commit.**

Run:

```bash
node --test --experimental-strip-types tests/legacy-media-migration.test.ts
npm run storage:migrate -- --dry-run
```

The second command may fail locally if no database/storage env is configured; if so, confirm it fails before writes with a clear configuration error. Commit:

```bash
git add server/lib/storage/legacy-migration.ts scripts/migrate-media-storage.ts tests/legacy-media-migration.test.ts package.json package-lock.json
git commit -m "feat: add legacy media storage migration"
```

---

## Task 11: Document deployment, close legacy leaks, and run full verification

**Files:**

- Modify: `README.md`
- Modify: `deploy/nginx/vue_crm.conf`
- Modify: `deploy/apache/vue_crm.conf`
- Modify: `nuxt.config.ts`
- Modify as discovered: any remaining media-path consumer found by the audits below
- Test: `tests/private-media-boundary.test.ts`

- [ ] **Step 1: Add a failing boundary regression test.**

Exercise the public serializer, upload response mapper, task types/schema, and delete client. Recursively assert public media payloads have none of `path`, `storageKey`, `storage_root`, `url`, or absolute-path-shaped values. Verify the content endpoint URL is derived only from encoded IDs.

- [ ] **Step 2: Audit and remove all legacy public media behavior.**

Run:

```bash
rg -n "public[/\\\\]uploads|uploads/tasks/media|resolveTaskMediaPath|deleteTaskMediaFile|original_name.*path|media\.path|variant\.path|storageKey" . --glob "!docs/**" --glob "!prisma/migrations/**" --glob "!node_modules/**" --glob "!.output/**"
```

Classify every result. Prisma/server-internal `storageKey` use is expected; route responses, client code, UI, and logs are not. Remove any obsolete static upload handling from Nuxt, Nginx, and Apache. Do not add an alias to `STORAGE_ROOT`.

- [ ] **Step 3: Document production migration and rollback exactly.**

In `README.md`, add:

```bash
# while old app is still running: backup DB, pull, npm ci, validate/test/build
npm run server:stop
npx prisma migrate deploy
npm run storage:migrate -- --dry-run
npm run storage:migrate -- --apply
npm run server:start
```

Document absolute `STORAGE_ROOT` outside the repo/public tree, ownership/read-write permissions for the app OS user, required zero exit from apply, smoke tests, retention of the migration source/database backup, and rollback ordering from the approved spec. State that `npm ci` must include dev dependencies until Prisma, `tsx`, tests, and build have run.

- [ ] **Step 4: Run the complete automated verification from a clean process.**

Run and inspect every exit code:

```bash
npm test
npm run typecheck
npx prisma validate
npx prisma generate
npm run build
git diff --check
```

Do not describe the feature as ready if any command fails. Fix failures with a new focused regression test, rerun its focused test, then rerun this full sequence.

- [ ] **Step 5: Perform a local authenticated smoke test.**

With a disposable database/workspace and temporary absolute `STORAGE_ROOT`, verify: image preview; video playback plus a real Range request; inline PDF; DOCX/XLSX/ODT download with filename; rejected macro file; rejected oversized file; another workspace/user gets denied; pending cancel deletion; attached deletion; pending cleanup; and no file beneath `public/uploads/tasks/media`. Inspect browser network JSON to confirm no path/key is present.

- [ ] **Step 6: Commit the final integration.**

```bash
git add README.md deploy/nginx/vue_crm.conf deploy/apache/vue_crm.conf nuxt.config.ts tests/private-media-boundary.test.ts
git add -u
git commit -m "docs: add private media deployment procedure"
```

- [ ] **Step 7: Record production-only verification without overstating it.**

In the handoff, list exact local command results and separately list the required stopped-server production sequence. Production migration and smoke tests remain operator actions until their real outputs are observed.
