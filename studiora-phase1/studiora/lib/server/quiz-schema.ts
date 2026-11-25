import "server-only";
import { z } from "zod";

const base = {
  prompt: z.string().trim().min(5).max(500),
  explanation: z.string().trim().max(600).default(""),
  difficulty: z.enum(["easy", "medium", "hard", "expert"]).default("medium"),
};

const mc = z
  .object({
    type: z.literal("multiple_choice"),
    ...base,
    options: z.array(z.string().trim().min(1).max(200)).min(3).max(5),
    answer: z.number().int().min(0),
  })
  .refine((q) => q.answer < q.options.length, { message: "Indeks jawaban di luar opsi" })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, { message: "Opsi dobel" });

const tf = z.object({ type: z.literal("true_false"), ...base, answer: z.boolean() });

const short = z.object({
  type: z.literal("short_answer"),
  ...base,
  answer: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
});

export const questionSchema = z.union([mc, tf, short]);
export const generatedSchema = z.object({ questions: z.array(z.unknown()).max(20) });
export type GeneratedQuestion = z.infer<typeof questionSchema>;
