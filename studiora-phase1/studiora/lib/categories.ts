/** Kategori aktivitas kalender dan warnanya (sesuai spesifikasi). */
export const CATEGORY_META = {
  study_session: { label: "Study Session", bar: "bg-primary", dot: "bg-primary" },
  assignment: { label: "Assignment", bar: "bg-accent", dot: "bg-accent" },
  examination: { label: "Examination", bar: "bg-danger", dot: "bg-danger" },
  personal_goal: { label: "Personal Goal", bar: "bg-gold", dot: "bg-gold" },
  review_material: { label: "Review Material", bar: "bg-success", dot: "bg-success" },
} as const;

export type EventCategory = keyof typeof CATEGORY_META;
