export type MemberRole = "admin" | "member";

export enum TaskStatus {
  Backlog = "BACKLOG",
  Todo = "TODO",
  "In Progress" = "IN_PROGRESS",
  "In Review" = "IN_REVIEW",
  Done = "DONE",
}

export type ApiUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  monthlyWorkloadTargetHours: number | null;
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
};

export type WorkspaceMember = {
  $id: string;
  name: string | null;
  email: string;
  membership_id: string;
  role: MemberRole;
  is_owner: boolean;
  actual_hours?: number | null;
  monthly_hours?: {
    month: string;
    label: string;
    hours: number;
  }[];
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
  taskEstimatedHours: number | null;
  message: string | null;
  isRead: boolean;
  createdAt: string;
};

export type TaskTimeFields = {
  estimated_hours?: number | null;
  actual_hours?: number | null;
  started_at?: string | null;
};

export type Task = TaskTimeFields & {
  $id: string;
  name: string;
  workspace_id: string;
  project_id: string;
  status: TaskStatus;
  due_date: string | null;
  assignee_id: string | null;
  description?: string | null;
  position: number;
};

export type TaskMedia = {
  id: string;
  path: string;
  mime: string | null;
  original_name: string | null;
};

export type FilteredTask = Task & {
  project: Project | null;
  assignee: { $id: string; name: string | null; email: string } | null;
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
