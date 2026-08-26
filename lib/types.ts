import type { AppLocale } from "./locales";
import type { ThemePreference } from "./preferences";

export { appLocales, type AppLocale } from "./locales";
export { themePreferences, type ThemePreference } from "./preferences";

export type MemberRole = "admin" | "member";

export enum TaskStatus {
  Backlog = "BACKLOG",
  Todo = "TODO",
  "In Progress" = "IN_PROGRESS",
  "In Review" = "IN_REVIEW",
  Done = "DONE",
}

export enum TaskPriority {
  "Very Low" = "VERY_LOW",
  Low = "LOW",
  Medium = "MEDIUM",
  High = "HIGH",
  "Real Time" = "REAL_TIME",
}

export const taskPriorityLabels: Record<TaskPriority, string> = {
  [TaskPriority["Very Low"]]: "Very low",
  [TaskPriority.Low]: "Low",
  [TaskPriority.Medium]: "Medium",
  [TaskPriority.High]: "High",
  [TaskPriority["Real Time"]]: "Real time",
};

export type ApiUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  monthlyWorkloadTargetHours: number | null;
  themePreference: ThemePreference;
  locale: AppLocale;
  emailNotificationsEnabled: boolean;
};

export type Workspace = {
  $id: string;
  name: string;
  invite_code: string;
  image_url: string | null;
};

export type Project = {
  $id: string;
  name: string;
  image_url: string | null;
  workspace_id: string;
  parent_id: string | null;
  progress: number;
  completed_tasks: number;
  total_tasks: number;
};

export type ProjectDocSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sectionId: string | null;
};

export type ProjectDoc = ProjectDocSummary & {
  projectId: string;
  workspaceId: string;
  body: string;
  author: { id: string; name: string | null; email: string };
};

export type WorkspaceMember = {
  $id: string;
  name: string | null;
  email: string;
  membership_id: string;
  role: MemberRole;
  is_owner: boolean;
};

export type WorkspaceMembersResponse = {
  members: WorkspaceMember[];
  current_user_id: string;
  is_owner: boolean;
  is_admin: boolean;
};

export type WorkspaceGroupMember = {
  $id: string;
  name: string | null;
  email: string;
};

export type WorkspaceGroup = {
  $id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string | null;
  conversation_id: string | null;
  members: WorkspaceGroupMember[];
  createdAt: string;
  updatedAt: string;
};

export type Notification = {
  id: string;
  workspaceId: string;
  taskId: string | null;
  projectId: string | null;
  actorId: string | null;
  actorName: string | null;
  taskName: string | null;
  projectName: string | null;
  type: string;
  message: string | null;
  isRead: boolean;
  createdAt: string;
};

export type TaskTimeFields = {
  started_at?: string | null;
};

export type Task = TaskTimeFields & {
  $id: string;
  name: string;
  workspace_id: string;
  project_id: string;
  parent_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  assignee_group_id: string | null;
  description?: string | null;
  position: number;
  progress: number;
  completed_subtasks: number;
  total_subtasks: number;
};

export type TaskMediaVariant = {
  id: string;
  mime: string;
  size: number;
  resolution: number | null;
};

export type TaskMedia = {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "video" | "pdf" | "document";
  resolution: number | null;
  variants: TaskMediaVariant[];
};

export type FilteredTask = Task & {
  project: Project | null;
  assignee: { $id: string; name: string | null; email: string } | null;
  assignee_group: {
    $id: string;
    name: string;
    color: string | null;
    member_ids: string[];
  } | null;
  media: TaskMedia[];
};

export type TaskSuccessSubscriber = ((task: FilteredTask) => void) | null;
export type CreateTaskInject = {
  createTaskSuccessSubsribers: TaskSuccessSubscriber[];
  subscribeToCreateTaskSuccess: (
    func: (task: FilteredTask) => void,
  ) => () => void;
};
export type UpdateTaskInject = {
  updateTaskSuccessSubsribers: TaskSuccessSubscriber[];
  subscribeToUpdateTaskSuccess: (
    func: (task: FilteredTask) => void,
  ) => () => void;
};
export type DeleteTaskInject = {
  deleteTaskSuccessSubsribers: (((taskId: string) => void) | null)[];
  subscribeToDeleteTaskSuccess: (func: (taskId: string) => void) => () => void;
};
