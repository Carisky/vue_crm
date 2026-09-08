import * as z from "zod";

export const ProjectAccessSchema = z.object({
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  user_ids: z.array(z.string().trim().min(1)).default([]),
});
