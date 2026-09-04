import assert from "node:assert/strict";
import test from "node:test";
import {
  activateLinkedMattermostUser,
  activateLinkedMattermostUserWithRuntime,
  synchronizeMattermostCredentials,
  synchronizeMattermostCredentialsWithRuntime,
} from "../server/lib/mattermost/account-sync.ts";
import { MattermostRequestError } from "../server/lib/mattermost/client.ts";

function remoteUser(id = "mm-user-1") {
  return { id, email: "user@example.com", username: "user-abcdef1234" };
}

test("existing verified account gets the current CRM password and is active", async () => {
  const calls: unknown[] = [];
  const result = await synchronizeMattermostCredentials(
    {
      user: {
        id: "user-ABCDEF123456",
        email: "user@example.com",
        emailVerifiedAt: new Date("2026-09-04T06:00:00.000Z"),
      },
      password: "current password",
    },
    {
      client: {
        getUserByEmail: async () => remoteUser(),
        createUser: async () => {
          throw new Error("must not create an existing account");
        },
        setUserPassword: async (userId, password) => {
          calls.push(["password", userId, password]);
        },
        setUserActive: async (userId, active) => {
          calls.push(["active", userId, active]);
        },
      },
      saveSuccess: async (input) => {
        calls.push(["success", input]);
      },
      saveFailure: async () => {
        throw new Error("must not save failure");
      },
    },
  );

  assert.deepEqual(result, { ok: true, userId: "mm-user-1" });
  assert.deepEqual(calls, [
    ["password", "mm-user-1", "current password"],
    ["active", "mm-user-1", true],
    [
      "success",
      {
        userId: "user-ABCDEF123456",
        mattermostUserId: "mm-user-1",
        username: "user-abcdef1234",
      },
    ],
  ]);
});

test("missing unverified account is created then disabled", async () => {
  const calls: unknown[] = [];
  const result = await synchronizeMattermostCredentials(
    {
      user: {
        id: "user-ABCDEF123456",
        email: "user@example.com",
        emailVerifiedAt: null,
      },
      password: "registration password",
    },
    {
      client: {
        getUserByEmail: async () => null,
        createUser: async (input) => {
          calls.push(["create", input]);
          return remoteUser();
        },
        setUserPassword: async () => {
          throw new Error("create already supplied the password");
        },
        setUserActive: async (userId, active) => {
          calls.push(["active", userId, active]);
        },
      },
      saveSuccess: async (input) => {
        calls.push(["success", input]);
      },
      saveFailure: async () => {
        throw new Error("must not save failure");
      },
    },
  );

  assert.deepEqual(result, { ok: true, userId: "mm-user-1" });
  assert.deepEqual(calls[0], [
    "create",
    {
      email: "user@example.com",
      username: "user-abcdef1234",
      password: "registration password",
    },
  ]);
  assert.deepEqual(calls[1], ["active", "mm-user-1", false]);
});

test("Mattermost outage is non-fatal and failure persistence never receives a password", async () => {
  let failure: Record<string, unknown> | undefined;
  const result = await synchronizeMattermostCredentials(
    {
      user: {
        id: "user-ABCDEF123456",
        email: "user@example.com",
        emailVerifiedAt: new Date(),
      },
      password: "must-not-persist",
    },
    {
      client: {
        getUserByEmail: async () => {
          throw new MattermostRequestError("Mattermost GET failed", {
            retryable: true,
            status: 503,
          });
        },
        createUser: async () => remoteUser(),
        setUserPassword: async () => undefined,
        setUserActive: async () => undefined,
      },
      saveSuccess: async () => {
        throw new Error("must not save success");
      },
      saveFailure: async (input) => {
        failure = input;
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    retryable: true,
    message: "Mattermost synchronization is pending",
  });
  assert.deepEqual(Object.keys(failure ?? {}).sort(), [
    "message",
    "userId",
    "username",
  ]);
  assert.doesNotMatch(JSON.stringify(failure), /must-not-persist/);
});

test("email verification activates an existing linked account", async () => {
  const calls: unknown[] = [];
  const result = await activateLinkedMattermostUser("crm-user-1", {
    findLink: async () => ({
      mattermostUserId: "mm-user-1",
      username: "user-1",
    }),
    setUserActive: async (userId, active) => {
      calls.push([userId, active]);
    },
    saveSuccess: async (input) => {
      calls.push(input);
    },
    saveFailure: async () => {
      throw new Error("must not save failure");
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ["mm-user-1", true],
    {
      userId: "crm-user-1",
      mattermostUserId: "mm-user-1",
      username: "user-1",
    },
  ]);
});

test("disabled runtime synchronization returns immediately without database access", async () => {
  const result = await synchronizeMattermostCredentialsWithRuntime(
    {
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerifiedAt: new Date(),
      },
      password: "password",
    },
    { mattermostSyncEnabled: "false" },
  );

  assert.deepEqual(result, { ok: true });
});

test("runtime setup failure remains non-fatal to CRM authentication", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const result = await synchronizeMattermostCredentialsWithRuntime(
      {
        user: {
          id: "user-1",
          email: "user@example.com",
          emailVerifiedAt: new Date(),
        },
        password: "password",
      },
      {
        mattermostSyncEnabled: "true",
        mattermostInternalUrl: "http://127.0.0.1:8066",
      },
    );

    assert.deepEqual(result, {
      ok: false,
      retryable: true,
      message: "Mattermost synchronization is pending",
    });
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
});

test("runtime setup failure remains non-fatal to email verification", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const result = await activateLinkedMattermostUserWithRuntime("user-1", {
      mattermostSyncEnabled: "true",
      mattermostInternalUrl: "http://127.0.0.1:8066",
    });

    assert.deepEqual(result, {
      ok: false,
      retryable: true,
      message: "Mattermost synchronization is pending",
    });
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
});
