import { updateTask } from "~/server/lib/tasks";
import { requireUser } from "~/server/lib/permissions";
import { serializeTask } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  requireUser(event);
  const { taskId } = getRouterParams(event);

  const updatedTask = await updateTask(event, taskId, await readBody(event));

  return { task: updatedTask ? serializeTask(updatedTask) : null };
});
