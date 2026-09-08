export function parseForceAdminEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("FORCE_ADMINS must be a JSON array of email addresses.");
  }

  if (
    !Array.isArray(value) ||
    value.some((email) => typeof email !== "string")
  ) {
    throw new Error("FORCE_ADMINS must be a JSON array of email addresses.");
  }

  const emails = value.map((email) => email.trim().toLowerCase());
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("FORCE_ADMINS must be a JSON array of email addresses.");
  }

  return [...new Set(emails)];
}

export function getForceAdminEmails() {
  return parseForceAdminEmails(process.env.FORCE_ADMINS);
}

export function isForceAdminEmail(
  email: string,
  forceAdminEmails = getForceAdminEmails(),
) {
  return forceAdminEmails.includes(email.trim().toLowerCase());
}

type ForceAdminUser = { id: string; email: string };
type WorkspaceMembership = {
  userId: string;
  workspaceId: string;
  role: "ADMIN" | "MEMBER";
};

export type ForceAdminMembershipChange = {
  userId: string;
  workspaceId: string;
  kind: "create" | "promote";
};

export function planForceAdminMembershipChanges(input: {
  forceAdminEmails: string[];
  users: ForceAdminUser[];
  workspaceIds: string[];
  memberships: WorkspaceMembership[];
}): ForceAdminMembershipChange[] {
  const configuredEmails = new Set(
    input.forceAdminEmails.map((email) => email.trim().toLowerCase()),
  );
  const memberships = new Map(
    input.memberships.map((membership) => [
      `${membership.userId}:${membership.workspaceId}`,
      membership,
    ]),
  );
  const changes: ForceAdminMembershipChange[] = [];

  for (const user of input.users) {
    if (!configuredEmails.has(user.email.trim().toLowerCase())) continue;

    for (const workspaceId of input.workspaceIds) {
      const membership = memberships.get(`${user.id}:${workspaceId}`);
      if (membership?.role === "ADMIN") continue;
      changes.push({
        userId: user.id,
        workspaceId,
        kind: membership ? "promote" : "create",
      });
    }
  }

  return changes;
}
