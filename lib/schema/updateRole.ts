import * as z from "zod";

export const UpdateMemberRoleSchema = z.object({
  membershipId: z.string().trim().min(1),
  role: z.enum(["ADMIN", "MEMBER"]),
});
