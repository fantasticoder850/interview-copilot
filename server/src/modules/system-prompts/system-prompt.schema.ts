import { z } from "zod";

export const systemPromptSchema = z.object({
  name: z.string().trim().min(1).max(120),
  content: z.string().max(10_000).default(""),
});
