type WorkspaceMemberRole = "ADMIN" | "MEMBER";

type MemberRemovalRequest = {
  actorUserId: string;
  actorRole: WorkspaceMemberRole;
  targetUserId: string;
  targetRole: WorkspaceMemberRole;
  ownerId: string;
};

export function canRemoveWorkspaceMember({
  actorUserId,
  actorRole,
  targetUserId,
  targetRole,
  ownerId,
}: MemberRemovalRequest) {
  if (actorUserId === targetUserId) return true;
  if (actorUserId === ownerId) return true;
  return actorRole === "ADMIN" && targetRole === "MEMBER";
}
