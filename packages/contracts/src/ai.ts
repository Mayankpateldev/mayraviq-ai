import { z } from "zod";
export const aiDraftSchema = z
  .object({
    summary: z.string().max(6000),
    actions: z
      .array(
        z
          .object({
            title: z.string().min(1).max(1000),
            rationale: z.string().max(500),
          })
          .strict(),
      )
      .max(6),
    designIdeas: z.array(z.string().min(1).max(500)).max(6),
    questions: z.array(z.string().min(1).max(500)).max(6),
  })
  .strict();
export type AiDraft = z.infer<typeof aiDraftSchema>;
export type AiStatus = {
  enabled: boolean;
  permitted: boolean;
  provider: string;
  model: string;
};
