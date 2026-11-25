import { Award, BookOpen, Compass, Crown, Flame, Footprints, Lock, Medal, Target, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { checkAchievements } from "@/lib/xp";

export const metadata = { title: "Achievements" };
export const dynamic = "force-dynamic";

const ICONS: Record<string, LucideIcon> = {
  footprints: Footprints,
  "book-open": BookOpen,
  target: Target,
  flame: Flame,
  medal: Medal,
  compass: Compass,
  crown: Crown,
  award: Award,
};

export default async function Page() {
  const supabase = await createClient();
  await checkAchievements(supabase);
  const [{ data: all }, { data: mine }] = await Promise.all([
    supabase.from("achievements").select("code,title,description,icon").order("code"),
    supabase.from("user_achievements").select("achievement_code,unlocked_at"),
  ]);
  const unlocked = new Map((mine ?? []).map((u) => [u.achievement_code as string, u.unlocked_at as string]));
  const list = (all ?? []).slice().sort((a, b) => Number(unlocked.has(b.code)) - Number(unlocked.has(a.code)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Achievements</h1>
        <p className="text-sm text-muted">{unlocked.size} dari {list.length} terbuka</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => {
          const at = unlocked.get(a.code);
          const Icon = ICONS[a.icon] ?? Award;
          return (
            <li key={a.code} className={`card flex items-start gap-4 p-4 ${at ? "border-gold/40" : "opacity-60"}`}>
              <span className={`rounded-xl p-3 ${at ? "bg-gold/20 text-gold" : "bg-surface2/70 text-muted"}`}>{at ? <Icon className="h-6 w-6" /> : <Lock className="h-6 w-6" />}</span>
              <div>
                <h3 className="font-display font-bold">{a.title}</h3>
                <p className="text-sm text-muted">{a.description}</p>
                <p className="mt-1 text-xs text-muted">{at ? `Terbuka ${new Date(at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}` : "Belum terbuka"}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Consistency dan Dedicated Scholar baru bisa terbuka setelah fitur streak aktif di Phase 4.</p>
    </div>
  );
}
