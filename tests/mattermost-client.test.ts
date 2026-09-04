import assert from "node:assert/strict";
import test from "node:test";
import {
  getMattermostConfig,
  MattermostClient,
  MattermostRequestError,
} from "../server/lib/mattermost/client.ts";

const baseConfig = {
  adminToken: "fallback-token",
  adminTokenFile: "C:\\run\\secrets\\mattermost.env",
  internalUrl: "http://127.0.0.1:8066",
  pluginId: "com.tsl-silesia.crm-sync",
  pluginSecret: "plugin-secret",
  timeoutMs: 1_000,
};

test("admin requests encode path values and reload the runtime token", async () => {
  const authorizations: string[] = [];
  const urls: string[] = [];
  let runtimeToken = "runtime-token-1";
  const client = new MattermostClient(baseConfig, {
    readFile: async () => `MATTERMOST_ADMIN_TOKEN=${runtimeToken}\n`,
    fetch: async (input, init) => {
      urls.push(String(input));
      authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      assert.ok(init?.signal instanceof AbortSignal);
      return Response.json({ id: "user-1", email: "a+b@example.com", username: "a-b" });
    },
  });

  await client.getUserByEmail("a+b@example.com");
  runtimeToken = "runtime-token-2";
  await client.getUserByEmail("a+b@example.com");

  assert.deepEqual(urls, [
    "http://127.0.0.1:8066/api/v4/users/email/a%2Bb%40example.com",
    "http://127.0.0.1:8066/api/v4/users/email/a%2Bb%40example.com",
  ]);
  assert.deepEqual(authorizations, [
    "Bearer runtime-token-1",
    "Bearer runtime-token-2",
  ]);
});

test("admin lookup maps 404 to null", async () => {
  const client = new MattermostClient(
    { ...baseConfig, adminTokenFile: undefined },
    { fetch: async () => new Response(null, { status: 404 }) },
  );

  assert.equal(await client.getTeamByName("missing-team"), null);
});

test("request errors classify retries without exposing response secrets", async () => {
  const retryable = new MattermostClient(
    { ...baseConfig, adminTokenFile: undefined },
    {
      fetch: async () =>
        Response.json(
          { message: "fallback-token must never escape" },
          { status: 503 },
        ),
    },
  );

  await assert.rejects(retryable.createTeam({ name: "team", display_name: "Team" }), (error) => {
    assert.ok(error instanceof MattermostRequestError);
    assert.equal(error.status, 503);
    assert.equal(error.retryable, true);
    assert.doesNotMatch(error.message, /fallback-token/);
    return true;
  });

  const terminal = new MattermostClient(
    { ...baseConfig, adminTokenFile: undefined },
    { fetch: async () => new Response(null, { status: 401 }) },
  );
  await assert.rejects(terminal.getUserByEmail("user@example.com"), (error) => {
    assert.ok(error instanceof MattermostRequestError);
    assert.equal(error.retryable, false);
    return true;
  });
});

test("request timeout aborts the fetch and remains retryable", async () => {
  const client = new MattermostClient(
    { ...baseConfig, adminTokenFile: undefined, timeoutMs: 5 },
    {
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    },
  );

  await assert.rejects(client.listUsers(0, 50), (error) => {
    assert.ok(error instanceof MattermostRequestError);
    assert.equal(error.retryable, true);
    assert.equal(error.status, undefined);
    return true;
  });
});

test("plugin retries retain event identity but use fresh signed nonces", async () => {
  const requests: Array<{ body: string; headers: Headers }> = [];
  const nonces = ["nonce-a", "nonce-b"];
  const times = [1_000, 2_000];
  const client = new MattermostClient(baseConfig, {
    nonce: () => nonces.shift() ?? "unexpected",
    now: () => times.shift() ?? 0,
    fetch: async (_input, init) => {
      requests.push({
        body: String(init?.body),
        headers: new Headers(init?.headers),
      });
      return Response.json({ id: "post-1" });
    },
  });
  const input = {
    event_id: "evt-1",
    crm_message_id: "msg-1",
    mattermost_channel_id: "channel-1",
    mattermost_user_id: "user-1",
    message: "hello",
  };

  await client.createManagedPost(input);
  await client.createManagedPost(input);

  assert.deepEqual(requests.map(({ body }) => JSON.parse(body).event_id), ["evt-1", "evt-1"]);
  assert.deepEqual(requests.map(({ headers }) => headers.get("x-crm-nonce")), [
    "nonce-a",
    "nonce-b",
  ]);
  assert.deepEqual(requests.map(({ headers }) => headers.get("x-crm-signature")), [
    "b57e7606999717594945a60f691cc4faec221ee041a3ff6110846ae0c0c480c0",
    "5ea8f9fc73d6ead40f75cbe4a55643e13fa48614181e33ce7ae4114809deb9a2",
  ]);
});

