import assert from "node:assert/strict";
import test from "node:test";

import { renderPasswordResetEmail } from "../server/lib/email-templates.ts";

test("renders a reset link and its expiry without leaking unescaped markup", () => {
  const email = renderPasswordResetEmail({
    resetUrl: "https://crm.example/reset-password/token?next=<script>",
    expiresInMinutes: 30,
  });

  assert.match(email.html, /Reset password/);
  assert.match(email.html, /30 minutes/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.text, /https:\/\/crm\.example\/reset-password\/token/);
});
