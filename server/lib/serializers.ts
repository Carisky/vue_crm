import type {
  ConversationMessage,
  ConversationParticipant,
  Member,
  Project,
  Task,
  TaskComment,
  TaskCommentMention,
  TaskMedia,
  User,
  Workspace,
} from "@prisma/client";

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

export function serializeProject(project: Project) {
  return {
    $id: project.id,
    name: project.name,
    image_url: project.imageUrl,
    workspace_id: project.workspaceId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function serializeTaskMedia(media: TaskMedia) {
  return {
    id: media.id,
    path: media.path,
    mime: media.mime,
    original_name: media.originalName,
  };
}

export function serializeTask(
  task: Task & {
    project?: Project | null;
    assignee?: User | null;
    media?: TaskMedia[] | null;
  },
) {
  return {
    $id: task.id,
    name: task.name,
    workspace_id: task.workspaceId,
    project_id: task.projectId,
    assignee_id: task.assigneeId,
    status: task.status,
    priority: task.priority,
    due_date: task.dueDate,
    description: task.description,
    position: task.position,
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
    estimated_hours: task.estimatedHours,
    actual_hours: task.actualHours,
    started_at: task.startedAt ? task.startedAt.toISOString() : null,
    media: task.media ? task.media.map(serializeTaskMedia) : [],
  };
}

export function serializeMember(
  membership: Member & { user: User },
  ownerId: string,
  actualHours?: number | null,
) {
  return {
    $id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    membership_id: membership.id,
    role: membership.role === "ADMIN" ? "admin" : "member",
    is_owner: membership.userId === ownerId,
    monthly_workload_target_hours:
      membership.user.monthlyWorkloadTargetHours ?? null,
    actual_hours: actualHours ?? null,
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
