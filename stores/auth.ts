import { defineStore } from "pinia";
import { useQuery } from "@tanstack/vue-query";

import type { ApiUser } from "~/lib/types";

const useAuthStore = defineStore("auth", () => {
  const user = ref<ApiUser | null>(null);
  const isFirstLoading = ref(true);
  const isLoading = ref(true);

  async function init() {
    const { data, isFetching, isRefetching, isSuccess, isError } =
      useQuery<ApiUser>({
        queryKey: ["auth/me"],
        queryFn: async () => {
          const res = await fetch("/api/auth/me");
          const data = await res.json();
          return data.user;
        },
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
