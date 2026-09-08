# Project Visibility and Access Design

## Goal

Add public/private project visibility without leaking private project data through lists, direct URLs, APIs, notifications, files, Agent API, or realtime events. New and migrated projects default to `PUBLIC`.

## Data model

- Add `ProjectVisibility` enum: `PUBLIC`, `PRIVATE`.
- Add required `Project.visibility`, default `PUBLIC`.
- Add required `Project.creatorId` relation to `User`.
- Add `ProjectAccess(projectId, userId, createdAt)` with a unique `(projectId, userId)` pair and cascade deletion.
- Migration backfills every existing project's creator from its workspace owner and leaves visibility public.

## Effective access

A user must first belong to the workspace. Workspace administrators can access every project. Other members can access a project only when every project on its ancestor path is accessible:

- a public node adds no restriction;
- a private node requires the user to be its creator or have a direct grant for it.

This lets a private ancestor restrict its whole branch and a private descendant narrow access further. Missing parents and hierarchy cycles deny access.

One server module owns this policy. It provides request-scoped visible-project calculation, direct project authorization returning `404` when denied, and accessible-recipient calculation.

## Management

- Project creation accepts optional visibility and access-user IDs; visibility defaults to public and the authenticated creator is stored.
- Only the creator may change visibility or replace the access list.
- Grants may target only current members of the same workspace. The creator is implicitly allowed.
- Switching to public deletes stored grants.
- Workspace admins retain existing project rename/delete rights but cannot manage another creator's visibility or grants.
- When a project creator leaves or is removed from a workspace, the request must select another workspace member. All projects created by the departing member transfer to that successor in the same transaction as membership removal. The existing prohibition on removing the only workspace member remains.

## Enforcement

Apply the shared policy to project lists/details, project and workspace analytics, task lists/search/details/mutations, comments, docs and imports, task media, notifications, project selectors, and Agent API context. Assignment and mentions must not expose a private project to users without effective access. Email, in-app, and realtime recipients are restricted to users with effective access. Direct access to hidden resources returns `404`.

## UI

- Creation form: Public/Private selector, default Public; member selector for Private.
- Project settings: creator-only visibility/access panel with atomic save.
- Project lists: lock indicator for private or effectively restricted projects.
- Member removal: when the target owns projects, require a successor selector and explain that ownership will transfer.

## Testing

Use test-first coverage for the access matrix, ancestor restrictions, admin bypass, malformed hierarchy fail-closed behavior, ACL replacement, ownership transfer, list filtering, direct `404` behavior, related content and media, notifications, Agent API, and realtime recipients. Verify the full test suite, typecheck, migration generation, and production build.
