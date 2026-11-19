import { Award, BookCheck, Clock, Flame, Gem, Lock, Medal, Swords, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLevel, LEVELS } from "@/lib/levels";
import { hoursFromMinutes } from "@/lib/utils";
import { StatCard } from "@/components/StatCard";
import { ProfileEditor } from "@/components/profile/ProfileEditor";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profileRes, sessionsRes, lessonsRes, missionsRes, achRes, unlockedRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
    supabase.from("study_sessions").select("duration_minutes").eq("completed", true),
    supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("missions").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("achievements").select("code,title,description").order("code"),
    supabase.from("user_achievements").select("achievement_code,unlocked_at"),
  ]);

  const p = profileRes.data;
  if (!p) {
    return (
      <div className="card p-6">
        <p className="text-sm text-muted">
          Profil belum ditemukan. Pastikan migrasi database sudah dijalankan dan akun dibuat setelahnya.
        </p>
      </div>
    );
  }

  const lvl = getLevel(p.total_xp);
  const minutes = (sessionsRes.data ?? []).reduce((s, r) => s + r.duration_minutes, 0);
  const unlocked = new Map((unlockedRes.data ?? []).map((u) => [u.achievement_code, u.unlocked_at as string]));
  const joined = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(p.created_at),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Profile</h1>
        <p className="mt-1 text-sm text-muted">Bergabung sejak {joined}</p>
      </div>

      <ProfileEditor
        userId={user!.id}
        initial={{
          display_name: p.display_name,
          username: p.username,
          bio: p.bio,
          avatar_url: p.avatar_url,
          email: p.email,
        }}
      />

      {/* Rank */}
      <section className="card p-5 sm:p-6" aria-labelledby="rank">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="rank" className="text-xs font-semibold uppercase tracking-wide text-muted">Learning Rank</h2>
            <p className="mt-1 font-display text-2xl font-extrabold">
              Level {lvl.level} · <span className="text-gold">{lvl.title}</span>
            </p>
          </div>
          <p className="text-sm text-muted">
            {lvl.isMax ? "Level maksimum tercapai" : `${lvl.xpToNext} XP menuju ${lvl.next!.title}`}
          </p>
        </div>
        <div
          className="mt-4 h-3 overflow-hidden rounded-full bg-line/15"
          role="progressbar"
          aria-valuenow={lvl.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progres menuju level berikutnya"
        >
          <div className="h-full animate-grow rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${lvl.progress}%` }} />
        </div>
        <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {LEVELS.map((l) => (
            <li
              key={l.level}
              className={`rounded-xl border px-3 py-2 text-xs ${
                l.level === lvl.level
                  ? "border-primary/60 bg-primary/10 text-ink"
                  : l.level < lvl.level
                    ? "border-line/15 text-ink"
                    : "border-line/10 text-muted"
              }`}
            >
              <span className="font-bold">Lv {l.level}</span> · {l.title}
              <span className="block text-[10px] text-muted">{l.minXp.toLocaleString("id-ID")} XP</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Statistik */}
      <section aria-label="Learning statistics" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Zap} label="Total XP Earned" value={p.total_xp.toLocaleString("id-ID")} tone="gold" />
        <StatCard icon={Gem} label="Available XP" value={p.available_xp.toLocaleString("id-ID")} hint="Bisa ditukar reward" tone="accent" />
        <StatCard icon={Clock} label="Study Hours" value={`${hoursFromMinutes(minutes)}j`} tone="primary" />
        <StatCard icon={BookCheck} label="Materi Selesai" value={lessonsRes.count ?? 0} tone="success" />
        <StatCard icon={Swords} label="Misi Selesai" value={missionsRes.count ?? 0} tone="primary" />
        <StatCard icon={Flame} label="Streak Saat Ini" value={`${p.current_streak} hari`} tone="gold" />
        <StatCard icon={Medal} label="Streak Terpanjang" value={`${p.longest_streak} hari`} tone="accent" />
      </section>

      {/* Achievements */}
      <section className="card p-5 sm:p-6" aria-labelledby="ach">
        <h2 id="ach" className="mb-4 font-display text-base font-bold">
          Achievement Collection{" "}
          <span className="text-sm font-normal text-muted">
            ({unlocked.size}/{achRes.data?.length ?? 0})
          </span>
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(achRes.data ?? []).map((a) => {
            const at = unlocked.get(a.code);
            return (
              <li
                key={a.code}
                className={`flex items-start gap-3 rounded-xl border p-3 ${at ? "border-gold/40 bg-gold/10" : "border-line/10 opacity-60"}`}
              >
                <span className={`mt-0.5 rounded-lg p-2 ${at ? "bg-gold/25 text-gold" : "bg-line/10 text-muted"}`}>
                  {at ? <Award className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </span>
                <div>
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="text-xs text-muted">{a.description}</p>
                  {at && (
                    <p className="mt-1 text-[11px] text-gold">
                      Diraih {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(at))}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
