# Project Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public/private project visibility with inherited access controls across every project data surface.

**Architecture:** Store project visibility, immutable creator ownership, and direct user grants. A central policy computes effective access across the ancestor chain; server routes use it for filtering and fail-closed direct authorization.

**Tech Stack:** Nuxt 3, TypeScript, Prisma 7/MySQL, Vue 3, Node test runner, Zod

**Spec:** `docs/superpowers/specs/2026-09-08-project-visibility-design.md`

## Global Constraints

- New and migrated projects default to `PUBLIC`.
- Workspace administrators can access every project but cannot manage another creator's ACL.
- Every private node from the root to the target must authorize a non-admin user.
- Hidden resources return `404` and must not leak through lists, notifications, files, Agent API, or realtime.
- Only current workspace members may receive grants or project ownership.

---

### Task 1: Persist visibility, creators, and direct grants

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260908_project_visibility/migration.sql`
- Modify: `server/lib/serializers.ts`
- Modify: `lib/types.ts`
- Test: `tests/project-visibility-model.test.ts`

**Interfaces:**
- Produces: `ProjectVisibility.PUBLIC | PRIVATE`, `Project.creatorId`, `Project.accessGrants`, and serialized `visibility`, `creator_id`.

- [ ] **Step 1: Write the failing model test**

```ts
test("project visibility is public by default and grants are unique", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  assert.match(schema, /enum ProjectVisibility[\s\S]*PUBLIC[\s\S]*PRIVATE/);
  assert.match(schema, /visibility\s+ProjectVisibility\s+@default\(PUBLIC\)/);
  assert.match(schema, /creatorId\s+String/);
  assert.match(schema, /@@unique\(\[projectId, userId\]\)/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test --experimental-strip-types tests/project-visibility-model.test.ts`
Expected: FAIL because the enum and fields do not exist.

- [ ] **Step 3: Add the Prisma model and migration**

```prisma
enum ProjectVisibility {
  PUBLIC
  PRIVATE
}

model ProjectAccess {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  createdAt DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([projectId, userId])
  @@index([userId])
}
```

Add `visibility`, `creatorId`, `creator`, and `accessGrants` to `Project`, plus inverse relations to `User`. The SQL migration adds nullable `creatorId`, backfills it from `Workspace.ownerId`, makes it required, and adds the foreign key and access table.

- [ ] **Step 4: Serialize the fields and verify**

Return `visibility: project.visibility.toLowerCase()` and `creator_id: project.creatorId`; update `Project` client types. Run the model test and `npx prisma validate`.

- [ ] **Step 5: Commit**

```bash
git add prisma server/lib/serializers.ts lib/types.ts tests/project-visibility-model.test.ts
git commit -m "feat: persist project visibility and grants"
```

### Task 2: Centralize effective project authorization

**Files:**
- Create: `server/lib/project-access-policy.ts`
- Create: `server/lib/project-access.ts`
- Test: `tests/project-access-policy.test.ts`
- Test: `tests/project-access.test.ts`

**Interfaces:**
- Produces: `calculateVisibleProjectIds(input): Set<string>`.
- Produces: `getVisibleProjectIds(event, workspaceId): Promise<Set<string>>`.
- Produces: `requireProjectAccess(event, projectId): Promise<{ project; membership }>`; denial is a 404.
- Produces: `getProjectVisibleUserIds(workspaceId, projectId): Promise<Set<string>>`.

- [ ] **Step 1: Write failing policy tests**

```ts
test("a private ancestor restricts the complete branch", () => {
  const visible = calculateVisibleProjectIds({
    userId: "member",
    isAdmin: false,
    projects: [
      { id: "root", parentId: null, visibility: "PRIVATE", creatorId: "owner" },
      { id: "child", parentId: "root", visibility: "PUBLIC", creatorId: "owner" },
      { id: "deep", parentId: "child", visibility: "PRIVATE", creatorId: "owner" },
    ],
    grantedProjectIds: new Set(["root"]),
  });
  assert.deepEqual([...visible], ["root", "child"]);
});

test("admins bypass privacy and malformed branches fail closed", () => {
  assert.deepEqual([...calculateVisibleProjectIds(adminFixture)], ["root", "child"]);
  assert.deepEqual([...calculateVisibleProjectIds(cyclicMemberFixture)], []);
});
```

- [ ] **Step 2: Run the policy tests and verify they fail**

Run: `node --test --experimental-strip-types tests/project-access-policy.test.ts`
Expected: FAIL because `calculateVisibleProjectIds` does not exist.

- [ ] **Step 3: Implement the pure tree policy**

Use memoized DFS with `visiting` and `resolved` sets. A non-admin node is visible only when its parent is visible and the node is public, created by the user, or directly granted. A missing parent or cycle resolves to false.

- [ ] **Step 4: Test and implement the Prisma/H3 adapter**

Write adapter tests with a stateful fake repository. Load membership, project tree, and the current user's grants once per request/workspace. `requireProjectAccess` must return 404 for missing and hidden IDs. Run both access test files.

- [ ] **Step 5: Commit**

```bash
git add server/lib/project-access-policy.ts server/lib/project-access.ts tests/project-access*.test.ts
git commit -m "feat: centralize project access policy"
```

### Task 3: Create projects and manage ACL atomically

**Files:**
- Modify: `lib/schema/createProject.ts`
- Create: `lib/schema/projectAccess.ts`
- Modify: `server/api/projects/create.post.ts`
- Create: `server/api/projects/[projectId]/access.get.ts`
- Create: `server/api/projects/[projectId]/access.patch.ts`
- Modify: `server/api/projects/[projectId]/index.get.ts`
- Modify: `server/api/workspaces/[workspaceId]/projects.get.ts`
- Test: `tests/project-access-schema.test.ts`
- Test: `tests/project-access-management.test.ts`

**Interfaces:**
- Create accepts `visibility?: "PUBLIC" | "PRIVATE"` and `access_user_ids?: string[]`.
- ACL patch accepts `{ visibility: "PUBLIC" | "PRIVATE", user_ids: string[] }` and replaces grants.
- Access GET returns `{ visibility, creator, members, granted_user_ids, can_manage }` only to the creator.

- [ ] **Step 1: Write failing schema and management tests**

```ts
test("project creation defaults visibility to public", () => {
  assert.equal(CreateProjectsSchema.parse(baseInput).visibility, "PUBLIC");
});

test("only the creator can replace grants", async () => {
  await assert.rejects(() => replaceProjectAccess(nonCreatorInput), ProjectNotFoundError);
  assert.deepEqual(await replaceProjectAccess(creatorInput), ["member-2"]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test --experimental-strip-types tests/project-access-schema.test.ts tests/project-access-management.test.ts`
Expected: FAIL because fields and management service are absent.

- [ ] **Step 3: Implement transactional creation and ACL replacement**

Set `creatorId = user.id`. Validate parent through `requireProjectAccess`, validate all grant IDs as workspace members, create grants with `skipDuplicates`, and clear grants whenever visibility becomes public.

- [ ] **Step 4: Filter list/detail responses**

Use `getVisibleProjectIds` before project/task progress queries; include `visibility`, `creator_id`, `is_effectively_restricted`, and `can_manage_access`. Direct hidden detail returns 404.

- [ ] **Step 5: Run tests and commit**

```bash
node --test --experimental-strip-types tests/project-access-schema.test.ts tests/project-access-management.test.ts tests/project-hierarchy.test.ts
git add lib/schema server/api/projects server/api/workspaces tests/project-access-*.test.ts
git commit -m "feat: create private projects and manage access"
```

### Task 4: Enforce access across project content

**Files:**
- Modify: `server/lib/tasks.ts`
- Modify: `server/lib/media-access.ts`
- Modify: `server/api/tasks/filter.get.ts`
- Modify: `server/api/tasks/create.post.ts`
- Modify: `server/api/tasks/delete.delete.ts`
- Modify: `server/api/tasks/[taskId].get.ts`
- Modify: `server/api/tasks/[taskId].patch.ts`
- Modify: `server/api/tasks/[taskId]/comments.get.ts`
- Modify: `server/api/tasks/[taskId]/comments.post.ts`
- Modify: `server/api/tasks/media/[mediaId]/content.get.ts`
- Modify: `server/api/projects/[projectId]/analytics.get.ts`
- Modify: `server/api/projects/[projectId]/docs.get.ts`
- Modify: `server/api/projects/[projectId]/docs.post.ts`
- Modify: `server/api/projects/[projectId]/docs/import.post.ts`
- Modify: `server/api/projects/[projectId]/docs/[docId].get.ts`
- Modify: `server/api/projects/[projectId]/docs/[docId].patch.ts`
- Modify: `server/api/projects/[projectId]/doc-sections.get.ts`
- Modify: `server/api/projects/[projectId]/doc-sections.post.ts`
- Modify: `server/api/projects/[projectId]/doc-sections/[sectionId].patch.ts`
- Modify: `server/api/workspaces/[workspaceId]/analytics.get.ts`
- Modify: `server/api/agent/v1/workspaces/[workspaceId]/context.get.ts`
- Test: `tests/project-content-access.test.ts`
- Test: `tests/media-access.test.ts`
- Test: `tests/agent-api-project-access.test.ts`

**Interfaces:**
- Consumes: `getVisibleProjectIds`, `requireProjectAccess`, `getProjectVisibleUserIds` from Task 2.
- Produces: no private project content through any read or mutation route.

- [ ] **Step 1: Add failing content-boundary tests**

```ts
test("hidden project tasks are absent from search and direct reads return not found", async () => {
  assert.deepEqual(await searchTasks(memberContext), [publicTask]);
  await assert.rejects(() => readTask(memberContext, privateTask.id), /not found/i);
});

test("attached media requires access to its task project", async () => {
  await assert.rejects(() => authorizeMediaRead(privateMediaInput, dependencies), MediaReadForbiddenError);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test --experimental-strip-types tests/project-content-access.test.ts tests/media-access.test.ts tests/agent-api-project-access.test.ts`
Expected: FAIL because workspace membership alone still grants access.

- [ ] **Step 3: Guard task, comment, doc, analytics, and import routes**

Filter collection queries by `{ projectId: { in: [...visibleIds] } }`. Resolve direct task/doc/section entities to their project and call `requireProjectAccess`. Moving a task or importing docs requires access to both source and target projects.

- [ ] **Step 4: Guard media and Agent API**

Extend media lookup with `task.projectId`; its authorization dependency checks project access for attached media while pending media remains uploader-only. Filter Agent API projects/tasks and both analytics endpoints by visible project IDs.

- [ ] **Step 5: Verify and commit**

```bash
npm test
git add server/lib/tasks.ts server/lib/media-access.ts server/api tests
git commit -m "feat: enforce private project content access"
```

### Task 5: Restrict recipients and transfer ownership

**Files:**
- Modify: `server/lib/task-events.ts`
- Modify: `server/api/realtime/tasks.get.ts`
- Modify: `server/api/tasks/create.post.ts`
- Modify: `server/lib/tasks.ts`
- Modify: `server/api/tasks/[taskId]/comments.post.ts`
- Modify: `server/api/notifications.get.ts`
- Modify: `server/api/workspaces/remove-member.delete.ts`
- Modify: `lib/workspace-member-client.ts`
- Test: `tests/task-events.test.ts`
- Test: `tests/project-recipient-access.test.ts`
- Test: `tests/project-owner-transfer.test.ts`

**Interfaces:**
- Realtime streams register with `userId`; broadcasts accept `recipientUserIds` and send only to matching streams.
- Member removal accepts `{ membershipId, successorUserId? }`.

- [ ] **Step 1: Write failing recipient and transfer tests**

```ts
test("private task events reach only users with effective access", async () => {
  broadcastTaskEvent("workspace", payload, new Set(["creator", "granted"]));
  assert.equal(streams.creator.messages.length, 1);
  assert.equal(streams.granted.messages.length, 1);
  assert.equal(streams.hidden.messages.length, 0);
});

test("removing a creator transfers every owned project atomically", async () => {
  await removeMember({ membershipId: "departing", successorUserId: "successor" });
  assert.deepEqual(projects.map((project) => project.creatorId), ["successor", "successor"]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test --experimental-strip-types tests/task-events.test.ts tests/project-recipient-access.test.ts tests/project-owner-transfer.test.ts`
Expected: FAIL because streams are workspace-wide and ownership transfer is absent.

- [ ] **Step 3: Restrict notifications and realtime**

Calculate project-visible user IDs before creating notifications, sending email, validating mentions, or broadcasting task payloads. Store `userId` with each SSE stream and deliver only to the supplied recipients. Filter old notifications on read as defense in depth.

- [ ] **Step 4: Transfer ownership during member removal**

Count projects created by the target. If any exist, require and validate a distinct successor workspace member; update all matching `Project.creatorId` and delete the membership in one transaction.

- [ ] **Step 5: Verify and commit**

```bash
node --test --experimental-strip-types tests/task-events.test.ts tests/project-recipient-access.test.ts tests/project-owner-transfer.test.ts
git add server lib tests
git commit -m "feat: secure project events and ownership transfer"
```

### Task 6: Add visibility, ACL, and successor UI

**Files:**
- Modify: `components/project/CreateProjectForm.vue`
- Modify: `components/project/UpdateProjectForm.vue`
- Modify: `components/project/TreeItem.vue`
- Modify: `components/project/ListSidebar.vue`
- Modify: `components/workspace/member/MemberItem.vue`
- Modify: `lib/i18n.ts`
- Modify: `lib/types.ts`
- Test: `tests/project-ui-contract.test.ts`
- Test: `tests/workspace-member-client.test.ts`

**Interfaces:**
- Consumes the access endpoints and serialized fields from Tasks 1–3.
- Produces creator-only ACL controls, lock indicators, and required successor selection.

- [ ] **Step 1: Write failing client contract tests**

```ts
test("ACL updates replace visibility and user IDs", async () => {
  await client.replaceAccess("project-1", "PRIVATE", ["user-2"]);
  assert.deepEqual(request.body, { visibility: "PRIVATE", user_ids: ["user-2"] });
});

test("member removal submits the selected successor", async () => {
  await memberClient.remove("membership-1", "user-2");
  assert.deepEqual(request.body, { membershipId: "membership-1", successorUserId: "user-2" });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test --experimental-strip-types tests/project-ui-contract.test.ts tests/workspace-member-client.test.ts`
Expected: FAIL because the client methods and payloads are absent.

- [ ] **Step 3: Implement forms and indicators**

Default creation to Public; show member multi-select for Private. In settings, render ACL controls only for `can_manage_access`. Render a lock for explicit or inherited restriction. Add translated labels and error text.

- [ ] **Step 4: Implement successor selection**

Expose owned-project count in member data. Before removing a creator, require a successor selection from other workspace members and submit it with the removal request.

- [ ] **Step 5: Run final verification and commit**

```bash
npm test
npm run typecheck
npm run build
git diff --check
git add components lib tests
git commit -m "feat: add private project access controls"
```
