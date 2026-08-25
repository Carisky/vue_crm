import { type ColumnDef } from "@tanstack/vue-table";
import { ArrowUpDownIcon } from "lucide-vue-next";

import {
  taskPriorityTranslationKeys,
  taskStatusTranslationKeys,
  type TranslationKey,
} from "~/lib/i18n";
import {
  TaskPriority,
  TaskStatus,
  type AppLocale,
  type FilteredTask,
  type Project,
} from "~/lib/types";
import { Badge, Button, Icon, ProjectAvatar } from "#components";
import MemberAvatar from "../workspace/member/MemberAvatar.vue";
import Actions from "./Actions.vue";

const priorityOrder: Record<TaskPriority, number> = {
  [TaskPriority["Very Low"]]: 1,
  [TaskPriority.Low]: 2,
  [TaskPriority.Medium]: 3,
  [TaskPriority.High]: 4,
  [TaskPriority["Real Time"]]: 5,
};

export const createColumns = (
  t: (key: TranslationKey) => string,
  locale: AppLocale,
): ColumnDef<FilteredTask>[] => [
  {
    accessorKey: "name",
    size: 240,
    minSize: 180,
    meta: {
      label: t("task.name"),
      headerClass: "w-[240px]",
      cellClass: "whitespace-normal",
    },
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => [t("task.name"), h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" })],
      );
    },
    cell: ({ row }) =>
      (() => {
        const name = String(row.getValue("name") ?? "");
        return h("p", { class: "line-clamp-2 break-words", title: name }, name);
      })(),
  },
  {
    accessorKey: "project",
    size: 200,
    minSize: 160,
    meta: {
      label: t("common.project"),
      headerClass: "w-[200px]",
      cellClass: "whitespace-nowrap",
    },
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => [
          t("common.project"),
          h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" }),
        ],
      );
    },
    cell: ({ row }) => {
      const project = row.getValue("project") as Project | null;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        [
          h(ProjectAvatar, {
            name: project?.name ?? t("task.noProject"),
            class: "size-6",
            image: (project?.image_url ?? undefined) as string | undefined,
          }),
          h(
            "p",
            { class: "line-clamp-1" },
            project?.name ?? t("task.noProject"),
          ),
        ],
      );
    },
  },
  {
    accessorKey: "assignee",
    size: 170,
    minSize: 140,
    meta: {
      label: t("common.assignee"),
      headerClass: "w-[170px]",
      cellClass: "whitespace-nowrap",
    },
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => [
          t("common.assignee"),
          h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" }),
        ],
      );
    },
    cell: ({ row }) => {
      const assignee = row.getValue("assignee") as
        | FilteredTask["assignee"]
        | null;
      const group = row.original.assignee_group;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        [
          group
            ? h(
                "span",
                {
                  class:
                    "inline-flex size-6 items-center justify-center rounded text-xs font-semibold text-white",
                  style: { backgroundColor: group.color ?? "#64748b" },
                },
                group.name.charAt(0).toUpperCase(),
              )
            : h(MemberAvatar, {
                name: assignee?.name ?? undefined,
                class: "size-6",
                fallbackClass: "text-xs",
              }),
          h(
            "p",
            { class: "line-clamp-1" },
            group?.name ?? assignee?.name ?? "",
          ),
        ],
      );
    },
  },
  {
    accessorKey: "started_at",
    size: 120,
    minSize: 110,
    meta: {
      label: t("task.startedAt"),
      headerClass: "w-[120px]",
      cellClass: "whitespace-nowrap",
    },
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => [
          t("task.startedAt"),
          h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" }),
        ],
      );
    },
    cell: ({ row }) => {
      const startedAt = row.getValue("started_at") as string | null;
      if (!startedAt) {
        return h(
          "span",
          { class: "text-sm text-muted-foreground" },
          t("task.notStarted"),
        );
      }

      const parsedDate = new Date(startedAt);
      if (Number.isNaN(parsedDate.getTime())) {
        return h(
          "span",
          { class: "text-sm text-muted-foreground" },
          t("task.invalidDate"),
        );
      }

      return h(
        "span",
        { class: "text-sm font-medium" },
        new Intl.DateTimeFormat(locale, {
          month: "short",
          day: "numeric",
        }).format(parsedDate),
      );
    },
  },
  {
    accessorKey: "status",
    size: 140,
    minSize: 120,
    meta: {
      label: t("common.status"),
      headerClass: "w-[140px]",
      cellClass: "whitespace-nowrap",
    },
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => [
          t("common.status"),
          h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" }),
        ],
      );
    },
    cell: ({ row }) => {
      const status = row.getValue("status") as TaskStatus;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        h(Badge, { variant: status }, () =>
          t(taskStatusTranslationKeys[status]),
        ),
      );
    },
  },
  {
    accessorKey: "priority",
    size: 120,
    minSize: 110,
    sortingFn: (rowA, rowB, columnId) => {
      const a = rowA.getValue(columnId) as TaskPriority;
      const b = rowB.getValue(columnId) as TaskPriority;
      return (priorityOrder[a] ?? 0) - (priorityOrder[b] ?? 0);
    },
    meta: {
      label: t("common.priority"),
      headerClass: "w-[120px]",
      cellClass: "whitespace-nowrap",
    },
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
        },
        () => [
          t("common.priority"),
          h(ArrowUpDownIcon, { class: "ml-2 h-4 w-4" }),
        ],
      );
    },
    cell: ({ row }) => {
      const priority = row.getValue("priority") as TaskPriority;
      return h(
        "div",
        { class: "flex items-center gap-x-2 text-sm font-medium" },
        h(Badge, { variant: priority }, () =>
          t(taskPriorityTranslationKeys[priority]),
        ),
      );
    },
  },
  {
    id: "actions",
    enableHiding: false,
    enableResizing: false,
    size: 64,
    accessorKey: "task_id",
    meta: {
      headerClass: "w-[64px]",
      cellClass: "text-right",
    },
    header: () => null,
    cell: ({ row }) => {
      const id = row.original.$id;
      const name = row.original.name;
      const projectId = row.original.project_id;

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
