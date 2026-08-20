export type WorkspaceMemberDatabaseRole = "ADMIN" | "MEMBER";

type RequestOptions = {
  method: "DELETE" | "PATCH";
  body: Record<string, string>;
};

type Request = (
  url: string,
  options: RequestOptions,
) => Promise<Record<string, unknown>>;

export function createWorkspaceMemberClient(request: Request) {
  return {
    remove(membershipId: string) {
      return request("/api/workspaces/remove-member", {
        method: "DELETE",
        body: { membershipId },
      });
    },
    updateRole(membershipId: string, role: WorkspaceMemberDatabaseRole) {
      return request("/api/workspaces/update-member", {
        method: "PATCH",
        body: { membershipId, role },
      });
    },
  };
}
