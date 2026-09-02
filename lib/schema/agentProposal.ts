import * as z from "zod";

const id = z.string().trim().min(1).max(191);
const nullableId = id.nullable().optional();
const clientRef = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores or dashes");
const nullableDate = z
  .union([z.string().datetime({ offset: true }), z.null()])
  .optional();
const TaskStatusSchema = z.enum([
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
]);
const TaskPrioritySchema = z.enum([
  "VERY_LOW",
  "LOW",
  "MEDIUM",
  "HIGH",
  "REAL_TIME",
]);

const ProjectCreateOperationSchema = z
  .object({
    type: z.literal("project.create"),
    ref: clientRef.optional(),
    workspace_id: id,
    name: z.string().trim().min(1).max(191),
    parent_project_id: nullableId,
    parent_project_ref: clientRef.optional(),
  })
  .strict()
  .refine(
    (value) => !(value.parent_project_id && value.parent_project_ref),
    "Use either parent_project_id or parent_project_ref",
  );

const ProjectUpdateOperationSchema = z
  .object({
    type: z.literal("project.update"),
    project_id: id,
    name: z.string().trim().min(1).max(191),
  })
  .strict();

const TaskCreateOperationSchema = z
  .object({
    type: z.literal("task.create"),
    ref: clientRef.optional(),
    workspace_id: id,
    project_id: id.optional(),
    project_ref: clientRef.optional(),
    parent_task_id: nullableId,
    parent_task_ref: clientRef.optional(),
    name: z.string().trim().min(1).max(191),
    description: z.string().max(65_535).optional(),
    status: TaskStatusSchema.default("BACKLOG"),
    priority: TaskPrioritySchema.default("MEDIUM"),
    due_date: nullableDate,
    started_at: nullableDate,
    assignee_id: nullableId,
    assignee_group_id: nullableId,
  })
  .strict()
  .refine(
    (value) => Boolean(value.project_id) !== Boolean(value.project_ref),
    "Use exactly one of project_id or project_ref",
  )
  .refine(
    (value) => !(value.parent_task_id && value.parent_task_ref),
    "Use either parent_task_id or parent_task_ref",
  )
  .refine(
    (value) => !(value.assignee_id && value.assignee_group_id),
    "A task can be assigned to a user or a group, not both",
  );

const TaskUpdateOperationSchema = z
  .object({
    type: z.literal("task.update"),
    task_id: id,
    name: z.string().trim().min(1).max(191).optional(),
    description: z.string().max(65_535).optional(),
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    due_date: nullableDate,
    started_at: nullableDate,
    assignee_id: nullableId,
    assignee_group_id: nullableId,
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => !["type", "task_id"].includes(key)),
    "At least one task field must be changed",
  )
  .refine(
    (value) => !(value.assignee_id && value.assignee_group_id),
    "A task can be assigned to a user or a group, not both",
  );

export const AgentOperationSchema = z.union([
  ProjectCreateOperationSchema,
  ProjectUpdateOperationSchema,
  TaskCreateOperationSchema,
  TaskUpdateOperationSchema,
]);

export const CreateAgentProposalSchema = z
  .object({
    title: z.string().trim().min(1).max(191),
    summary: z.string().trim().max(4_000).optional(),
    workspace_id: id,
    operations: z.array(AgentOperationSchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    const refs = new Set<string>();

    value.operations.forEach((operation, index) => {
      if ("workspace_id" in operation && operation.workspace_id !== value.workspace_id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["operations", index, "workspace_id"],
          message: "All operations must use the proposal workspace",
        });
      }

      const referenced = [
        "parent_project_ref" in operation ? operation.parent_project_ref : undefined,
        "project_ref" in operation ? operation.project_ref : undefined,
        "parent_task_ref" in operation ? operation.parent_task_ref : undefined,
      ].filter((item): item is string => Boolean(item));

      for (const ref of referenced) {
        if (!refs.has(ref)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["operations", index],
            message: `Reference ${ref} must point to an earlier create operation`,
          });
        }
      }

      if ("ref" in operation && operation.ref) {
        if (refs.has(operation.ref)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["operations", index, "ref"],
            message: `Duplicate reference ${operation.ref}`,
          });
        }
        refs.add(operation.ref);
      }
    });
  });

export type AgentOperation = z.infer<typeof AgentOperationSchema>;
export type CreateAgentProposal = z.infer<typeof CreateAgentProposalSchema>;

export function summarizeAgentOperation(operation: AgentOperation) {
  switch (operation.type) {
    case "project.create":
      return `Create project “${operation.name}”`;
    case "project.update":
      return `Rename project to “${operation.name}”`;
    case "task.create":
      return `Create task “${operation.name}”`;
    case "task.update":
      return `Update task ${operation.task_id}`;
  }
}
