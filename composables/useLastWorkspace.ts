import useAuthStore from "~/stores/auth";
import {
  LAST_WORKSPACES_COOKIE,
  rememberWorkspace,
} from "~/lib/last-workspace";

export function useLastWorkspace() {
  const authStore = useAuthStore();
  const stored = useCookie<Record<string, string>>(LAST_WORKSPACES_COOKIE, {
    default: () => ({}),
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const workspaceId = computed(() => {
    const userId = authStore.user?.id;
    return userId ? (stored.value?.[userId] ?? null) : null;
  });

  const setWorkspaceId = (nextWorkspaceId: string) => {
    const userId = authStore.user?.id;
    if (!userId || !nextWorkspaceId) return;
    stored.value = rememberWorkspace(stored.value, userId, nextWorkspaceId);
  };

  return { workspaceId, setWorkspaceId };
}
