import type {
  RouteLocationNormalizedGeneric,
  RouteLocationNormalizedLoadedGeneric,
} from "vue-router";
import { sendRedirect } from "h3";

import useAuthStore from "~/stores/auth";

async function authenticatedPageProtectMiddleware(
  to: RouteLocationNormalizedGeneric,
  from: RouteLocationNormalizedLoadedGeneric,
) {
  if (import.meta.server) {
    const event = useRequestEvent();

    if (event && !event.context.user) {
      await sendRedirect(
        event,
        `/sign-in?redirect=${encodeURIComponent(to.fullPath)}`,
        303,
      );
    }
    return;
  }

  if (!useAuthStore().user) {
    return navigateTo({ path: "/sign-in", query: { redirect: to.fullPath } });
  }
}

export default authenticatedPageProtectMiddleware;
