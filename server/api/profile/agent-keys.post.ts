import * as z from "zod";

import { createAgentApiKey, serializeAgentApiKey } from "~/server/lib/agent-api-key";
import { requireUser } from "~/server/lib/permissions";

const schema = z.object({ name: z.string().trim().min(1).max(80) }).strict();

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ status: 400, statusText: parsed.error.message });
  }

  const { key, token } = await createAgentApiKey(user.id, parsed.data.name);
  return { key: serializeAgentApiKey(key), token };
});
