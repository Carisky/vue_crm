import * as z from "zod";

const groupName = z.string().trim().min(1).max(80);
const groupDescription = z.string().trim().max(1000).optional().nullable();
const groupColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .optional()
  .nullable();
const groupMemberIds = z.array(z.string().trim().min(1)).max(100).default([]);

export const CreateWorkspaceGroupSchema = z
  .object({
    name: groupName,
    description: groupDescription,
    color: groupColor,
    member_ids: groupMemberIds,
  })
  .strict();

export const UpdateWorkspaceGroupSchema =
  CreateWorkspaceGroupSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    "No changes supplied",
  );
