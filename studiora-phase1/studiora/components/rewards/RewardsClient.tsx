"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Gem, Gift, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, ConfirmButton } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type Reward = { id: string; name: string; description: string; cost_xp: number; available: boolean };
type Tx = { id: string; reward_name: string; cost_xp: number; created_at: string };
type Draft = { id?: string; name: string; description: string; cost: number; available: boolean };

const fmt = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export function RewardsClient() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [history, setHistory] = useState<Tx[]>([]);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [r, h, p] = await Promise.all([
      supabase.from("rewards").select("id,name,description,cost_xp,available").order("cost_xp"),
      supabase.from("reward_transactions").select("id,reward_name,cost_xp,created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("profiles").select("available_xp").maybeSingle(),
    ]);
    if (r.error || h.error) setError("Gagal memuat Reward Shop.");
    setRewards((r.data as Reward[]) ?? []);
    setHistory((h.data as Tx[]) ?? []);
    setAvailable((p.data as { available_xp: number } | null)?.available_xp ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setFormError("Nama reward wajib diisi.");
    if (name.length > 120) return setFormError("Nama maksimal 120 karakter.");
    if (!Number.isInteger(draft.cost) || draft.cost < 1 || draft.cost > 100000) return setFormError("Harga harus bilangan bulat antara 1 dan 100.000 XP.");
    setSaving(true);
    const payload = { name, description: draft.description.trim(), cost_xp: draft.cost, available: draft.available };
    const supabase = createClient();
    const { error: err } = draft.id ? await supabase.from("rewards").update(payload).eq("id", draft.id) : await supabase.from("rewards").insert(payload);
    setSaving(false);
    if (err) return setFormError("Gagal menyimpan reward.");
    setDraft(null);
    await load();
  }

  async function remove(id: string) {
    const { error: err } = await createClient().from("rewards").delete().eq("id", id);
    if (err) return setError("Gagal menghapus reward.");
    await load();
  }

  async function redeem(r: Reward) {
    setBusyId(r.id);
    setError(null);
    setNotice(null);
    const { error: err } = await createClient().rpc("redeem_reward", { p_reward_id: r.id });
    setBusyId(null);
    if (err) {
      const m = err.message ?? "";
      return setError(m.includes("tidak cukup") ? "Available XP belum cukup untuk reward ini." : m.includes("tidak tersedia") ? "Reward ini sedang tidak tersedia." : "Gagal menukar reward.");
    }
    setNotice(`Reward ditukar: ${r.name} (-${r.cost_xp} XP). Selamat menikmati!`);
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Reward Shop</h1>
          <p className="text-sm text-muted">Tukar XP dengan hadiah yang kamu tentukan sendiri</p>
        </div>
        <div className="flex gap-2">
          <Link href="/misi" className="btn-ghost">Misi</Link>
          <button type="button" className="btn-primary" onClick={() => { setFormError(null); setDraft({ name: "", description: "", cost: 100, available: true }); }}>
            <Plus className="h-4 w-4" /> Reward Baru
          </button>
        </div>
      </div>

      <div className="card flex items-center gap-4 p-5">
        <span className="rounded-xl bg-accent/15 p-3 text-accent"><Gem className="h-6 w-6" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Available XP</p>
          <p className="font-display text-3xl font-extrabold">{available.toLocaleString("id-ID")}</p>
        </div>
        <p className="ml-auto hidden max-w-xs text-right text-xs text-muted sm:block">Menukar reward hanya mengurangi Available XP. Total XP dan Level kamu tidak berkurang.</p>
      </div>

      {notice && <p role="status" className="card border-success/40 p-3 text-sm text-success">{notice}</p>}
      {error && <p role="alert" className="card border-danger/40 p-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>
      ) : rewards.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Gift className="h-8 w-8 text-muted" />
          <p className="font-display font-bold">Belum ada reward</p>
          <p className="max-w-sm text-sm text-muted">Buat hadiah untuk dirimu sendiri, misalnya “Nonton 1 episode” atau “Jajan boba”, lalu tentukan harga XP-nya.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rewards.map((r) => {
            const can = r.available && available >= r.cost_xp;
            return (
              <li key={r.id} className={cn("card flex flex-col p-4", !r.available && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-bold">{r.name}</h3>
                  <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-0.5 text-sm font-semibold text-gold">{r.cost_xp.toLocaleString("id-ID")} XP</span>
                </div>
                {r.description && <p className="mt-1 text-sm text-muted">{r.description}</p>}
                {!r.available && <p className="mt-1 text-xs text-muted">Sedang tidak tersedia</p>}
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <ConfirmButton onConfirm={() => redeem(r)} className={cn("btn flex-1", can ? "bg-primary text-white hover:brightness-110" : "border border-line/20 text-muted")} message={`Tukar “${r.name}” dengan ${r.cost_xp} XP?`}>
                    {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                    {!r.available ? "Tidak tersedia" : can ? "Tukar" : `Kurang ${(r.cost_xp - available).toLocaleString("id-ID")} XP`}
                  </ConfirmButton>
                  <button type="button" aria-label="Ubah reward" className="rounded-lg p-2 text-muted hover:bg-surface2/60 hover:text-ink" onClick={() => { setFormError(null); setDraft({ id: r.id, name: r.name, description: r.description, cost: r.cost_xp, available: r.available }); }}><Pencil className="h-4 w-4" /></button>
                  <ConfirmButton onConfirm={() => remove(r.id)} className="rounded-lg p-2 text-muted hover:bg-surface2/60 hover:text-danger" message="Hapus reward ini?"><Trash2 className="h-4 w-4" /><span className="sr-only">Hapus</span></ConfirmButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="card p-5" aria-label="Riwayat penukaran">
        <h2 className="font-display font-bold">Riwayat penukaran</h2>
        {history.length === 0 ? <p className="mt-2 text-sm text-muted">Belum ada reward yang ditukar.</p> : (
          <ul className="mt-3 divide-y divide-line/10">
            {history.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span>{t.reward_name}<span className="ml-2 text-xs text-muted">{fmt(t.created_at)}</span></span>
                <span className="text-muted">-{t.cost_xp} XP</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={!!draft} title={draft?.id ? "Ubah Reward" : "Reward Baru"} onClose={() => setDraft(null)}>
        {draft && (
          <form onSubmit={save} className="space-y-3">
            <div><label className="label" htmlFor="r-name">Nama</label><input id="r-name" className="input" maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="r-desc">Deskripsi (opsional)</label><textarea id="r-desc" className="input" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div><label className="label" htmlFor="r-cost">Harga (XP)</label><input id="r-cost" type="number" min={1} max={100000} className="input" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.available} onChange={(e) => setDraft({ ...draft, available: e.target.checked })} /> Tersedia untuk ditukar</label>
            {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Batal</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
