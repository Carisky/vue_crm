import {
  deleteCookie,
  getCookie,
  getRequestProtocol,
  H3Event,
  setCookie,
} from "h3";

import { createSession, deleteSessionByToken } from "./session";

export async function createAuthSession(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event);
  const { token, session } = await createSession(userId);
  const secure = getRequestProtocol(event, { xForwardedProto: true }) === "https";

  setCookie(event, config.public.sessionCookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure,
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
    emailNotificationsEnabled: session.user.emailNotificationsEnabled,
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
