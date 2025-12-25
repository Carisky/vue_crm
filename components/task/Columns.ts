import { type ColumnDef } from "@tanstack/vue-table";
import { format } from "date-fns";
import { ArrowUpDownIcon } from "lucide-vue-next";

import { TaskPriority, TaskStatus, taskPriorityLabels, type FilteredTask, type Project } from "~/lib/types";
import { Badge, Button, Icon, ProjectAvatar, TaskDate } from "#components";
import MemberAvatar from "../workspace/member/MemberAvatar.vue";
import Actions from "./Actions.vue";

const statuses = Object.entries(TaskStatus).reduce(
  (acc, [label, value]) => {
    acc[value] = label;
    return acc;
  },
  {} as Record<string, string>,
);

const priorityLabels = taskPriorityLabels;
const priorityOrder: Record<TaskPriority, number> = {
  [TaskPriority["Very Low"]]: 1,
  [TaskPriority.Low]: 2,
  [TaskPriority.Medium]: 3,
  [TaskPriority.High]: 4,
  [TaskPriority["Real Time"]]: 5,
};

export const columns: ColumnDef<FilteredTask>[] = [
  {
    accessorKey: "name",
    meta: {
      headerClass: "w-[380px]",
      cellClass: "max-w-[380px]",
    },
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => ["Task name", h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" })],
      );
    },
    cell: ({ row }) =>
      h("p", { class: "truncate" }, row.getValue("name")),
  },
  {
    accessorKey: "project",
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => ["Project", h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" })],
      );
    },
    cell: ({ row }) => {
      const project = row.getValue("project") as Project | null;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        [
      h(ProjectAvatar, {
        name: project?.name ?? "No project",
        class: "size-6",
        image: project?.image_url ?? undefined,
      }),
      h("p", { class: "line-clamp-1" }, project?.name ?? "No project"),
        ],
      );
    },
  },
  {
    accessorKey: "assignee",
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => ["Assignee", h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" })],
      );
    },
    cell: ({ row }) => {
      const assignee = row.getValue("assignee") as
        | FilteredTask["assignee"]
        | null;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        [
          h(MemberAvatar, {
            name: assignee?.name,
            class: "size-6",
            fallbackClass: "text-xs",
          }),
          h("p", { class: "line-clamp-1" }, assignee?.name ?? ""),
        ],
      );
    },
  },
  {
    accessorKey: "due_date",
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => ["Due Date", h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" })],
      );
    },
    cell: ({ row }) => {
      const dueDate = row.getValue("due_date") as string;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        h(TaskDate, { value: dueDate }),
      );
    },
  },
  {
    accessorKey: "started_at",
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => ["Started At", h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" })],
      );
    },
    cell: ({ row }) => {
      const startedAt = row.getValue("started_at") as string | null;
      if (!startedAt) {
        return h("span", { class: "text-sm text-muted-foreground" }, "Not started");
      }

      const parsedDate = new Date(startedAt);
      if (Number.isNaN(parsedDate.getTime())) {
        return h("span", { class: "text-sm text-muted-foreground" }, "Invalid date");
      }

      return h(
        "span",
        { class: "text-sm font-medium" },
        format(parsedDate, "PPp"),
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => ["Status", h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" })],
      );
    },
    cell: ({ row }) => {
      const status = row.getValue("status") as TaskStatus;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        h(Badge, { variant: status }, () => statuses[status]),
      );
    },
  },
  {
    accessorKey: "priority",
    sortingFn: (rowA, rowB, columnId) => {
      const a = rowA.getValue(columnId) as TaskPriority;
      const b = rowB.getValue(columnId) as TaskPriority;
      return (priorityOrder[a] ?? 0) - (priorityOrder[b] ?? 0);
    },
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => ["Priority", h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" })],
      );
    },
    cell: ({ row }) => {
      const priority = row.getValue("priority") as TaskPriority;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        h(Badge, { variant: priority }, () => priorityLabels[priority]),
      );
    },
  },
  {
    id: "actions",
    accessorKey: "task_id",
    header: () => null,
    cell: ({ row }) => {
      const id = row.original.$id;
      const name = row.original.name;
      const projectId = row.original.project.$id;

      return h(Actions, { taskId: id, name, projectId }, () =>
        h(Button, { variant: "ghost", class: "size-8 p-0" }, () =>
          h(Icon, {
            name: "lucide:ellipsis-vertical",
            size: "16px",
            class: "size-4",
          }),
        ),
      );
    },
  },
];
