import { updateTask } from "~/server/lib/tasks";
import { requireUser } from "~/server/lib/permissions";

export default defineEventHandler(async (event) => {
  requireUser(event);

  const payload = await readBody<{ id: string; data: unknown }[]>(event);
  if (!Array.isArray(payload)) {
    throw createError({ status: 400, statusText: "Invalid payload" });
  }

  const results = await Promise.all(
    payload.map(({ id, data }) =>
      updateTask(event, id, data, { skipErrors: true }).then((task) =>
        Boolean(task),
      ),
    ),
  );

  return { ok: results.some(Boolean) };
});
