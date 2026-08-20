type WorkspaceMemberRole = "ADMIN" | "MEMBER";

type MemberRoleChangeRequest = {
  actorUserId: string;
  actorRole: WorkspaceMemberRole;
  targetUserId: string;
  targetRole: WorkspaceMemberRole;
  nextRole: WorkspaceMemberRole;
  ownerId: string;
};

export function canChangeWorkspaceMemberRole({
  actorUserId,
  actorRole,
  targetUserId,
  targetRole,
  nextRole,
  ownerId,
}: MemberRoleChangeRequest) {
  if (targetRole === nextRole) return false;
  if (targetUserId === ownerId) return false;
  if (actorUserId === ownerId) return true;

  if (actorRole !== "ADMIN") return false;

  const isSelfDemotion =
    actorUserId === targetUserId && nextRole === "MEMBER";
  const isPromotingMember =
    actorUserId !== targetUserId &&
    targetRole === "MEMBER" &&
    nextRole === "ADMIN";

  return isSelfDemotion || isPromotingMember;
}
