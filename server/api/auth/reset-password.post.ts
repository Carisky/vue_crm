import { ResetPasswordSchema } from "~/lib/schema/auth";
import { applyPasswordReset } from "~/server/lib/password-reset";

export default defineEventHandler(async (event) => {
  const params = await readValidatedBody(event, ResetPasswordSchema.safeParse);
  if (!params.success) {
    throw createError({
      status: 400,
      statusText: params.error.issues[0]?.message ?? "Invalid password",
    });
  }

  const reset = await applyPasswordReset(
    params.data.token,
    params.data.password,
  );
  if (!reset) {
    throw createError({
      status: 400,
      statusText: "This password reset link is invalid or has expired",
    });
  }

  return { ok: true };
});
