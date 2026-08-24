import assert from "node:assert/strict";
import test from "node:test";

import {
  createMaintenanceServer,
  renderMaintenancePage,
} from "../scripts/maintenance-server.mjs";

test("renders a reassuring standalone maintenance page", () => {
  const page = renderMaintenancePage();

  assert.match(page, /TSL Silesia Collab/);
  assert.match(page, /We’ll be right back/);
  assert.match(page, /checks again automatically/);
  assert.match(page, /http-equiv="refresh" content="30"/);
});

test("serves maintenance responses without the Nuxt application", async (context) => {
  const server = createMaintenanceServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;

  const pageResponse = await fetch(origin);
  assert.equal(pageResponse.status, 503);
  assert.equal(pageResponse.headers.get("retry-after"), "60");
  assert.match(await pageResponse.text(), /Scheduled maintenance/);

  const healthResponse = await fetch(`${origin}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: "maintenance" });
});
