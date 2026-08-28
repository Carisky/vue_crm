import assert from "node:assert/strict";
import test from "node:test";

import { requiresBasicAuth } from "../server/lib/basic-auth-policy.ts";

test("requires Basic Auth for the public domain", () => {
  assert.equal(
    requiresBasicAuth({
      hostname: "collab.tsl-silesia.com.pl",
      isTrustedInternalRequest: false,
    }),
    true,
  );
});

test("requires Basic Auth when the application is opened by public IP", () => {
  assert.equal(
    requiresBasicAuth({
      hostname: "85.11.79.242",
      isTrustedInternalRequest: false,
    }),
    true,
  );
});

test("bypasses Basic Auth only for a proxy-confirmed LAN request", () => {
  assert.equal(
    requiresBasicAuth({
      hostname: "collab.tsl-silesia.com.pl",
      isTrustedInternalRequest: true,
    }),
    false,
  );
});

test("keeps local development available without Basic Auth", () => {
  for (const hostname of ["localhost", "127.0.0.1", "::1"]) {
    assert.equal(
      requiresBasicAuth({
        hostname,
        isTrustedInternalRequest: false,
      }),
      false,
    );
  }
});

test("lets Telegram load only its signed Mini App and webhook routes", () => {
  for (const pathname of [
    "/telegram",
    "/api/telegram/webhook",
    "/api/telegram/mini/inbox",
    "/api/_nuxt_icon/v1/lucide.json",
  ]) {
    assert.equal(
      requiresBasicAuth({
        hostname: "collab.tsl-silesia.com.pl",
        isTrustedInternalRequest: false,
        pathname,
      }),
      false,
    );
  }

  assert.equal(
    requiresBasicAuth({
      hostname: "collab.tsl-silesia.com.pl",
      isTrustedInternalRequest: false,
      pathname: "/api/telegram/link",
    }),
    true,
  );
});
