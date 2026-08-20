import * as z from "zod";

export const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const SignUpSchema = z.object({
  name: z.string().trim().min(1, "Required"),
  email: z.string().email(),
  password: z.string().min(8, "Minumum of 8 characters required"),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: z.string().min(8, "Minimum of 8 characters required"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
