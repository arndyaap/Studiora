"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Gift, ListChecks, Loader2, Plus, Skull, Swords, Trash2, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { detectLevelUp, getTotalXp, syncMissions } from "@/lib/xp";
import { Modal, ConfirmButton } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type Mission = {
  id: string;
  type: "daily" | "weekly" | "quiz" | "challenge" | "boss";
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard" | "expert" | null;
  target_value: number;
  progress_value: number;
  xp_reward: number;
  metric: "lessons_completed" | "notes_completed" | "quizzes_taken" | "quiz_perfect";
  source_category_id: string | null;
  status: "active" | "completed" | "expired";
  window_end: string | null;
  completed_at: string | null;
  created_at: string;
};
type Cat = { id: string; name: string };

const TABS = [
  { key: "daily", label: "Harian" },
  { key: "weekly", label: "Mingguan" },
  { key: "custom", label: "Tantangan" },
  { key: "history", label: "Riwayat" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const TYPE_LABEL: Record<Mission["type"], string> = { daily: "Harian", weekly: "Mingguan", quiz: "Quiz", challenge: "Challenge", boss: "Boss" };
const DIFF_LABEL = { easy: "Mudah", medium: "Sedang", hard: "Sulit", expert: "Expert" } as const;
const METRICS: { value: Mission["metric"]; label: string }[] = [
  { value: "lessons_completed", label: "Selesaikan materi" },
  { value: "notes_completed", label: "Selesaikan catatan" },
  { value: "quizzes_taken", label: "Kerjakan quiz" },
  { value: "quiz_perfect", label: "Quiz nilai sempurna" },
];
const BASE_XP = { easy: 20, medium: 40, hard: 70, expert: 100 } as const;
const CAP = { quiz: 100, challenge: 150, boss: 300 } as const;

function xpFor(type: "quiz" | "challenge" | "boss", d: keyof typeof BASE_XP) {
  const mult = type === "boss" ? 3 : type === "challenge" ? 1.5 : 1;
  return Math.min(CAP[type], Math.round(BASE_XP[d] * mult));
}

function timeLeft(end: string | null) {
  if (!end) return null;
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) return "berakhir";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} hari lagi`;
  if (h >= 1) return `${h} jam lagi`;
  return `${Math.max(1, Math.floor(ms / 60_000))} menit lagi`;
}

export function MisiClient() {
  const [tab, setTab] = useState<Tab>("daily");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "challenge" as "quiz" | "challenge" | "boss",
    title: "",
    description: "",
    difficulty: "medium" as keyof typeof BASE_XP,
    metric: "lessons_completed" as Mission["metric"],
    target: 3,
    categoryId: "",
  });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("missions")
      .select("id,type,title,description,difficulty,target_value,progress_value,xp_reward,metric,source_category_id,status,window_end,completed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (err) {
      setError("Gagal memuat misi. Pastikan migrasi database 0004 sudah dijalankan.");
      return;
    }
    setMissions((data as Mission[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const before = await getTotalXp(supabase);
      const done = await syncMissions(supabase);
      const [, c] = await Promise.all([load(), supabase.from("categories").select("id,name").order("position")]);
      setCats((c.data as Cat[]) ?? []);
      setLoading(false);
      if (done.length) {
        const up = await detectLevelUp(supabase, before);
        setNotice(`Misi selesai: ${done.map((m) => `${m.title}${m.xp ? ` (+${m.xp} XP)` : ""}`).join(", ")}${up ? ` · Naik ke Level ${up.level}: ${up.title}!` : ""}`);
      }
    })();
  }, [load]);

  const shown = useMemo(() => {
    switch (tab) {
      case "daily":
        return missions.filter((m) => m.type === "daily" && m.status !== "expired" && m.window_end && new Date(m.window_end) > new Date());
      case "weekly":
        return missions.filter((m) => m.type === "weekly" && m.status !== "expired" && m.window_end && new Date(m.window_end) > new Date());
      case "custom":
        return missions.filter((m) => ["challenge", "boss", "quiz"].includes(m.type) && m.status === "active");
      default:
        return missions.filter((m) => m.status !== "active" || (m.window_end && new Date(m.window_end) <= new Date())).slice(0, 60);
    }
  }, [missions, tab]);

  const stats = useMemo(() => {
    const done = missions.filter((m) => m.status === "completed");
    return { done: done.length, xp: done.reduce((s, m) => s + m.xp_reward, 0), active: missions.filter((m) => m.status === "active").length };
  }, [missions]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return setFormError("Judul misi wajib diisi.");
    if (title.length > 120) return setFormError("Judul maksimal 120 karakter.");
    if (!Number.isInteger(form.target) || form.target < 1 || form.target > 100) return setFormError("Target harus antara 1 dan 100.");
    setSaving(true);
    const { error: err } = await createClient().from("missions").insert({
      type: form.type,
      title,
      description: form.description.trim(),
      difficulty: form.difficulty,
      target_value: form.target,
      xp_reward: xpFor(form.type, form.difficulty),
      metric: form.metric,
      source_category_id: form.categoryId || null,
    });
    setSaving(false);
    if (err) return setFormError("Gagal membuat misi.");
    setOpen(false);
    setForm({ ...form, title: "", description: "" });
    setTab("custom");
    await syncMissions(createClient());
    await load();
  }

  async function remove(id: string) {
    const { error: err } = await createClient().from("missions").delete().eq("id", id);
    if (err) return setError("Gagal menghapus misi.");
    setMissions((p) => p.filter((m) => m.id !== id));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Misi</h1>
          <p className="text-sm text-muted">Selesaikan misi, kumpulkan XP, tukar dengan reward</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/misi/quiz" className="btn-ghost"><ListChecks className="h-4 w-4" /> Quiz</Link>
          <Link href="/rewards" className="btn-ghost"><Gift className="h-4 w-4" /> Reward Shop</Link>
          <button type="button" className="btn-primary" onClick={() => { setFormError(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Misi Baru
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4"><p className="text-xs text-muted">Misi aktif</p><p className="font-display text-2xl font-bold">{stats.active}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Selesai</p><p className="font-display text-2xl font-bold">{stats.done}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">XP dari misi</p><p className="font-display text-2xl font-bold text-gold">{stats.xp}</p></div>
      </div>

      {notice && <p role="status" className="card border-success/40 p-3 text-sm text-success">{notice}</p>}
      {error && <p role="alert" className="card border-danger/40 p-3 text-sm text-danger">{error}</p>}

      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn("whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition", tab === t.key ? "border-primary/40 bg-primary/15 text-primary" : "border-line/20 text-muted hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Memuat misi…</p>
      ) : shown.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-muted">
          {tab === "custom" ? "Belum ada tantangan. Buat Challenge atau Boss Challenge sendiri lewat tombol Misi Baru." : tab === "history" ? "Belum ada riwayat misi." : "Tidak ada misi untuk periode ini."}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((m) => {
            const pct = Math.min(100, Math.round((m.progress_value / m.target_value) * 100));
            const left = m.status === "active" ? timeLeft(m.window_end) : null;
            const custom = ["challenge", "boss", "quiz"].includes(m.type);
            return (
              <li key={m.id} className={cn("card p-4", m.status === "completed" && "border-success/30")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", m.type === "boss" ? "bg-danger/15 text-danger" : "bg-primary/15 text-primary")}>
                        {m.type === "boss" && <Skull className="h-3 w-3" />}{TYPE_LABEL[m.type]}
                      </span>
                      {m.difficulty && <span className="rounded-full bg-surface2/70 px-2 py-0.5 text-muted">{DIFF_LABEL[m.difficulty]}</span>}
                      {left && <span className="inline-flex items-center gap-1 text-muted"><Clock className="h-3 w-3" />{left}</span>}
                    </div>
                    <h3 className="font-display font-bold">{m.title}</h3>
                    {m.description && <p className="mt-0.5 text-sm text-muted">{m.description}</p>}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-gold"><Zap className="h-3.5 w-3.5" />{m.xp_reward}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={cn("h-full rounded-full", m.status === "completed" ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                  <span>{m.progress_value}/{m.target_value} · {METRICS.find((x) => x.value === m.metric)?.label}</span>
                  {m.status === "completed" ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />Selesai</span>
                    : m.status === "expired" || (m.window_end && new Date(m.window_end) <= new Date()) ? <span>Kedaluwarsa</span> : null}
                </div>
                {custom && m.status === "active" && (
                  <div className="mt-2 text-right">
                    <ConfirmButton onConfirm={() => remove(m.id)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger" message="Hapus misi ini?">
                      <Trash2 className="h-3.5 w-3.5" /> Hapus
                    </ConfirmButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="flex items-center gap-2 text-xs text-muted"><Swords className="h-3.5 w-3.5" /> Progres dihitung otomatis dari aktivitasmu. Maksimal 300 XP dari misi per hari.</p>

      <Modal open={open} title="Misi Baru" onClose={() => setOpen(false)}>
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["challenge", "boss", "quiz"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", form.type === t ? "border-primary bg-primary/15 text-primary" : "border-line/20 text-muted")}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div><label className="label" htmlFor="m-title">Judul</label><input id="m-title" className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Mis. Tuntaskan Bab Statistik" /></div>
          <div><label className="label" htmlFor="m-desc">Deskripsi (opsional)</label><textarea id="m-desc" className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="m-met">Yang dihitung</label>
              <select id="m-met" className="input" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as Mission["metric"] })}>
                {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select></div>
            <div><label className="label" htmlFor="m-tg">Target</label><input id="m-tg" type="number" min={1} max={100} className="input" value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value) })} /></div>
            <div><label className="label" htmlFor="m-df">Tingkat kesulitan</label>
              <select id="m-df" className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as keyof typeof BASE_XP })}>
                {(Object.keys(DIFF_LABEL) as (keyof typeof DIFF_LABEL)[]).map((d) => <option key={d} value={d}>{DIFF_LABEL[d]}</option>)}
              </select></div>
            <div><label className="label" htmlFor="m-ct">Kategori (opsional)</label>
              <select id="m-ct" className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Semua kategori</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>
          <p className="text-sm text-muted">Hadiah: <span className="font-semibold text-gold">{xpFor(form.type, form.difficulty)} XP</span> (ditentukan otomatis dari jenis dan kesulitan). Hanya aktivitas setelah misi dibuat yang dihitung.</p>
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Buat Misi"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
