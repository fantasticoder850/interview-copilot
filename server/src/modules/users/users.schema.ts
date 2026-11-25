import { z } from "zod";

export const userPatchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "disabled"]).optional(),
  role: z.enum(["admin", "manager", "candidate"]).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const managersSchema = z.object({ managerIds: z.array(z.string().uuid()) });
