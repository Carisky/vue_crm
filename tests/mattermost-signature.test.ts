import assert from "node:assert/strict";
import test from "node:test";
import {
  signMattermostRequest,
  verifyMattermostRequest,
} from "../server/lib/mattermost/signature.ts";

const vector = {
  body: '{"event_id":"evt-1"}',
  method: "POST",
  nonce: "nonce-1",
  path: "/api/integrations/mattermost/events",
  secret: "test-secret",
  timestamp: 1_788_451_200_000,
};

const expectedSignature =
  "ae1f4dd66916406ce4a2b860d9aec6be2ace64832c50345eddea4617a335fbfd";

test("Mattermost signing follows the shared canonical vector", () => {
  assert.equal(signMattermostRequest(vector), expectedSignature);
});

test("Mattermost verification accepts a fresh signature and atomically claims its nonce", async () => {
  const claims: Array<{ nonce: string; expiresAt: number }> = [];
  const verified = await verifyMattermostRequest(
    { ...vector, signature: expectedSignature },
    {
      now: vector.timestamp + 1_000,
      claimNonce: async (nonce, expiresAt) => {
        claims.push({ nonce, expiresAt });
        return true;
      },
    },
  );

  assert.equal(verified, true);
  assert.deepEqual(claims, [
    { nonce: "nonce-1", expiresAt: vector.timestamp + 300_000 },
  ]);
});

test("Mattermost verification rejects changed, stale, malformed, and replayed requests", async () => {
  const options = {
    now: vector.timestamp,
    claimNonce: async () => true,
  };

  assert.equal(
    await verifyMattermostRequest(
      { ...vector, body: '{"event_id":"evt-2"}', signature: expectedSignature },
      options,
    ),
    false,
  );
  assert.equal(
    await verifyMattermostRequest(
      { ...vector, signature: expectedSignature },
      { ...options, now: vector.timestamp + 300_001 },
    ),
    false,
  );
  assert.equal(
    await verifyMattermostRequest({ ...vector, signature: "not-hex" }, options),
    false,
  );
  assert.equal(
    await verifyMattermostRequest(
      { ...vector, signature: expectedSignature },
      { ...options, claimNonce: async () => false },
    ),
    false,
  );
});
