import { z } from "zod";

export const BreakdownResponseSchema = z.object({
  intro: z.string().max(140),
  subtasks: z.array(z.string().max(80)).min(3).max(7),
});

export type BreakdownResponse = z.infer<typeof BreakdownResponseSchema>;

export const EpitaphResponseSchema = z.object({
  epitaph: z.string(),
});

export type EpitaphResponse = z.infer<typeof EpitaphResponseSchema>;
