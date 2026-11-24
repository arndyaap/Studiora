import { z } from "zod";

const str = (max: number) => z.string().trim().min(1).max(max);

/** Hasil AI untuk satu potongan dokumen. */
export const partSchema = z.union([
  z.object({ unusable: z.literal(true), reason: z.string().max(300).default("") }),
  z.object({
    unusable: z.literal(false).optional(),
    subject_title: str(160),
    summary: z.string().trim().max(600).default(""),
    modules: z
      .array(
        z.object({
          title: str(160),
          lessons: z
            .array(
              z.object({
                title: str(200),
                description: z.string().trim().max(500).default(""),
                objectives: z.array(str(200)).max(6).default([]),
                minutes: z.number().int().min(5).max(240).default(30),
                source_ref: z.string().trim().max(120).default(""),
              }),
            )
            .min(1)
            .max(10),
        }),
      )
      .min(1)
      .max(12),
  }),
]);
export type Part = z.infer<typeof partSchema>;

export type Proposal = {
  subject_title: string;
  summary: string;
  modules: { title: string; lessons: { title: string; description: string; objectives: string[]; minutes: number; source_ref: string }[] }[];
};

/** Payload yang dikirim pengguna saat menerapkan usulan (sudah dipilah dan diedit). */
export const applySchema = z.object({
  category: z.union([z.object({ id: z.uuid() }), z.object({ newName: str(120) })]),
  subjectTitle: str(160),
  modules: z
    .array(
      z.object({
        title: str(160),
        lessons: z
          .array(
            z.object({
              title: str(200),
              description: z.string().trim().max(500).default(""),
              objectives: z.array(str(200)).max(6).default([]),
              minutes: z.number().int().min(5).max(240).default(30),
              sourceRef: z.string().trim().max(120).default(""),
              schedule: z.object({ starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }) }).nullable().default(null),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(12),
});
export type ApplyPayload = z.infer<typeof applySchema>;

/** Menggabungkan hasil semua potongan menjadi satu usulan. */
export function mergeParts(parts: Part[]): Proposal | null {
  const ok = parts.filter((p): p is Extract<Part, { subject_title: string }> => !("unusable" in p && p.unusable === true));
  if (ok.length === 0) return null;
  const seen = new Set<string>();
  const modules: Proposal["modules"] = [];
  for (const p of ok) {
    for (const m of p.modules) {
      const lessons = m.lessons.filter((l) => {
        const k = l.title.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (lessons.length) modules.push({ title: m.title, lessons });
    }
  }
  return { subject_title: ok[0].subject_title, summary: ok[0].summary, modules: modules.slice(0, 12) };
}
