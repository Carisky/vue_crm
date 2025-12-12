import { destroyAuthSession } from "~/server/lib/auth";

export default defineEventHandler(async (event) => {
  await destroyAuthSession(event);

  await sendRedirect(event, "/sign-in");
});
