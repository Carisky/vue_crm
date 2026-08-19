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
    const user = useState("user");

    if (event && !user.value) await sendRedirect(event, "/sign-in", 303);
    return;
  }

  if (!useAuthStore().user) return navigateTo("/sign-in");
}

export default authenticatedPageProtectMiddleware;
