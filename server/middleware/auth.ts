import { deleteCookie, getCookie } from "h3";

import { getSessionByToken } from "../lib/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const sessionCookieName = config.public.sessionCookieName;

  const token = getCookie(event, sessionCookieName);
  event.context.user = null;
  event.context.session = null;

  if (!token) return;

  const session = await getSessionByToken(token);
  if (!session) {
    deleteCookie(event, sessionCookieName, { path: "/" });
    return;
  }

  event.context.user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    avatarUrl: session.user.avatarUrl,
    monthlyWorkloadTargetHours: session.user.monthlyWorkloadTargetHours ?? null,
  };
  event.context.session = session;
});
