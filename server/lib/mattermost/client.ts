import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import type { PluginCreatePostRequest } from "./contracts.ts";
import { signMattermostRequest } from "./signature.ts";

export type MattermostUser = {
  id: string;
  email: string;
  username: string;
  delete_at?: number;
};

export type MattermostTeam = {
  id: string;
  name: string;
  display_name: string;
  delete_at?: number;
};

export type MattermostTeamMember = {
  team_id: string;
  user_id: string;
  roles: string;
};

export type MattermostChannel = {
  id: string;
  team_id: string;
  name: string;
  display_name: string;
  type: "O" | "P";
  delete_at?: number;
};

export type MattermostChannelMember = {
  channel_id: string;
  user_id: string;
  roles: string;
};

export type MattermostPost = {
  id: string;
  channel_id: string;
  user_id: string;
  message: string;
  create_at: number;
  props?: Record<string, unknown>;
};

export type MattermostPostPage = {
  order: string[];
  posts: Record<string, MattermostPost>;
};

export type MattermostChannelCreate = {
  team_id: string;
  name: string;
  display_name: string;
  type: "O" | "P";
  purpose?: string;
  header?: string;
};

export type MattermostChannelPatch = Partial<
  Pick<MattermostChannel, "name" | "display_name">
> & {
  purpose?: string;
  header?: string;
};

export type MattermostClientConfig = {
  internalUrl: string;
  adminToken?: string;
  adminTokenFile?: string;
  pluginSecret: string;
  pluginId: string;
  timeoutMs?: number;
};

type MattermostFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type MattermostClientDependencies = {
  fetch?: MattermostFetch;
  nonce?: () => string;
  now?: () => number;
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
};

type MattermostRequestOptions = {
  body?: unknown;
  notFoundAsNull?: boolean;
  plugin?: boolean;
};

