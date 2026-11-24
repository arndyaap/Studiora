import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Memberi XP hanya untuk sumber yang belum pernah memberi XP (anti-farming).
 * Unique index di database (xp_once_per_source) menjadi pengaman terakhir:
 * insert kedua untuk sumber yang sama ditolak (kode 23505) dan kita anggap "tidak ada XP baru".
 */
export async function awardXpOnce(
  supabase: SupabaseClient,
  params: { amount: number; source: "lesson_completed" | "lesson_note_completed"; sourceId: string; note: string },
): Promise<boolean> {
  const { error } = await supabase.from("xp_transactions").insert({
    amount: params.amount,
    kind: "earn",
    source: params.source,
    source_id: params.sourceId,
    note: params.note,
  });
  if (error) return false; // 23505 = sudah pernah diberi
  return true;
}
