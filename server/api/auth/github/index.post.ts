import { randomBytes } from "node:crypto";
import { setCookie } from "h3";

import { GITHUB_STATE_COOKIE } from "~/server/lib/constants";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  if (!config.githubClientId || !config.public.oauthGitHubCallbackUrl) {
    throw createError({
      status: 500,
      statusText: "GitHub OAuth is not configured",
    });
  }

  const state = randomBytes(16).toString("hex");
  setCookie(event, GITHUB_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/",
  });

  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", config.githubClientId);
  authorizationUrl.searchParams.set(
    "redirect_uri",
    config.public.oauthGitHubCallbackUrl,
  );
  authorizationUrl.searchParams.set("scope", "read:user user:email");
  authorizationUrl.searchParams.set("state", state);

  return sendRedirect(event, authorizationUrl.toString());
});
