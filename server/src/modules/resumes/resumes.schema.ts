import { z } from "zod";

export const resumeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(200).default(""),
  content: z.string().max(100_000).default(""),
});

export const qaSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  answer: z.string().max(10_000).default(""),
  sortOrder: z.number().int().optional(),
});

export const draftSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});
