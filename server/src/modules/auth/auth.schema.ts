import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  requestedRole: z.enum(["manager", "candidate"]),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export const accountSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(200).optional(),
    password: z.string().min(8).max(200).optional(),
    currentPassword: z.string().max(200).optional(),
  })
  .refine((d) => d.name !== undefined || d.email !== undefined || d.password !== undefined, {
    message: "Nothing to update",
  });

export const apiKeySchema = z.object({
  apiKey: z.string().trim().min(1),
});
