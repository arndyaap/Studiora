import Link from "next/link";
import { BookCheck, Clock, Flame, Swords, Target, TrendingUp, PlayCircle, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLevel } from "@/lib/levels";
import { hoursFromMinutes } from "@/lib/utils";
import { StatCard } from "@/components/StatCard";
import { Greeting } from "@/components/home/Greeting";
import { TodayFocus } from "@/components/home/TodayFocus";
import { WeeklyOverview } from "@/components/home/WeeklyOverview";

export const metadata = { title: "Beranda" };

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profileRes, settingsRes, sessionsRes, lessonsDoneRes, missionsDoneRes, continueRes, activeMissionsRes] =
    await Promise.all([
      supabase.from("profiles").select("display_name,total_xp,current_streak").eq("id", user!.id).maybeSingle(),
      supabase.from("user_settings").select("daily_goal_minutes").eq("user_id", user!.id).maybeSingle(),
      supabase.from("study_sessions").select("duration_minutes").eq("completed", true),
      supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("missions").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabase
        .from("lessons")
        .select("id,title,description,module_id")
        .eq("status", "in_progress")
        .order("last_opened_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("missions")
        .select("id,title,type,target_value,progress_value,xp_reward")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

  const profile = profileRes.data;
  const totalXp = profile?.total_xp ?? 0;
  const lvl = getLevel(totalXp);
  const totalMinutes = (sessionsRes.data ?? []).reduce((s, r) => s + r.duration_minutes, 0);
  const lastLesson = continueRes.data;
  const missions = activeMissionsRes.data ?? [];
  const name = profile?.display_name ?? "Scholar";

  return (
    <div className="space-y-6">
      <Greeting name={name} />

      {/* Learning Overview */}
      <section aria-label="Learning overview" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={TrendingUp} label="Level" value={`Lv ${lvl.level}`} hint={lvl.title} tone="primary" />
        <StatCard icon={Zap} label="Total XP" value={totalXp.toLocaleString("id-ID")} hint={lvl.isMax ? "Level maksimum" : `${lvl.xpToNext} XP ke Lv ${lvl.level + 1}`} tone="gold" />
        <StatCard icon={Clock} label="Study Hours" value={`${hoursFromMinutes(totalMinutes)}j`} tone="accent" />
        <StatCard icon={BookCheck} label="Materi Selesai" value={lessonsDoneRes.count ?? 0} tone="success" />
        <StatCard icon={Swords} label="Misi Selesai" value={missionsDoneRes.count ?? 0} tone="primary" />
        <StatCard icon={Flame} label="Streak" value={`${profile?.current_streak ?? 0} hari`} tone="gold" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodayFocus />
          <WeeklyOverview dailyGoalMinutes={settingsRes.data?.daily_goal_minutes ?? 60} />
        </div>

        <div className="space-y-6">
          {/* Continue Learning */}
          <section className="card p-5" aria-labelledby="continue">
            <h2 id="continue" className="mb-3 font-display text-base font-bold">
              Continue Learning
            </h2>
            {lastLesson ? (
              <>
                <p className="font-semibold">{lastLesson.title}</p>
                {lastLesson.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{lastLesson.description}</p>
                )}
                <Link href={`/materi/lesson/${lastLesson.id}`} className="btn-primary mt-4 w-full">
                  <PlayCircle className="h-4 w-4" /> Continue Learning
                </Link>
              </>
            ) : (
              <div className="py-3 text-center">
                <p className="text-sm text-muted">Belum ada materi yang sedang dipelajari.</p>
                <Link href="/materi" className="btn-ghost mt-3 px-3 py-2 text-xs">
                  Jelajahi Materi
                </Link>
              </div>
            )}
          </section>

          {/* Active Missions */}
          <section className="card p-5" aria-labelledby="active-missions">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="active-missions" className="font-display text-base font-bold">
                Active Missions
              </h2>
              <Link href="/misi" className="text-xs font-semibold text-primary hover:underline">
                Lihat semua
              </Link>
            </div>
            {missions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-3 text-center">
                <Target className="h-7 w-7 text-muted" />
                <p className="text-sm text-muted">Belum ada misi aktif.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {missions.map((m) => {
                  const pct = Math.min(100, Math.round((m.progress_value / Math.max(1, m.target_value)) * 100));
                  return (
                    <li key={m.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{m.title}</span>
                        <span className="shrink-0 text-xs text-gold">+{m.xp_reward} XP</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/15">
                        <div className="h-full animate-grow rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted">
                        {m.progress_value}/{m.target_value}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
