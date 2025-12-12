import { SignUpSchema } from "~/lib/schema/auth";
import prisma from "~/server/lib/prisma";
import { createAuthSession } from "~/server/lib/auth";
import { hashPassword } from "~/server/lib/password";

export default defineEventHandler(async (event) => {
  const params = await readValidatedBody(event, SignUpSchema.safeParse);

  if (!params.success) {
    throw createError({ status: 400, statusText: "Invalid credentials" });
  }

  const email = params.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw createError({
      status: 400,
      statusText: "Email already in use",
    });
  }

  const user = await prisma.user.create({
    data: {
      name: params.data.name,
      email,
      passwordHash: await hashPassword(params.data.password),
    },
  });

  await createAuthSession(event, user.id);

  return { ok: true };
});
