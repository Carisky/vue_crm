import { ForgotPasswordSchema } from "~/lib/schema/auth";
import { requestPasswordResetEmail } from "~/server/lib/password-reset";

export default defineEventHandler(async (event) => {
  const params = await readValidatedBody(event, ForgotPasswordSchema.safeParse);
  if (!params.success) {
    throw createError({ status: 400, statusText: "Invalid email address" });
  }

  const config = useRuntimeConfig(event);
  const siteUrl = String(config.public.siteUrl ?? getRequestURL(event).origin);
  return requestPasswordResetEmail(params.data.email, siteUrl);
});
