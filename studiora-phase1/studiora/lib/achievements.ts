import type { SupabaseClient } from "@supabase/supabase-js";
import { getLevel } from "@/lib/levels";

type Unlocked = { code: string; title: string };

const TITLES: Record<string, string> = {
  first_step: "First Step",
  knowledge_seeker: "Knowledge Seeker",
  explorer: "Explorer",
  grand_scholar: "Grand Scholar",
};

async function unlock(supabase: SupabaseClient, code: string): Promise<boolean> {
  // Primary key (user_id, achievement_code) mencegah duplikat; error = sudah pernah didapat.
  const { error } = await supabase.from("user_achievements").insert({ achievement_code: code });
  if (error) return false;
  await supabase.from("notifications").insert({
    type: "achievement",
    title: `Achievement terbuka: ${TITLES[code] ?? code}`,
    body: "",
  });
  return true;
}

/** Memeriksa achievement yang bergantung pada penyelesaian materi dan level. */
export async function checkLessonAchievements(supabase: SupabaseClient): Promise<Unlocked[]> {
  const newly: Unlocked[] = [];

  const { data: done } = await supabase
    .from("lessons")
    .select("id, modules(subjects(category_id))")
    .eq("status", "completed");
  const rows = (done ?? []) as unknown as { modules: { subjects: { category_id: string } | null } | null }[];

  const count = rows.length;
  const cats = new Set(rows.map((r) => r.modules?.subjects?.category_id).filter(Boolean));

  const checks: [string, boolean][] = [
    ["first_step", count >= 1],
    ["knowledge_seeker", count >= 10],
    ["explorer", cats.size >= 5],
  ];

  const { data: profile } = await supabase.from("profiles").select("total_xp").maybeSingle();
  if (profile && getLevel(profile.total_xp).level >= 10) checks.push(["grand_scholar", true]);

  for (const [code, ok] of checks) {
    if (ok && (await unlock(supabase, code))) newly.push({ code, title: TITLES[code] ?? code });
  }
  return newly;
}
