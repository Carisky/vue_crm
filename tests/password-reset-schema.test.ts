import assert from "node:assert/strict";
import test from "node:test";

import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "../lib/schema/auth.ts";

test("accepts only a valid email for a password-reset request", () => {
  assert.equal(ForgotPasswordSchema.safeParse({ email: "invalid" }).success, false);
  assert.equal(
    ForgotPasswordSchema.safeParse({ email: "user@example.com" }).success,
    true,
  );
});

test("requires a token, an eight-character password, and matching confirmation", () => {
  assert.equal(
    ResetPasswordSchema.safeParse({
      token: "token",
      password: "password",
      confirmPassword: "different",
    }).success,
    false,
  );
  assert.equal(
    ResetPasswordSchema.safeParse({
      token: "token",
      password: "password",
      confirmPassword: "password",
    }).success,
    true,
  );
});
