"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Loader2, LogOut, Moon, Sun, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

type Settings = {
  theme: Theme;
  skip_welcome: boolean;
  notifications_enabled: boolean;
  daily_goal_minutes: number;
  weekly_goal_minutes: number;
};

export function SettingsClient({ userId, initial }: { userId: string; initial: Settings }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [s, setS] = useState<Settings>(initial);
  const [goals, setGoals] = useState({ daily: String(initial.daily_goal_minutes), weekly: String(initial.weekly_goal_minutes) });
  const [savingGoals, setSavingGoals] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  async function patch(values: Partial<Settings>) {
    const supabase = createClient();
    const { error } = await supabase.from("user_settings").update(values).eq("user_id", userId);
    return error;
  }

  async function chooseTheme(next: Theme) {
    const prev = theme;
    setTheme(next); // langsung diterapkan + disimpan lokal
    setMsg(null);
    const error = await patch({ theme: next });
    if (error) {
      setTheme(prev);
      setMsg({ type: "err", text: "Gagal menyimpan tema ke database." });
    } else {
      setS((x) => ({ ...x, theme: next }));
    }
  }

  async function toggle(key: "skip_welcome" | "notifications_enabled") {
    const next = !s[key];
    setS((x) => ({ ...x, [key]: next }));
    setMsg(null);
    const error = await patch({ [key]: next });
    if (error) {
      setS((x) => ({ ...x, [key]: !next }));
      setMsg({ type: "err", text: "Gagal menyimpan pengaturan." });
    }
  }

  async function saveGoals(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const daily = Number(goals.daily);
    const weekly = Number(goals.weekly);
    if (!Number.isInteger(daily) || daily < 5 || daily > 1440) {
      setMsg({ type: "err", text: "Target harian harus 5–1440 menit." });
      return;
    }
    if (!Number.isInteger(weekly) || weekly < 5 || weekly > 10080) {
      setMsg({ type: "err", text: "Target mingguan harus 5–10080 menit." });
      return;
    }
    if (weekly < daily) {
      setMsg({ type: "err", text: "Target mingguan tidak boleh lebih kecil dari target harian." });
      return;
    }
    setSavingGoals(true);
    const error = await patch({ daily_goal_minutes: daily, weekly_goal_minutes: weekly });
    setSavingGoals(false);
    if (error) setMsg({ type: "err", text: "Gagal menyimpan target belajar." });
    else {
      setMsg({ type: "ok", text: "Target belajar tersimpan." });
      router.refresh();
    }
  }

  async function logout() {
    setLoggingOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {msg && (
        <p
          role="status"
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            msg.type === "ok" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          {msg.text}
        </p>
      )}

      <Section title="Theme Settings" desc="Pilihan tema tersimpan dan dipakai saat kamu membuka STUDIORA lagi.">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { id: "dark", label: "Dark Mode", icon: Moon },
              { id: "light", label: "Light Mode", icon: Sun },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => chooseTheme(o.id)}
              aria-pressed={theme === o.id}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition active:scale-[0.98]",
                theme === o.id ? "border-primary bg-primary/15 text-primary" : "border-line/20 hover:bg-surface2/50",
              )}
            >
              <o.icon className="h-4 w-4" /> {o.label}
              {theme === o.id && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Learning Goals" desc="Target belajar dipakai di Weekly Overview dan analitik.">
        <form onSubmit={saveGoals} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="dg">Target harian (menit)</label>
            <input id="dg" inputMode="numeric" className="input" value={goals.daily} onChange={(e) => setGoals({ ...goals, daily: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="wg">Target mingguan (menit)</label>
            <input id="wg" inputMode="numeric" className="input" value={goals.weekly} onChange={(e) => setGoals({ ...goals, weekly: e.target.value })} />
          </div>
          <button type="submit" disabled={savingGoals} className="btn-primary">
            {savingGoals && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
          </button>
        </form>
      </Section>

      <Section title="Preferensi">
        <Row label="Lewati Welcome Screen" desc="Langsung ke Beranda saat membuka STUDIORA. Layar pembuka masih bisa dilihat kapan saja.">
          <Switch on={s.skip_welcome} onClick={() => toggle("skip_welcome")} label="Lewati Welcome Screen" />
        </Row>
        <Row label="Notifikasi" desc="Menampilkan notifikasi di pusat notifikasi.">
          <Switch on={s.notifications_enabled} onClick={() => toggle("notifications_enabled")} label="Notifikasi" />
        </Row>
        <div className="pt-1">
          <Link href="/?intro=1" className="text-sm font-semibold text-primary hover:underline">
            Lihat Welcome Screen
          </Link>
        </div>
      </Section>

      <Section title="Akun & Data">
        <div className="flex flex-wrap gap-3">
          <Link href="/profile" className="btn-ghost">
            <UserCog className="h-4 w-4" /> Edit Profile & Avatar
          </Link>
          <a href="/api/export" className="btn-ghost">
            <Download className="h-4 w-4" /> Export Data (JSON)
          </a>
          <button type="button" onClick={logout} disabled={loggingOut} className="btn-ghost text-danger">
            {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Logout
          </button>
        </div>
        <p className="mt-4 text-xs text-muted">
          Belum tersedia (dijadwalkan di Phase 5): Import Data, backup terjadwal, pengaturan XP & Reward, dan Account
          Security lanjutan. Ubah kata sandi sementara melalui dashboard Supabase.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-display text-base font-bold">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {desc && <p className="text-xs text-muted">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-primary" : "bg-line/30")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}