export class MattermostRequestError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number },
  ) {
    super(message);
    this.name = "MattermostRequestError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function parseRuntimeToken(contents: string) {
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (
      separator < 0 ||
      line.slice(0, separator).trim() !== "MATTERMOST_ADMIN_TOKEN"
    ) {
      continue;
    }
    const value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

function segment(value: string) {
  return encodeURIComponent(value);
}

export class MattermostClient {
  private readonly config: MattermostClientConfig;
  private readonly fetcher: MattermostFetch;
  private readonly nonce: () => string;
  private readonly now: () => number;
  private readonly readRuntimeFile: (
    path: string,
    encoding: "utf8",
  ) => Promise<string>;

  constructor(
    config: MattermostClientConfig,
    dependencies: MattermostClientDependencies = {},
  ) {
    if (config.adminTokenFile && !isAbsolute(config.adminTokenFile)) {
      throw new Error("MATTERMOST_RUNTIME_ENV_FILE must be an absolute path");
    }
    this.config = {
      ...config,
      internalUrl: config.internalUrl.replace(/\/+$/g, ""),
      timeoutMs: config.timeoutMs ?? 5_000,
    };
    this.fetcher = dependencies.fetch ?? globalThis.fetch;
    this.nonce = dependencies.nonce ?? randomUUID;
    this.now = dependencies.now ?? Date.now;
    this.readRuntimeFile = dependencies.readFile ?? readFile;
  }

  private async adminToken() {
    if (this.config.adminTokenFile) {
      try {
        const token = parseRuntimeToken(
          await this.readRuntimeFile(this.config.adminTokenFile, "utf8"),
        );
        if (token) {
          return token;
        }
      } catch {
        // A not-yet-created runtime file may fall back to the process token.
      }
    }
    if (this.config.adminToken) {
      return this.config.adminToken;
    }
    throw new MattermostRequestError(
      "Mattermost administrator token is unavailable",
      {
        retryable: false,
      },
    );
  }

  private async request<T>(
    method: string,
    path: string,
    options: MattermostRequestOptions = {},
  ): Promise<T | null> {
    const body = options.body === undefined ? "" : JSON.stringify(options.body);
    const headers = new Headers({ Accept: "application/json" });
    if (body) {
      headers.set("content-type", "application/json");
    }

    if (options.plugin) {
      const timestamp = this.now();
      const nonce = this.nonce();
      headers.set("x-crm-timestamp", String(timestamp));
      headers.set("x-crm-nonce", nonce);
      headers.set(
        "x-crm-signature",
        signMattermostRequest({
          body,
          method,
          nonce,
          path,
          secret: this.config.pluginSecret,
          timestamp,
        }),
      );
    } else {
      headers.set("authorization", `Bearer ${await this.adminToken()}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error("Mattermost request timed out")),
      this.config.timeoutMs,
    );
    let response: Response;
    try {
      response = await this.fetcher(`${this.config.internalUrl}${path}`, {
        method,
        headers,
        body: body || undefined,
        signal: controller.signal,
      });
    } catch {
      throw new MattermostRequestError(
        `Mattermost ${method.toUpperCase()} ${path} failed before a response`,
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404 && options.notFoundAsNull) {
      return null;
    }
    if (!response.ok) {
      throw new MattermostRequestError(
        `Mattermost ${method.toUpperCase()} ${path} returned HTTP ${response.status}`,
        {
          retryable: retryableStatus(response.status),
          status: response.status,
        },
      );
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  getUserByEmail(email: string) {
    return this.request<MattermostUser>(
      "GET",
      `/api/v4/users/email/${segment(email)}`,
      { notFoundAsNull: true },
    );
  }

  createUser(input: { email: string; username: string; password: string }) {
    return this.request<MattermostUser>("POST", "/api/v4/users", {
      body: input,
    }) as Promise<MattermostUser>;
  }

  async setUserPassword(userId: string, password: string) {
    await this.request("PUT", `/api/v4/users/${segment(userId)}/password`, {
      body: { new_password: password },
    });
  }

  async setUserActive(userId: string, active: boolean) {
    await this.request("PUT", `/api/v4/users/${segment(userId)}/active`, {
      body: { active },
    });
  }

  getTeamByName(name: string) {
    return this.request<MattermostTeam>(
      `GET`,
      `/api/v4/teams/name/${segment(name)}`,
      {
        notFoundAsNull: true,
      },
    );
  }

  createTeam(input: { name: string; display_name: string }) {
    return this.request<MattermostTeam>("POST", "/api/v4/teams", {
      body: { ...input, type: "I" },
    }) as Promise<MattermostTeam>;
  }

  updateTeam(teamId: string, input: { display_name: string }) {
    return this.request<MattermostTeam>(
      "PUT",
      `/api/v4/teams/${segment(teamId)}/patch`,
      { body: input },
    ) as Promise<MattermostTeam>;
  }

  async deleteTeam(teamId: string) {
    await this.request("DELETE", `/api/v4/teams/${segment(teamId)}`);
  }

  async addTeamMember(teamId: string, userId: string) {
    await this.request("POST", `/api/v4/teams/${segment(teamId)}/members`, {
      body: { team_id: teamId, user_id: userId },
    });
  }

  async removeTeamMember(teamId: string, userId: string) {
    await this.request(
      "DELETE",
      `/api/v4/teams/${segment(teamId)}/members/${segment(userId)}`,
    );
  }

  async updateTeamMemberRoles(
    teamId: string,
    userId: string,
    roles: "team_user" | "team_user team_admin",
  ) {
    await this.request(
      "PUT",
      `/api/v4/teams/${segment(teamId)}/members/${segment(userId)}/roles`,
      { body: { roles } },
    );
  }

  getChannelByName(teamId: string, name: string) {
    return this.request<MattermostChannel>(
      "GET",
      `/api/v4/teams/${segment(teamId)}/channels/name/${segment(name)}`,
      { notFoundAsNull: true },
    );
  }

  createChannel(input: MattermostChannelCreate) {
    return this.request<MattermostChannel>("POST", "/api/v4/channels", {
      body: input,
    }) as Promise<MattermostChannel>;
  }

  patchChannel(channelId: string, input: MattermostChannelPatch) {
    return this.request<MattermostChannel>(
      "PUT",
      `/api/v4/channels/${segment(channelId)}/patch`,
      { body: input },
    ) as Promise<MattermostChannel>;
  }

  async deleteChannel(channelId: string) {
    await this.request("DELETE", `/api/v4/channels/${segment(channelId)}`);
  }

  async addChannelMember(channelId: string, userId: string) {
    await this.request(
      "POST",
      `/api/v4/channels/${segment(channelId)}/members`,
      {
        body: { user_id: userId },
      },
    );
  }

  async removeChannelMember(channelId: string, userId: string) {
    await this.request(
      "DELETE",
      `/api/v4/channels/${segment(channelId)}/members/${segment(userId)}`,
    );
  }

  createManagedPost(input: PluginCreatePostRequest) {
    return this.request<{ id: string }>(
      "POST",
      `/plugins/${segment(this.config.pluginId)}/api/v1/posts`,
      { body: input, plugin: true },
    ) as Promise<{ id: string }>;
  }

  async replaceManagedChannels(channelIds: string[]) {
    await this.request(
      "PUT",
      `/plugins/${segment(this.config.pluginId)}/api/v1/managed-channels`,
      { body: { channel_ids: channelIds }, plugin: true },
    );
  }

  getPluginHealth() {
    return this.request<{ id: string; version: string }>(
      "GET",
      `/plugins/${segment(this.config.pluginId)}/api/v1/health`,
      { plugin: true },
    ) as Promise<{ id: string; version: string }>;
  }

  getSystemPing() {
    return this.request<{ status: string }>(
      "GET",
      "/api/v4/system/ping",
    ) as Promise<{
      status: string;
    }>;
  }

  listUsers(page: number, perPage: number) {
    return this.request<MattermostUser[]>(
      "GET",
      `/api/v4/users?page=${page}&per_page=${perPage}`,
    ) as Promise<MattermostUser[]>;
  }

  listTeams(page: number, perPage: number) {
    return this.request<MattermostTeam[]>(
      "GET",
      `/api/v4/teams?page=${page}&per_page=${perPage}`,
    ) as Promise<MattermostTeam[]>;
  }

  listTeamMembers(teamId: string, page: number, perPage: number) {
    return this.request<MattermostTeamMember[]>(
      "GET",
      `/api/v4/teams/${segment(teamId)}/members?page=${page}&per_page=${perPage}`,
    ) as Promise<MattermostTeamMember[]>;
  }

  listChannelsForTeam(teamId: string, page: number, perPage: number) {
    return this.request<MattermostChannel[]>(
      "GET",
      `/api/v4/teams/${segment(teamId)}/channels?page=${page}&per_page=${perPage}`,
    ) as Promise<MattermostChannel[]>;
  }

  listPrivateChannelsForTeam(teamId: string, page: number, perPage: number) {
    return this.request<MattermostChannel[]>(
      "GET",
      `/api/v4/teams/${segment(teamId)}/channels/private?page=${page}&per_page=${perPage}`,
    ) as Promise<MattermostChannel[]>;
  }

  listChannelMembers(channelId: string, page: number, perPage: number) {
    return this.request<MattermostChannelMember[]>(
      "GET",
      `/api/v4/channels/${segment(channelId)}/members?page=${page}&per_page=${perPage}`,
    ) as Promise<MattermostChannelMember[]>;
  }

  listChannelPosts(channelId: string, page: number, perPage: number) {
    return this.request<MattermostPostPage>(
      "GET",
      `/api/v4/channels/${segment(channelId)}/posts?page=${page}&per_page=${perPage}`,
    ) as Promise<MattermostPostPage>;
  }
}

export function getMattermostConfig(
  source: Record<string, unknown> = process.env,
): MattermostClientConfig & { enabled: boolean; callbackUrl: string } {
  const value = (camel: string, environment: string) =>
    String(source[camel] ?? source[environment] ?? "");
  return {
    enabled:
      value("mattermostSyncEnabled", "MATTERMOST_SYNC_ENABLED") === "true",
    internalUrl: value("mattermostInternalUrl", "MATTERMOST_INTERNAL_URL"),
    adminToken:
      value("mattermostAdminToken", "MATTERMOST_ADMIN_TOKEN") || undefined,
    adminTokenFile:
      value("mattermostRuntimeEnvFile", "MATTERMOST_RUNTIME_ENV_FILE") ||
      undefined,
    pluginSecret: value("mattermostPluginSecret", "MATTERMOST_PLUGIN_SECRET"),
    pluginId:
      value("mattermostPluginId", "MATTERMOST_PLUGIN_ID") ||
      "com.tsl-silesia.crm-sync",
    callbackUrl: value("mattermostCallbackUrl", "MATTERMOST_CALLBACK_URL"),
  };
}
