import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_RESET_TTL_MS,
  createPasswordResetSecret,
  requestPasswordReset,
  resetPassword,
} from "../server/lib/password-reset-service.ts";

test("creates a hashed password-reset token that expires after 30 minutes", () => {
  const now = new Date("2026-08-20T10:00:00.000Z");
  const secret = createPasswordResetSecret(now, () => Buffer.from("secret"));

  assert.equal(secret.token, Buffer.from("secret").toString("hex"));
  assert.notEqual(secret.tokenHash, secret.token);
  assert.equal(
    secret.expiresAt.getTime(),
    now.getTime() + PASSWORD_RESET_TTL_MS,
  );
});

test("returns the same public result when an email does not exist", async () => {
  let deliveries = 0;
  const result = await requestPasswordReset("missing@example.com", {
    findUserByEmail: async () => null,
    saveToken: async () => {
      throw new Error("must not create a token");
    },
    deliverResetLink: async () => {
      deliveries += 1;
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(deliveries, 0);
});

test("replaces the token and delivers a reset link for a password user", async () => {
  let savedUserId = "";
  let deliveredToken = "";
  const result = await requestPasswordReset("USER@example.com", {
    findUserByEmail: async (email) => {
      assert.equal(email, "user@example.com");
      return {
        id: "user-1",
        email: "user@example.com",
        passwordHash: "existing-hash",
      };
    },
    saveToken: async ({ userId }) => {
      savedUserId = userId;
    },
    deliverResetLink: async ({ token }) => {
      deliveredToken = token;
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(savedUserId, "user-1");
  assert.ok(deliveredToken.length >= 64);
});

test("rejects an expired reset token without changing the password", async () => {
  let committed = false;
  const result = await resetPassword("expired-token", "new password", {
    now: () => new Date("2026-08-20T11:00:00.000Z"),
    findToken: async () => ({
      id: "token-1",
      userId: "user-1",
      expiresAt: new Date("2026-08-20T10:59:59.000Z"),
    }),
    hashPassword: async () => "new-hash",
    commitPasswordReset: async () => {
      committed = true;
    },
  });

  assert.equal(result, false);
  assert.equal(committed, false);
});

test("changes the password and invalidates the token and all sessions atomically", async () => {
  let committed:
    | { userId: string; tokenId: string; passwordHash: string }
    | undefined;
  const result = await resetPassword("valid-token", "new password", {
    now: () => new Date("2026-08-20T10:00:00.000Z"),
    findToken: async () => ({
      id: "token-1",
      userId: "user-1",
      expiresAt: new Date("2026-08-20T10:01:00.000Z"),
    }),
    hashPassword: async (password) => {
      assert.equal(password, "new password");
      return "new-hash";
    },
    commitPasswordReset: async (input) => {
      committed = input;
    },
  });

  assert.equal(result, true);
  assert.deepEqual(committed, {
    userId: "user-1",
    tokenId: "token-1",
    passwordHash: "new-hash",
  });
});
