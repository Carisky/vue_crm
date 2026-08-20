import type { ApiUser } from "~/lib/types";

type AuthRequestFetch = (
  request: string,
) => Promise<{ user: ApiUser | null }>;

export function createAuthQuery(requestFetch: AuthRequestFetch) {
  return async () => {
    const { user } = await requestFetch("/api/auth/me");
    return user;
  };
}
