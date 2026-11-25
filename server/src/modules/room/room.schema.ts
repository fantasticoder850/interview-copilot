import { z } from "zod";

export const noteSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
});

export const saveQaSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});
