import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAchievements, type NewAchievement } from "@/lib/xp";

/** Dipertahankan agar kode lama tetap jalan: pengecekan kini dilakukan fungsi database check_achievements(). */
export async function checkLessonAchievements(supabase: SupabaseClient): Promise<NewAchievement[]> {
  return checkAchievements(supabase);
}
