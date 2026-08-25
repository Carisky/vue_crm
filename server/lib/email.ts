import type { H3Event } from "h3";
import { getRequestURL } from "h3";
import { TaskPriority, TaskStatus } from "@prisma/client";

import {
  renderTaskMediaUploadedEmail,
  renderTaskNotificationEmail,
} from "./email-templates";
import { enqueueEmail } from "./email-queue";
import {
  formatMediaSize,
  mediaDownloadPagePath,
} from "~/lib/task-media-presentation";

type EmailRecipient = {
  id: string;
  name: string | null;
  email: string;
  emailNotificationsEnabled?: boolean | null;
};

type ActorInfo = {
  name: string | null;
  email: string;
};

type TaskNotificationInput = {
  type: "TASK_CREATED" | "TASK_PRIORITY_ESCALATED";
  task: {
    id: string;
    name: string;
    status: TaskStatus;
    priority: TaskPriority;
    workspaceId: string;
  };
  project: { name: string | null } | null;
  workspace: { name: string };
  actor: ActorInfo;
  recipients: EmailRecipient[];
};

type TaskMediaUploadedInput = {
  task: {
    id: string;
    name: string;
    workspaceId: string;
  };
  project: { name: string | null } | null;
  workspace: { name: string };
  actor: ActorInfo;
  recipients: EmailRecipient[];
  media: Array<{
    id: string;
    originalName: string | null;
    size: number;
  }>;
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.VERY_LOW]: "Very low",
  [TaskPriority.LOW]: "Low",
  [TaskPriority.MEDIUM]: "Medium",
  [TaskPriority.HIGH]: "High",
  [TaskPriority.REAL_TIME]: "Real time",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.BACKLOG]: "Backlog",
  [TaskStatus.TODO]: "Todo",
  [TaskStatus.IN_PROGRESS]: "In progress",
  [TaskStatus.IN_REVIEW]: "In review",
  [TaskStatus.DONE]: "Done",
};

export function getTaskPriorityLabel(priority: TaskPriority) {
  return PRIORITY_LABELS[priority] ?? priority;
}

function getTaskStatusLabel(status: TaskStatus) {
  return STATUS_LABELS[status] ?? status;
}

function buildTaskUrl(
  siteUrl: string | undefined,
  workspaceId: string,
  taskId: string,
) {
  if (!siteUrl) return null;
  const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
  return `${baseUrl}/workspaces/${workspaceId}/tasks/${taskId}`;
}

export async function sendTaskNotificationEmails(
  event: H3Event,
  input: TaskNotificationInput,
) {
  const recipients = input.recipients.filter(
    (recipient) => recipient.emailNotificationsEnabled !== false,
  );

  if (!recipients.length) return;

  const config = useRuntimeConfig(event);
  const siteUrl = config.public.siteUrl as string | undefined;

  const actorName = input.actor.name ?? input.actor.email;
  const projectName = input.project?.name ?? "Workspace";
  const priorityLabel = getTaskPriorityLabel(input.task.priority);
  const statusLabel = getTaskStatusLabel(input.task.status);
  const taskUrl = buildTaskUrl(siteUrl, input.task.workspaceId, input.task.id);

  const subject =
    input.type === "TASK_CREATED"
      ? `New task: ${input.task.name}`
      : `Priority ${priorityLabel}: ${input.task.name}`;

  const message =
    input.type === "TASK_CREATED"
      ? `A new task was created in ${projectName}.`
      : `Priority was updated to ${priorityLabel}.`;

  const { html, text } = renderTaskNotificationEmail({
    title: subject,
    preheader: message,
    message,
    taskName: input.task.name,
    projectName,
    workspaceName: input.workspace.name,
    actorName,
    priorityLabel,
    statusLabel,
    taskUrl,
  });

  await Promise.all(
    recipients.map((recipient) =>
      enqueueEmail({
        userId: recipient.id,
        to: recipient.email,
        subject,
        html,
        text,
      }),
    ),
  );
}

export async function sendTaskMediaUploadedEmails(
  event: H3Event,
  input: TaskMediaUploadedInput,
) {
  const recipients = input.recipients.filter(
    (recipient) => recipient.emailNotificationsEnabled !== false,
  );
  if (!recipients.length || !input.media.length) return;

  const config = useRuntimeConfig(event);
  const configuredSiteUrl = config.public.siteUrl as string | undefined;
  const requestOrigin = getRequestURL(event, { xForwardedHost: true }).origin;
  const siteUrl = (configuredSiteUrl || requestOrigin).replace(/\/$/, "");
  const projectName = input.project?.name ?? "Workspace";
  const actorName = input.actor.name ?? input.actor.email;
  const fileCount = input.media.length;
  const subject =
    fileCount === 1
      ? `New file in task: ${input.task.name}`
      : `${fileCount} new files in task: ${input.task.name}`;
  const message =
    fileCount === 1
      ? `${actorName} uploaded a new file to ${projectName}.`
      : `${actorName} uploaded ${fileCount} new files to ${projectName}.`;
  const files = input.media.map((media) => ({
    name: media.originalName ?? "attachment",
    size: formatMediaSize(media.size),
    downloadUrl: `${siteUrl}${mediaDownloadPagePath(media.id)}`,
  }));
  const { html, text } = renderTaskMediaUploadedEmail({
    title: subject,
    preheader: message,
    message,
    taskName: input.task.name,
    projectName,
    workspaceName: input.workspace.name,
    actorName,
    files,
  });

  await Promise.all(
    recipients.map((recipient) =>
      enqueueEmail({
        userId: recipient.id,
        to: recipient.email,
        subject,
        html,
        text,
      }),
    ),
  );
}
