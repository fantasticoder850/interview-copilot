import { z } from "zod";

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
  candidateIds: z.array(z.string().uuid()).default([]),
});

export const statusSchema = z.object({
  status: z.enum(["scheduled", "interviewing", "ended"]),
});

export const newVersionSchema = z.object({
  carrySummary: z.boolean().optional().default(false),
});

export const resumeTextSchema = z.object({
  text: z.string().max(100_000).default(""),
});
