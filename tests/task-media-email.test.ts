import assert from "node:assert/strict";
import test from "node:test";

import { renderTaskMediaUploadedEmail } from "../server/lib/email-templates.ts";

test("renders protected file links with task context and escaped file data", () => {
  const email = renderTaskMediaUploadedEmail({
    title: "New file in task: Migration",
    preheader: "A file was uploaded",
    message: "Alice uploaded a new file.",
    taskName: "Migration",
    projectName: "CRM",
    workspaceName: "IT",
    actorName: "Alice",
    files: [
      {
        name: "report <final>.pdf",
        size: "1.5 MB",
        downloadUrl: "https://collab.example/downloads/media%201?x=<script>",
      },
    ],
  });

  assert.match(email.html, /Migration/);
  assert.match(email.html, /CRM/);
  assert.match(email.html, /report &lt;final&gt;\.pdf/);
  assert.match(email.html, /https:\/\/collab\.example\/downloads\/media%201\?x=&lt;script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.text, /https:\/\/collab\.example\/downloads\/media%201/);
});
