import type { MattermostUser } from "./client.ts";
import {
  getMattermostConfig,
  MattermostClient,
  MattermostRequestError,
} from "./client.ts";
import type { MattermostSyncResult } from "./contracts.ts";
import { mattermostUsername } from "./identifiers.ts";

export type CredentialSyncInput = {
  user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
  };
  password: string;
};

type LinkedUser = {
  mattermostUserId: string;
  username: string;
};

type SaveSuccessInput = {
  userId: string;
  mattermostUserId: string;
  username: string;
};

type SaveFailureInput = {
  userId: string;
  username: string;
  message: string;
};

export type AccountSyncDeps = {
  client: Pick<
    MattermostClient,
    "getUserByEmail" | "createUser" | "setUserPassword" | "setUserActive"
  >;
  saveSuccess(input: SaveSuccessInput): Promise<void>;
  saveFailure(input: SaveFailureInput): Promise<void>;
};

export type AccountActivationDeps = {
  findLink(userId: string): Promise<LinkedUser | null>;
  setUserActive(userId: string, active: boolean): Promise<void>;
  saveSuccess(input: SaveSuccessInput): Promise<void>;
  saveFailure(input: SaveFailureInput): Promise<void>;
};

function safeFailureMessage(error: unknown) {
  return error instanceof MattermostRequestError
    ? error.message.slice(0, 1_000)
    : "Mattermost synchronization failed before completion";
}

function retryableFailure(error: unknown) {
  return error instanceof MattermostRequestError ? error.retryable : true;
}

async function persistFailure(
  saveFailure: (input: SaveFailureInput) => Promise<void>,
  input: SaveFailureInput,
) {
  try {
    await saveFailure(input);
  } catch {
    // Authentication must remain available even if status persistence fails.
  }
}

export async function synchronizeMattermostCredentials(
  input: CredentialSyncInput,
  dependencies: AccountSyncDeps,
): Promise<MattermostSyncResult> {
  const username = mattermostUsername(input.user.id, input.user.email);
  try {
    let mattermostUser: MattermostUser | null =
      await dependencies.client.getUserByEmail(input.user.email);
    if (mattermostUser) {
      await dependencies.client.setUserPassword(
        mattermostUser.id,
        input.password,
      );
    } else {
      mattermostUser = await dependencies.client.createUser({
        email: input.user.email,
        username,
        password: input.password,
      });
    }
    await dependencies.client.setUserActive(
      mattermostUser.id,
      input.user.emailVerifiedAt !== null,
    );
    await dependencies.saveSuccess({
      userId: input.user.id,
      mattermostUserId: mattermostUser.id,
      username,
    });
    return { ok: true, userId: mattermostUser.id };
  } catch (error) {
    await persistFailure(dependencies.saveFailure, {
      userId: input.user.id,
      username,
      message: safeFailureMessage(error),
    });
    return {
      ok: false,
      retryable: retryableFailure(error),
      message: "Mattermost synchronization is pending",
    };
  }
}

export async function activateLinkedMattermostUser(
  userId: string,
  dependencies: AccountActivationDeps,
): Promise<MattermostSyncResult> {
  const link = await dependencies.findLink(userId);
  if (!link) {
    return {
      ok: false,
      retryable: true,
      message: "Mattermost synchronization is pending",
    };
  }
  try {
    await dependencies.setUserActive(link.mattermostUserId, true);
    await dependencies.saveSuccess({ userId, ...link });
    return { ok: true, userId: link.mattermostUserId };
  } catch (error) {
    await persistFailure(dependencies.saveFailure, {
      userId,
      username: link.username,
      message: safeFailureMessage(error),
    });
    return {
      ok: false,
      retryable: retryableFailure(error),
      message: "Mattermost synchronization is pending",
    };
  }
}

async function runtimeAccountDependencies(source: Record<string, unknown>) {
  const config = getMattermostConfig(source);
  if (!config.enabled) {
    return null;
  }
  const { default: prisma } = await import("../prisma.ts");
  const client = new MattermostClient(config);
  const saveSuccess = async (input: SaveSuccessInput) => {
    const now = new Date();
    await prisma.mattermostUserLink.upsert({
      where: { userId: input.userId },
      create: {
        ...input,
        syncState: "SYNCED",
        lastSyncedAt: now,
      },
      update: {
        mattermostUserId: input.mattermostUserId,
        username: input.username,
        syncState: "SYNCED",
        lastError: null,
        lastSyncedAt: now,
      },
    });
  };
  const saveFailure = async (input: SaveFailureInput) => {
    await prisma.mattermostUserLink.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        username: input.username,
        syncState: "FAILED",
        lastError: input.message,
      },
      update: {
        username: input.username,
        syncState: "FAILED",
        lastError: input.message,
      },
    });
  };
  return { client, prisma, saveFailure, saveSuccess };
}

export async function synchronizeMattermostCredentialsWithRuntime(
  input: CredentialSyncInput,
  source: Record<string, unknown>,
) {
  try {
    const runtime = await runtimeAccountDependencies(source);
    if (!runtime) {
      return { ok: true } as const;
    }
    return synchronizeMattermostCredentials(input, runtime);
  } catch {
    return {
      ok: false,
      retryable: true,
      message: "Mattermost synchronization is pending",
    } as const;
  }
}

export async function activateLinkedMattermostUserWithRuntime(
  userId: string,
  source: Record<string, unknown>,
) {
  try {
    const runtime = await runtimeAccountDependencies(source);
    if (!runtime) {
      return { ok: true } as const;
    }
    return activateLinkedMattermostUser(userId, {
      findLink: async (id) => {
        const link = await runtime.prisma.mattermostUserLink.findUnique({
          where: { userId: id },
          select: { mattermostUserId: true, username: true },
        });
        return link?.mattermostUserId
          ? {
              mattermostUserId: link.mattermostUserId,
              username: link.username,
            }
          : null;
      },
      setUserActive: (id, active) => runtime.client.setUserActive(id, active),
      saveFailure: runtime.saveFailure,
      saveSuccess: runtime.saveSuccess,
    });
  } catch {
    return {
      ok: false,
      retryable: true,
      message: "Mattermost synchronization is pending",
    } as const;
  }
}
