import { z } from "zod";

export const BreakdownResponseSchema = z.object({
  intro: z.string().trim().min(1).max(140),
  subtasks: z.array(z.string().trim().min(1).max(80)).min(3).max(7),
});

export type BreakdownResponse = z.infer<typeof BreakdownResponseSchema>;

export const EpitaphResponseSchema = z.object({
  epitaph: z.string().trim().min(1).max(200),
});

export type EpitaphResponse = z.infer<typeof EpitaphResponseSchema>;
