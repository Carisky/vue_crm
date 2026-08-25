type TaskNotificationTemplateInput = {
  title: string;
  preheader: string;
  message: string;
  taskName: string;
  projectName: string;
  workspaceName: string;
  actorName: string;
  priorityLabel: string;
  statusLabel: string;
  taskUrl?: string | null;
};

type EmailVerificationTemplateInput = {
  verificationUrl: string;
  expiresInMinutes: number;
};

type PasswordResetTemplateInput = {
  resetUrl: string;
  expiresInMinutes: number;
};

type TaskMediaUploadedTemplateInput = {
  title: string;
  preheader: string;
  message: string;
  taskName: string;
  projectName: string;
  workspaceName: string;
  actorName: string;
  files: Array<{
    name: string;
    size: string;
    downloadUrl: string;
  }>;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function renderTaskNotificationEmail(input: TaskNotificationTemplateInput) {
  const title = escapeHtml(input.title);
  const preheader = escapeHtml(input.preheader);
  const message = escapeHtml(input.message);
  const taskName = escapeHtml(input.taskName);
  const projectName = escapeHtml(input.projectName);
  const workspaceName = escapeHtml(input.workspaceName);
  const actorName = escapeHtml(input.actorName);
  const priorityLabel = escapeHtml(input.priorityLabel);
  const statusLabel = escapeHtml(input.statusLabel);
  const taskUrl = input.taskUrl ? escapeHtml(input.taskUrl) : null;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f5f6f8;color:#111827;">
    <span style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:28px 28px 8px 28px;font-family:Arial, sans-serif;">
                <h1 style="margin:0 0 8px 0;font-size:20px;line-height:1.3;">${title}</h1>
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#4b5563;">${message}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 20px 28px;font-family:Arial, sans-serif;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#6b7280;width:140px;">Task</td>
                    <td style="padding:8px 0;font-size:13px;color:#111827;">${taskName}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#6b7280;">Project</td>
                    <td style="padding:8px 0;font-size:13px;color:#111827;">${projectName}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#6b7280;">Workspace</td>
                    <td style="padding:8px 0;font-size:13px;color:#111827;">${workspaceName}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#6b7280;">Priority</td>
                    <td style="padding:8px 0;font-size:13px;color:#111827;">${priorityLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#6b7280;">Status</td>
                    <td style="padding:8px 0;font-size:13px;color:#111827;">${statusLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#6b7280;">Actor</td>
                    <td style="padding:8px 0;font-size:13px;color:#111827;">${actorName}</td>
                  </tr>
                </table>
              </td>
            </tr>
            ${
              taskUrl
                ? `<tr>
              <td style="padding:0 28px 28px 28px;font-family:Arial, sans-serif;">
                <a href="${taskUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:13px;">
                  View task
                </a>
              </td>
            </tr>`
                : ""
            }
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;font-family:Arial, sans-serif;">
            You are receiving this because you enabled email notifications.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    input.title,
    input.message,
    "",
    `Task: ${input.taskName}`,
    `Project: ${input.projectName}`,
    `Workspace: ${input.workspaceName}`,
    `Priority: ${input.priorityLabel}`,
    `Status: ${input.statusLabel}`,
    `Actor: ${input.actorName}`,
  ];

  if (input.taskUrl) {
    textLines.push("", `Open task: ${input.taskUrl}`);
  }

  return {
    html,
    text: textLines.join("\n"),
  };
}

export function renderTaskMediaUploadedEmail(
  input: TaskMediaUploadedTemplateInput,
) {
  const title = escapeHtml(input.title);
  const preheader = escapeHtml(input.preheader);
  const message = escapeHtml(input.message);
  const taskName = escapeHtml(input.taskName);
  const projectName = escapeHtml(input.projectName);
  const workspaceName = escapeHtml(input.workspaceName);
  const actorName = escapeHtml(input.actorName);
  const fileRows = input.files
    .map((file) => {
      const name = escapeHtml(file.name);
      const size = escapeHtml(file.size);
      const downloadUrl = escapeHtml(file.downloadUrl);
      return `<tr>
        <td style="padding:10px 0;border-top:1px solid #e5e7eb;font-size:13px;color:#111827;word-break:break-word;">${name}<br /><span style="color:#6b7280;font-size:12px;">${size}</span></td>
        <td align="right" style="padding:10px 0 10px 16px;border-top:1px solid #e5e7eb;white-space:nowrap;">
          <a href="${downloadUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:8px 12px;border-radius:8px;font-size:12px;">Download</a>
        </td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f5f6f8;color:#111827;">
    <span style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;">
          <tr><td style="padding:28px 28px 12px;font-family:Arial,sans-serif;">
            <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;">${title}</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">${message}</p>
          </td></tr>
          <tr><td style="padding:0 28px 16px;font-family:Arial,sans-serif;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;width:120px;">Task</td><td style="padding:5px 0;font-size:13px;">${taskName}</td></tr>
              <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Project</td><td style="padding:5px 0;font-size:13px;">${projectName}</td></tr>
              <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Workspace</td><td style="padding:5px 0;font-size:13px;">${workspaceName}</td></tr>
              <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Uploaded by</td><td style="padding:5px 0;font-size:13px;">${actorName}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:0 28px 28px;font-family:Arial,sans-serif;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${fileRows}</table>
            <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">Downloads require an active Collab session. If needed, the link will ask you to sign in and will start the download afterwards.</p>
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">You are receiving this because you enabled email notifications.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    input.title,
    input.message,
    "",
    `Task: ${input.taskName}`,
    `Project: ${input.projectName}`,
    `Workspace: ${input.workspaceName}`,
    `Uploaded by: ${input.actorName}`,
    "",
    ...input.files.flatMap((file) => [
      `${file.name} (${file.size})`,
      file.downloadUrl,
      "",
    ]),
    "Downloads require an active Collab session.",
  ].join("\n");

  return { html, text };
}

export function renderEmailVerificationEmail(
  input: EmailVerificationTemplateInput,
) {
  const verificationUrl = escapeHtml(input.verificationUrl);
  const title = "Confirm your email address";
  const message = `Click the button below to confirm your email address. The link is valid for ${input.expiresInMinutes} minutes.`;

  return {
    html: `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#111827;padding:24px"><h1>${title}</h1><p>${message}</p><p><a href="${verificationUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Confirm email</a></p><p>If you did not create this account, ignore this email.</p></body></html>`,
    text: `${title}\n\n${message}\n\n${input.verificationUrl}\n\nIf you did not create this account, ignore this email.`,
  };
}

export function renderPasswordResetEmail(input: PasswordResetTemplateInput) {
  const resetUrl = escapeHtml(input.resetUrl);
  const title = "Reset password";
  const message = `Click the button below to choose a new password. The link is valid for ${input.expiresInMinutes} minutes.`;

  return {
    html: `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#111827;padding:24px"><h1>${title}</h1><p>${message}</p><p><a href="${resetUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Reset password</a></p><p>If you did not request a password reset, ignore this email. Your current password will remain unchanged.</p></body></html>`,
    text: `${title}\n\n${message}\n\n${input.resetUrl}\n\nIf you did not request a password reset, ignore this email. Your current password will remain unchanged.`,
  };
}
