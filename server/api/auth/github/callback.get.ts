import { deleteCookie, getCookie } from "h3";

import { GITHUB_STATE_COOKIE } from "~/server/lib/constants";
import { createAuthSession } from "~/server/lib/auth";
import prisma from "~/server/lib/prisma";

type GitHubEmail = {
  email: string;
  verified: boolean;
  primary: boolean;
  visibility: string | null;
};

type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
};

async function fetchGitHubAccessToken(params: {
  code: string;
  clientId: string;
  clientSecret: string;
}) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  });

  if (!res.ok) {
    throw createError({
      status: 400,
      statusText: "Failed to retrieve GitHub token",
    });
  }

  const data = await res.json();
  return data.access_token as string | undefined;
}

async function fetchGitHubUser(token: string) {
  const [userRes, emailRes] = await Promise.all([
    fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
    }),
    fetch("https://api.github.com/user/emails", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
    }),
  ]);

  if (!userRes.ok) {
    throw createError({
      status: 400,
      statusText: "Failed to fetch GitHub profile",
    });
  }

  const profile = (await userRes.json()) as GitHubUser;

  if (!emailRes.ok) {
    throw createError({
      status: 400,
      statusText: "Failed to fetch GitHub email",
    });
  }

  const emails = (await emailRes.json()) as GitHubEmail[];
  const primaryEmail =
    profile.email ??
    emails.find((email) => email.primary && email.verified)?.email ??
    emails[0]?.email;

  if (!primaryEmail) {
    throw createError({
      status: 400,
      statusText: "Unable to determine GitHub email",
    });
  }

  return {
    githubId: profile.id.toString(),
    email: primaryEmail.toLowerCase(),
    name: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url,
  };
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const { code, state } = getQuery(event);

  if (
    typeof code !== "string" ||
    typeof state !== "string" ||
    !config.githubClientId ||
    !config.githubClientSecret
  ) {
    throw createError({
      status: 400,
      statusText: "Invalid GitHub OAuth payload",
    });
  }

  const storedState = getCookie(event, GITHUB_STATE_COOKIE);
  if (!storedState || storedState !== state) {
    throw createError({ status: 400, statusText: "Invalid OAuth state" });
  }
  deleteCookie(event, GITHUB_STATE_COOKIE, { path: "/" });

  const token = await fetchGitHubAccessToken({
    code,
    clientId: config.githubClientId,
    clientSecret: config.githubClientSecret,
  });

  if (!token) {
    throw createError({
      status: 400,
      statusText: "GitHub token not found",
    });
  }

  const profile = await fetchGitHubUser(token);

  let user = await prisma.user.findUnique({
    where: { githubId: profile.githubId },
  });

  if (!user) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (existingByEmail) {
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          githubId: profile.githubId,
          avatarUrl: profile.avatarUrl,
          name: existingByEmail.name ?? profile.name,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          githubId: profile.githubId,
          avatarUrl: profile.avatarUrl,
        },
      });
    }
  }

  await createAuthSession(event, user.id);

  return { ok: true };
});
