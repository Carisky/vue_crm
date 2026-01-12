import { createEventStream } from "h3";

import {
  requireUser,
  requireWorkspaceMembership,
} from "~/server/lib/permissions";
import { registerTaskEventStream } from "~/server/lib/task-events";

const KEEPALIVE_INTERVAL_MS = 25_000;

export default defineEventHandler(async (event) => {
  requireUser(event);

  const { workspace_id } = getQuery(event);
  if (!workspace_id || typeof workspace_id !== "string") {
    throw createError({ status: 400, statusText: "Workspace ID required" });
  }

  await requireWorkspaceMembership(event, workspace_id);

  const stream = createEventStream(event);
  const unregister = registerTaskEventStream(workspace_id, stream);

  const sendPromise = stream.send();

  const keepAliveTimer = setInterval(() => {
    stream.push({ event: "ping", data: Date.now().toString() }).catch(() => {});
  }, KEEPALIVE_INTERVAL_MS);

  stream.onClosed(() => {
    clearInterval(keepAliveTimer);
    unregister();
  });

  await stream.push({ event: "connected", data: "ok" });
  await stream.push({ event: "ping", data: Date.now().toString() });
  return sendPromise;
});