test("runtime token file must be absolute", () => {
  assert.throws(
    () => new MattermostClient({ ...baseConfig, adminTokenFile: ".env.runtime" }),
    /absolute/,
  );
});

test("Mattermost client maps managed operations to their private API contracts", async () => {
  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  const client = new MattermostClient(
    { ...baseConfig, adminTokenFile: undefined },
    {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push({
          method: init?.method ?? "GET",
          path: `${url.pathname}${url.search}`,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return Response.json({});
      },
    },
  );

  await client.createUser({ email: "u@example.com", username: "user", password: "pw" });
  await client.setUserPassword("u1", "next");
  await client.setUserActive("u1", true);
  await client.updateTeam("t1", { display_name: "Renamed" });
  await client.deleteTeam("t1");
  await client.addTeamMember("t1", "u1");
  await client.removeTeamMember("t1", "u1");
  await client.updateTeamMemberRoles("t1", "u1", "team_user team_admin");
  await client.getChannelByName("t1", "private room");
  await client.createChannel({
    team_id: "t1",
    name: "room",
    display_name: "Room",
    type: "P",
  });
  await client.patchChannel("c1", { display_name: "Renamed room" });
  await client.deleteChannel("c1");
  await client.addChannelMember("c1", "u1");
  await client.removeChannelMember("c1", "u1");
  await client.replaceManagedChannels(["c1"]);
  await client.getPluginHealth();
  await client.listTeams(1, 25);
  await client.listTeamMembers("t1", 1, 25);
  await client.listChannelsForTeam("t1", 1, 25);
  await client.listPrivateChannelsForTeam("t1", 1, 25);
  await client.listChannelMembers("c1", 1, 25);
  await client.listChannelPosts("c1", 1, 25);

  assert.deepEqual(requests, [
    { method: "POST", path: "/api/v4/users", body: { email: "u@example.com", username: "user", password: "pw" } },
    { method: "PUT", path: "/api/v4/users/u1/password", body: { new_password: "next" } },
    { method: "PUT", path: "/api/v4/users/u1/active", body: { active: true } },
    { method: "PUT", path: "/api/v4/teams/t1/patch", body: { display_name: "Renamed" } },
    { method: "DELETE", path: "/api/v4/teams/t1", body: undefined },
    { method: "POST", path: "/api/v4/teams/t1/members", body: { team_id: "t1", user_id: "u1" } },
    { method: "DELETE", path: "/api/v4/teams/t1/members/u1", body: undefined },
    { method: "PUT", path: "/api/v4/teams/t1/members/u1/roles", body: { roles: "team_user team_admin" } },
    { method: "GET", path: "/api/v4/teams/t1/channels/name/private%20room", body: undefined },
    { method: "POST", path: "/api/v4/channels", body: { team_id: "t1", name: "room", display_name: "Room", type: "P" } },
    { method: "PUT", path: "/api/v4/channels/c1/patch", body: { display_name: "Renamed room" } },
    { method: "DELETE", path: "/api/v4/channels/c1", body: undefined },
    { method: "POST", path: "/api/v4/channels/c1/members", body: { user_id: "u1" } },
    { method: "DELETE", path: "/api/v4/channels/c1/members/u1", body: undefined },
    { method: "PUT", path: "/plugins/com.tsl-silesia.crm-sync/api/v1/managed-channels", body: { channel_ids: ["c1"] } },
    { method: "GET", path: "/plugins/com.tsl-silesia.crm-sync/api/v1/health", body: undefined },
    { method: "GET", path: "/api/v4/teams?page=1&per_page=25", body: undefined },
    { method: "GET", path: "/api/v4/teams/t1/members?page=1&per_page=25", body: undefined },
    { method: "GET", path: "/api/v4/teams/t1/channels?page=1&per_page=25", body: undefined },
    { method: "GET", path: "/api/v4/teams/t1/channels/private?page=1&per_page=25", body: undefined },
    { method: "GET", path: "/api/v4/channels/c1/members?page=1&per_page=25", body: undefined },
    { method: "GET", path: "/api/v4/channels/c1/posts?page=1&per_page=25", body: undefined },
  ]);
});

test("Mattermost config remains disabled unless explicitly enabled", () => {
  const config = getMattermostConfig({
    MATTERMOST_INTERNAL_URL: "http://127.0.0.1:8066",
    MATTERMOST_ADMIN_TOKEN: "admin",
    MATTERMOST_PLUGIN_SECRET: "secret",
    MATTERMOST_SYNC_ENABLED: "TRUE",
    MATTERMOST_CALLBACK_URL: "http://127.0.0.1:3000/api/integrations/mattermost/events",
  });

  assert.equal(config.enabled, false);
  assert.equal(config.internalUrl, "http://127.0.0.1:8066");
  assert.equal(config.pluginId, "com.tsl-silesia.crm-sync");
  assert.equal(
    config.callbackUrl,
    "http://127.0.0.1:3000/api/integrations/mattermost/events",
  );
});
