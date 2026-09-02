import type { QueryClient } from "@tanstack/vue-query";

export const taskDetailQueryKey = (taskId: string) =>
  ["task", taskId] as const;

export const taskEditorQueryKey = (taskId: string) =>
  ["task-editor", taskId] as const;

export const taskProjectOptionsQueryKey = (workspaceId: string) =>
  ["projects", workspaceId] as const;

export const taskMemberOptionsQueryKey = (workspaceId: string) =>
  ["members", workspaceId] as const;

export async function invalidateTaskQueries(
  queryClient: QueryClient,
  taskId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: taskDetailQueryKey(taskId),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: taskEditorQueryKey(taskId),
      exact: true,
    }),
  ]);
}
