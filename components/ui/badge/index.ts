import { cva, type VariantProps } from "class-variance-authority";

import { TaskPriority, TaskStatus } from "~/lib/types";

export { default as Badge } from "./Badge.vue";

export const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        [TaskStatus.Todo]:
          "border-transparent bg-red-400 text-primary hover:bg-red-400/80",
        [TaskStatus["In Progress"]]:
          "border-transparent bg-yellow-400 text-primary hover:bg-yellow-400/80",
        [TaskStatus["In Review"]]:
          "border-transparent bg-blue-400 text-primary hover:bg-blue-400/80",
        [TaskStatus.Done]:
          "border-transparent bg-emerald-400 text-primary hover:bg-emerald-400/80",
        [TaskStatus.Backlog]:
          "border-transparent bg-pink-400 text-primary hover:bg-pink-400/80",
        [TaskPriority["Very Low"]]:
          "border-transparent bg-teal-200 text-teal-900 hover:bg-teal-200/80",
        [TaskPriority.Low]:
          "border-transparent bg-emerald-500 text-white hover:bg-emerald-500/90",
        [TaskPriority.Medium]:
          "border-transparent bg-yellow-300 text-yellow-950 hover:bg-yellow-300/80",
        [TaskPriority.High]:
          "border-transparent bg-pink-600 text-white hover:bg-pink-600/90 priority-pulse-pink",
        [TaskPriority["Real Time"]]:
          "border-transparent bg-red-500 text-white hover:bg-red-500/90 priority-blink-alert",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
