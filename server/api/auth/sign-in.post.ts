import { SignInSchema } from "~/lib/schema/auth";
import { createAuthSession } from "~/server/lib/auth";
import prisma from "~/server/lib/prisma";
import { verifyPassword } from "~/server/lib/password";

export default defineEventHandler(async (event) => {
  const params = await readValidatedBody(event, SignInSchema.safeParse);

  if (!params.success) {
    throw createError({ status: 400, statusText: "Invalid credentials" });
  }

  const email = params.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !(await verifyPassword(params.data.password, user.passwordHash))) {
    throw createError({ status: 400, statusText: "Invalid credentials" });
  }

  await createAuthSession(event, user.id);

  return { ok: true };
});
