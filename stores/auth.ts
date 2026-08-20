import { defineStore } from "pinia";
import { useQuery } from "@tanstack/vue-query";

import type { ApiUser } from "~/lib/types";
import { createAuthQuery } from "./auth-query";

const useAuthStore = defineStore("auth", () => {
  const user = ref<ApiUser | null>(null);
  const isFirstLoading = ref(true);
  const isLoading = ref(true);

  async function init() {
    if (import.meta.server) {
      const event = useRequestEvent();
      user.value = (event?.context.user as ApiUser | null) ?? null;
      isLoading.value = false;
      isFirstLoading.value = false;
      return;
    }

    const requestFetch = useRequestFetch();
    const { data, isFetching, isRefetching, isSuccess, isError } =
      useQuery<ApiUser | null>({
        queryKey: ["auth/me"],
        queryFn: createAuthQuery((request) => requestFetch(request)),
        staleTime: Infinity,
      });

    watchEffect(() => {
      isLoading.value = isFetching.value;
      isFirstLoading.value = isFetching.value && !isRefetching.value;

      if (!isFetching.value && (isSuccess.value || isError.value)) {
        user.value = data.value ?? null;
      }
    });
  }

  function setUser(newUser: ApiUser | null) {
    user.value = newUser;
  }

  function clear() {
    user.value = null;
  }

  return { init, user, setUser, isLoading, isFirstLoading, clear };
});

export default useAuthStore;
