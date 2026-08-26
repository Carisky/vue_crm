import type {
  ConversationMessage,
  ConversationParticipant,
  Member,
  Project,
  Task,
  TaskComment,
  TaskCommentMention,
  TaskMedia,
  TaskMediaVariant,
  User,
  Workspace,
  WorkspaceGroup,
} from "@prisma/client";

import { mediaKindFromMime, type MediaKind } from "./storage/file-policy.ts";

export function serializeWorkspace(workspace: Workspace) {
  return {
    $id: workspace.id,
    name: workspace.name,
    invite_code: workspace.inviteCode,
    image_url: workspace.imageUrl,
    user_id: workspace.ownerId,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

type SerializedProgress = {
  completed: number;
  total: number;
  percent: number;
};

const emptyProgress: SerializedProgress = {
  completed: 0,
  total: 0,
  percent: 0,
};

export function serializeProject(
  project: Project,
  progress: SerializedProgress = emptyProgress,
) {
  return {
    $id: project.id,
    name: project.name,
    image_url: project.imageUrl,
    workspace_id: project.workspaceId,
    parent_id: project.parentId,
    progress: progress.percent,
    completed_tasks: progress.completed,
    total_tasks: progress.total,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function serializeTaskMediaVariant(variant: TaskMediaVariant) {
  return {
    id: variant.id,
    mime: variant.mime ?? "application/octet-stream",
    size: variant.size,
    resolution: variant.resolution,
  };
}

function safeMediaKind(mime: string): MediaKind {
  try {
    return mediaKindFromMime(mime);
  } catch {
    return "document";
  }
}

export function serializeTaskMedia(
  media: TaskMedia & { variants?: TaskMediaVariant[] },
) {
  const mime = media.mime ?? "application/octet-stream";
  return {
    id: media.id,
    name: media.originalName ?? "attachment",
    mime,
    size: media.size,
    kind: safeMediaKind(mime),
    resolution: media.resolution,
    variants: (media.variants ?? []).map(serializeTaskMediaVariant),
  };
}

export function serializeTask(
  task: Task & {
    project?: Project | null;
    assignee?: User | null;
    assigneeGroup?:
      | (WorkspaceGroup & { members?: { userId: string }[] })
      | null;
    media?: (TaskMedia & { variants?: TaskMediaVariant[] })[] | null;
  },
  progress?: SerializedProgress,
) {
  const taskProgress = progress ?? {
    completed: task.status === "DONE" ? 1 : 0,
    total: 1,
    percent: task.status === "DONE" ? 100 : 0,
  };
  return {
    $id: task.id,
    name: task.name,
    workspace_id: task.workspaceId,
    project_id: task.projectId,
    parent_id: task.parentId,
    assignee_id: task.assigneeId,
    assignee_group_id: task.assigneeGroupId,
    status: task.status,
    priority: task.priority,
    due_date: task.dueDate,
    description: task.description,
    position: task.position,
    progress: taskProgress.percent,
    completed_subtasks: taskProgress.completed,
    total_subtasks: taskProgress.total,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    project: task.project ? serializeProject(task.project) : null,
    assignee: task.assignee
      ? {
          $id: task.assignee.id,
          name: task.assignee.name,
          email: task.assignee.email,
        }
      : null,
    assignee_group: task.assigneeGroup
      ? {
          $id: task.assigneeGroup.id,
          name: task.assigneeGroup.name,
          color: task.assigneeGroup.color,
          member_ids: (task.assigneeGroup.members ?? []).map(
            (member) => member.userId,
          ),
        }
      : null,
    started_at: task.startedAt ? task.startedAt.toISOString() : null,
    media: task.media ? task.media.map(serializeTaskMedia) : [],
  };
}

export function serializeMember(
  membership: Member & { user: User },
  ownerId: string,
) {
  return {
    $id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    membership_id: membership.id,
    role: membership.role === "ADMIN" ? "admin" : "member",
    is_owner: membership.userId === ownerId,
  };
}

export function serializeWorkspaceGroup(
  group: WorkspaceGroup & {
    members?: { user: User }[];
    conversation?: { id: string } | null;
  },
) {
  return {
    $id: group.id,
    workspace_id: group.workspaceId,
    name: group.name,
    description: group.description,
    color: group.color,
    conversation_id: group.conversation?.id ?? null,
    members: (group.members ?? []).map((member) =>
      serializeWorkspaceUser(member.user),
    ),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export function serializeWorkspaceUser(user: User) {
  return {
    $id: user.id,
    name: user.name,
    email: user.email,
    avatar_url: user.avatarUrl,
  };
}

export function serializeTaskComment(
  comment: TaskComment & {
    author: User;
    mentions?: (TaskCommentMention & { user: User })[] | null;
  },
) {
  return {
    $id: comment.id,
    task_id: comment.taskId,
    workspace_id: comment.workspaceId,
    body: comment.body,
    author: serializeWorkspaceUser(comment.author),
    mentions: (comment.mentions ?? []).map((mention) =>
      serializeWorkspaceUser(mention.user),
    ),
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export function serializeConversationParticipant(
  participant: ConversationParticipant & { user: User },
) {
  return {
    user: serializeWorkspaceUser(participant.user),
    lastReadAt: participant.lastReadAt
      ? participant.lastReadAt.toISOString()
      : null,
  };
}

export function serializeConversationMessage(
  message: ConversationMessage & { sender: User },
) {
  return {
    id: message.id,
    conversation_id: message.conversationId,
    sender: serializeWorkspaceUser(message.sender),
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}
