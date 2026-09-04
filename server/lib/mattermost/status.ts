import type { PrismaClient } from "@prisma/client";
import type { MattermostClient } from "./client.ts";

type LinkCounts = {
  users: number;
  workspaces: number;
  conversations: number;
  messages: number;
};

type OutboxCounts = {
  PENDING: number;
  PROCESSING: number;
  COMPLETED: number;
  FAILED: number;
};

export type MattermostStatusState = {
  paused: boolean;
  pauseReason: string | null;
  lastBootstrapState: string | null;
  lastReconciledAt: Date | null;
  links: LinkCounts;
  outbox: OutboxCounts;
  oldestPendingAt: Date | null;
};

type StatusRepository = { load(): Promise<MattermostStatusState> };
type StatusHealth = {
  ping(): Promise<unknown>;
  pluginHealth(): Promise<{ version?: string }>;
};

function safeLabel(value: string | null) {
  return value?.split(/\r?\n/, 1)[0]?.trim().slice(0, 100) || null;
}

export async function getMattermostStatus(
  config: { enabled: boolean; configured: boolean },
  repository: StatusRepository,
  health: StatusHealth,
) {
  const state = await repository.load();
  const [ping, plugin] = await Promise.allSettled([
    health.ping(),
    health.pluginHealth(),
  ]);
  const pluginVersion =
    plugin.status === "fulfilled" && typeof plugin.value.version === "string"
      ? plugin.value.version
      : null;
  return {
    enabled: config.enabled,
    configured: config.configured,
    paused: state.paused,
    pauseReason: safeLabel(state.pauseReason),
    lastBootstrapState: safeLabel(state.lastBootstrapState),
    mattermost: { healthy: ping.status === "fulfilled" },
    plugin: {
      healthy: plugin.status === "fulfilled",
      version: pluginVersion,
    },
    links: state.links,
    outbox: state.outbox,
    oldestPendingAt: state.oldestPendingAt?.toISOString() ?? null,
    failedCount: state.outbox.FAILED,
    lastReconciledAt: state.lastReconciledAt?.toISOString() ?? null,
  };
}

export function createPrismaMattermostStatusRepository(database: PrismaClient) {
  return {
    async load(): Promise<MattermostStatusState> {
      const [
        control,
        users,
        workspaces,
        conversations,
        messages,
        grouped,
        oldest,
      ] = await Promise.all([
        database.mattermostSyncControl.findUnique({ where: { key: "global" } }),
        database.mattermostUserLink.count(),
        database.mattermostWorkspaceLink.count(),
        database.mattermostConversationLink.count(),
        database.mattermostMessageLink.count(),
        database.mattermostOutboxEvent.groupBy({
          by: ["state"],
          _count: { _all: true },
        }),
        database.mattermostOutboxEvent.findFirst({
          where: { state: { in: ["PENDING", "PROCESSING"] } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);
      const outbox: OutboxCounts = {
        PENDING: 0,
        PROCESSING: 0,
        COMPLETED: 0,
        FAILED: 0,
      };
      for (const row of grouped) outbox[row.state] = row._count._all;
      return {
        paused: Boolean(control?.pausedAt),
        pauseReason: control?.pauseReason ?? null,
        lastBootstrapState: control?.lastBootstrapState ?? null,
        lastReconciledAt: control?.lastReconciledAt ?? null,
        links: { users, workspaces, conversations, messages },
        outbox,
        oldestPendingAt: oldest?.createdAt ?? null,
      };
    },
  };
}

export async function getMattermostStatusWithRuntime() {
  const [{ default: prisma }, { getMattermostConfig, MattermostClient }] =
    await Promise.all([import("../prisma.ts"), import("./client.ts")]);
  const config = getMattermostConfig();
  const configured = Boolean(
    config.internalUrl &&
      config.pluginSecret &&
      (config.adminToken || config.adminTokenFile),
  );
  const client = new MattermostClient(config);
  return getMattermostStatus(
    { enabled: config.enabled, configured },
    createPrismaMattermostStatusRepository(prisma),
    {
      ping: () => client.getSystemPing(),
      pluginHealth: () => client.getPluginHealth(),
    },
  );
}
