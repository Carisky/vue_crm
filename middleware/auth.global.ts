import { defineNuxtRouteMiddleware, useState } from "nuxt/app";

import type { ApiUser } from "~/lib/types";

export default defineNuxtRouteMiddleware(() => {
  const userData = useState<ApiUser | null>("user", () => null);

  if (import.meta.server) {
    const event = useRequestEvent();
    if (event) {
      userData.value = (event.context.user as ApiUser | null) ?? null;
    }
  }
});
