import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  requestedRole: z.enum(["manager", "viewer"]),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

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

export const interviewSchema = z.object({
  jobTitle: z.string().trim().min(1).max(200),
  jobDescription: z.string().max(20_000).optional().nullable(),
  systemPrompt: z.string().max(10_000).default(""),
  resumeId: z.string().uuid().optional().nullable(),
  interviewType: z.enum(["intro", "technical"]).default("intro"),
  interviewers: z.string().max(500).default(""),
  company: z.string().max(200).default(""),
  companyNotes: z.string().max(10_000).optional().nullable(),
  answerLanguage: z.string().trim().min(1).max(60).default("English"),
  model: z.string().max(60),
  viewerIds: z.array(z.string().uuid()).default([]),
});

// Helper: turn a ZodError into a flat message for the client.
export function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
    .join("; ");
}
