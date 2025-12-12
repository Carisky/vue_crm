import { deleteCookie, getCookie, H3Event, setCookie } from "h3";

import { createSession, deleteSessionByToken } from "./session";

export async function createAuthSession(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event);
  const { token, session } = await createSession(userId);

  setCookie(event, config.public.sessionCookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });

  event.context.user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    avatarUrl: session.user.avatarUrl,
    monthlyWorkloadTargetHours: session.user.monthlyWorkloadTargetHours ?? null,
    themePreference: session.user.themePreference,
  };

  return session;
}

export async function destroyAuthSession(event: H3Event) {
  const config = useRuntimeConfig(event);
  const token = getCookie(event, config.public.sessionCookieName);

  await deleteSessionByToken(token);

  deleteCookie(event, config.public.sessionCookieName, {
    path: "/",
  });

  event.context.user = null;
  event.context.session = null;
}
