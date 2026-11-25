import type { SupabaseClient } from "@supabase/supabase-js";
import { getLevel } from "@/lib/levels";

/**
 * Semua pemberian XP kini dilakukan oleh fungsi database (migrasi 0004).
 * Browser tidak lagi bisa menulis xp_transactions, achievement, atau riwayat quiz secara langsung.
 */

export type CompletedMission = { id: string; title: string; xp: number };
export type NewAchievement = { code: string; title: string };

export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";
  } catch {
    return "Asia/Jakarta";
  }
}

/** Memberi 20 XP bila lesson sudah selesai dan XP-nya belum pernah diberikan. Mengembalikan XP yang diberikan. */
export async function awardLessonXp(supabase: SupabaseClient, lessonId: string): Promise<number> {
  const { data, error } = await supabase.rpc("award_lesson_xp", { p_lesson_id: lessonId });
  return error ? 0 : Number(data) || 0;
}

/** Memberi 10 XP bila catatan lesson sudah selesai dan XP-nya belum pernah diberikan. */
export async function awardNoteXp(supabase: SupabaseClient, lessonId: string): Promise<number> {
  const { data, error } = await supabase.rpc("award_note_xp", { p_lesson_id: lessonId });
  return error ? 0 : Number(data) || 0;
}

/** Membuat misi harian/mingguan, menghitung progres, dan memberi XP untuk misi yang selesai. */
export async function syncMissions(supabase: SupabaseClient): Promise<CompletedMission[]> {
  const { data, error } = await supabase.rpc("sync_missions", { p_tz: userTimeZone() });
  if (error || !data) return [];
  return ((data as { completed?: CompletedMission[] }).completed ?? []) as CompletedMission[];
}

/** Memeriksa semua achievement; mengembalikan yang baru terbuka. */
export async function checkAchievements(supabase: SupabaseClient): Promise<NewAchievement[]> {
  const { data, error } = await supabase.rpc("check_achievements");
  if (error || !Array.isArray(data)) return [];
  return data as NewAchievement[];
}

export async function getTotalXp(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from("profiles").select("total_xp").maybeSingle();
  return (data as { total_xp: number } | null)?.total_xp ?? 0;
}

/** Bila total XP naik melewati batas level, kembalikan info level baru (dan catat notifikasi). */
export async function detectLevelUp(supabase: SupabaseClient, xpBefore: number) {
  const after = await getTotalXp(supabase);
  const b = getLevel(xpBefore);
  const a = getLevel(after);
  if (a.level > b.level) {
    await supabase.from("notifications").insert({ type: "level_up", title: `Naik level! Level ${a.level}: ${a.title}`, body: "" });
    return { level: a.level, title: a.title };
  }
  return null;
}
