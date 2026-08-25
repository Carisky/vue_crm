export const UNASSIGNED_TASK_ASSIGNEE = "__UNASSIGNED__";
const USER_PREFIX = "user:";
const GROUP_PREFIX = "group:";

export function userAssigneeValue(userId: string) {
  return `${USER_PREFIX}${userId}`;
}

export function groupAssigneeValue(groupId: string) {
  return `${GROUP_PREFIX}${groupId}`;
}

export function taskAssigneeValue(input: {
  userId?: string | null;
  groupId?: string | null;
}) {
  if (input.groupId) return groupAssigneeValue(input.groupId);
  if (input.userId) return userAssigneeValue(input.userId);
  return UNASSIGNED_TASK_ASSIGNEE;
}

export function parseTaskAssigneeValue(value?: string | null) {
  if (value?.startsWith(USER_PREFIX)) {
    return {
      assignee_id: value.slice(USER_PREFIX.length),
      assignee_group_id: null,
    };
  }
  if (value?.startsWith(GROUP_PREFIX)) {
    return {
      assignee_id: null,
      assignee_group_id: value.slice(GROUP_PREFIX.length),
    };
  }
  return { assignee_id: null, assignee_group_id: null };
}
