"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, ChevronDown, ChevronRight, FilePlus2, FolderPlus, Loader2, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, ConfirmButton } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type Cat = { id: string; name: string; position: number };
type Sub = { id: string; category_id: string; name: string; description: string };
type Mod = { id: string; subject_id: string; name: string; description: string };
type Les = { id: string; module_id: string; title: string; status: "not_started" | "in_progress" | "completed"; bookmarked: boolean };

type Kind = "category" | "subject" | "module" | "lesson";
type Form = { kind: Kind; id?: string; parentId?: string; name: string; description: string };

const DEFAULT_CATEGORIES = [
  "Business & Management",
  "Finance & Accounting",
  "Technology & Digital",
  "Data Analytics",
  "Languages",
  "Science",
  "History & Culture",
  "Personal Development",
  "Other Knowledge",
];

const LABEL: Record<Kind, string> = { category: "Kategori", subject: "Subject", module: "Modul", lesson: "Lesson" };

const STATUS_STYLE = {
  not_started: { label: "Not Started", cls: "bg-line/15 text-muted" },
  in_progress: { label: "In Progress", cls: "bg-primary/15 text-primary" },
  completed: { label: "Completed", cls: "bg-success/15 text-success" },
} as const;

export function MateriClient() {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [lessons, setLessons] = useState<Les[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [c, s, m, l] = await Promise.all([
      supabase.from("categories").select("id,name,position").order("position").order("created_at"),
      supabase.from("subjects").select("id,category_id,name,description").order("position").order("created_at"),
      supabase.from("modules").select("id,subject_id,name,description").order("position").order("created_at"),
      supabase.from("lessons").select("id,module_id,title,status,bookmarked").order("position").order("created_at"),
    ]);
    if (c.error || s.error || m.error || l.error) setError("Gagal memuat materi. Pastikan migrasi database sudah dijalankan.");
    else setError(null);
    setCats((c.data as Cat[]) ?? []);
    setSubs((s.data as Sub[]) ?? []);
    setMods((m.data as Mod[]) ?? []);
    setLessons((l.data as Les[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // peta untuk progres per kategori & breadcrumb pencarian
  const maps = useMemo(() => {
    const subCat = new Map(subs.map((s) => [s.id, s.category_id]));
    const modSub = new Map(mods.map((m) => [m.id, m.subject_id]));
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const subName = new Map(subs.map((s) => [s.id, s.name]));
    const modName = new Map(mods.map((m) => [m.id, m.name]));
    const progress = new Map<string, { done: number; total: number }>();
    for (const l of lessons) {
      const cid = subCat.get(modSub.get(l.module_id) ?? "");
      if (!cid) continue;
      const p = progress.get(cid) ?? { done: 0, total: 0 };
      p.total += 1;
      if (l.status === "completed") p.done += 1;
      progress.set(cid, p);
    }
    return { subCat, modSub, catName, subName, modName, progress };
  }, [cats, subs, mods, lessons]);

  function openForm(f: Form) {
    setFormError(null);
    setForm(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    if (!name) return setFormError(`Nama ${LABEL[form.kind].toLowerCase()} wajib diisi.`);
    if (name.length > (form.kind === "lesson" ? 200 : form.kind === "category" ? 120 : 160)) return setFormError("Nama terlalu panjang.");

    setSaving(true);
    const supabase = createClient();
    let err: unknown = null;
    let newLessonId: string | null = null;

    if (form.kind === "category") {
      const r = form.id
        ? await supabase.from("categories").update({ name }).eq("id", form.id)
        : await supabase.from("categories").insert({ name, position: cats.length });
      err = r.error;
      if (r.error?.code === "23505") {
        setSaving(false);
        return setFormError("Nama kategori sudah dipakai.");
      }
    } else if (form.kind === "subject") {
      const r = form.id
        ? await supabase.from("subjects").update({ name, description: form.description.trim() }).eq("id", form.id)
        : await supabase.from("subjects").insert({ category_id: form.parentId, name, description: form.description.trim(), position: subs.filter((s) => s.category_id === form.parentId).length });
      err = r.error;
    } else if (form.kind === "module") {
      const r = form.id
        ? await supabase.from("modules").update({ name, description: form.description.trim() }).eq("id", form.id)
        : await supabase.from("modules").insert({ subject_id: form.parentId, name, description: form.description.trim(), position: mods.filter((m) => m.subject_id === form.parentId).length });
      err = r.error;
    } else {
      const r = form.id
        ? await supabase.from("lessons").update({ title: name, description: form.description.trim() }).eq("id", form.id)
        : await supabase
            .from("lessons")
            .insert({ module_id: form.parentId, title: name, description: form.description.trim(), position: lessons.filter((l) => l.module_id === form.parentId).length })
            .select("id")
            .single();
      err = r.error;
      if (!form.id && r.data) newLessonId = (r.data as { id: string }).id;
    }

    setSaving(false);
    if (err) return setFormError("Gagal menyimpan. Coba lagi.");
    if (form.parentId) setOpen((p) => new Set(p).add(form.parentId!));
    setForm(null);
    if (newLessonId) return router.push(`/materi/lesson/${newLessonId}`);
    await load();
  }

  async function remove(kind: Kind, id: string) {
    const supabase = createClient();
    const table = kind === "category" ? "categories" : kind === "subject" ? "subjects" : kind === "module" ? "modules" : "lessons";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return setError("Gagal menghapus.");
    await load();
  }

  async function seedDefaults() {
    const supabase = createClient();
    const { error } = await supabase.from("categories").insert(DEFAULT_CATEGORIES.map((name, i) => ({ name, position: i })));
    if (error) return setError("Gagal menambahkan kategori contoh.");
    await load();
  }

  const q = query.trim().toLowerCase();
  const results = q
    ? lessons.filter((l) => l.title.toLowerCase().includes(q))
    : [];

  const confirmMsg = (what: string) => `Hapus ${what}? Semua isi di dalamnya (subject, modul, lesson, catatan) ikut terhapus dan tidak bisa dikembalikan.`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Materi</h1>
          <p className="text-sm text-muted">Knowledge Center: Kategori → Subject → Modul → Lesson</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => openForm({ kind: "category", name: "", description: "" })}>
          <FolderPlus className="h-4 w-4" /> Tambah Kategori
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input pl-10" placeholder="Cari lesson…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cari lesson" />
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Memuat…</p>
      ) : q ? (
        <section className="card p-4" aria-label="Hasil pencarian">
          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Tidak ada lesson yang cocok.</p>
          ) : (
            <ul className="divide-y divide-line/10">
              {results.map((l) => {
                const sid = maps.modSub.get(l.module_id) ?? "";
                return (
                  <li key={l.id}>
                    <Link href={`/materi/lesson/${l.id}`} className="flex flex-col gap-0.5 px-2 py-2.5 hover:bg-surface2/40">
                      <span className="text-sm font-semibold">{l.title}</span>
                      <span className="text-xs text-muted">
                        {maps.catName.get(maps.subCat.get(sid) ?? "")} › {maps.subName.get(sid)} › {maps.modName.get(l.module_id)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : cats.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Sparkles className="h-7 w-7 text-accent" />
          <p className="font-display text-lg font-bold">Belum ada kategori</p>
          <p className="max-w-md text-sm text-muted">Mulai dengan kategori contoh (bisa diubah atau dihapus kapan saja), atau buat kategorimu sendiri.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={seedDefaults}>Tambahkan 9 kategori contoh</button>
            <button type="button" className="btn-ghost" onClick={() => openForm({ kind: "category", name: "", description: "" })}>Buat sendiri</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {cats.map((c) => {
            const p = maps.progress.get(c.id) ?? { done: 0, total: 0 };
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            const isOpen = open.has(c.id);
            const catSubs = subs.filter((s) => s.category_id === c.id);
            return (
              <section key={c.id} className="card overflow-hidden">
                <div className="flex items-center gap-2 p-4">
                  <button type="button" onClick={() => toggle(c.id)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {isOpen ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-bold">{c.name}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-line/15">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="shrink-0 text-[11px] text-muted">{p.done}/{p.total} selesai</span>
                      </div>
                    </div>
                  </button>
                  <IconBtn label="Tambah subject" onClick={() => openForm({ kind: "subject", parentId: c.id, name: "", description: "" })}><Plus className="h-4 w-4" /></IconBtn>
                  <IconBtn label="Edit kategori" onClick={() => openForm({ kind: "category", id: c.id, name: c.name, description: "" })}><Pencil className="h-4 w-4" /></IconBtn>
                  <ConfirmButton message={confirmMsg(`kategori "${c.name}"`)} onConfirm={() => remove("category", c.id)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="h-4 w-4" aria-label="Hapus kategori" />
                  </ConfirmButton>
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-line/10 bg-bg/30 p-4">
                    {catSubs.length === 0 && <p className="text-sm text-muted">Belum ada subject. Klik + untuk menambahkan.</p>}
                    {catSubs.map((s) => {
                      const sOpen = open.has(s.id);
                      const sMods = mods.filter((m) => m.subject_id === s.id);
                      return (
                        <div key={s.id} className="rounded-xl border border-line/10 bg-surface/60">
                          <div className="flex items-center gap-1 p-3">
                            <button type="button" onClick={() => toggle(s.id)} aria-expanded={sOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                              {sOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                              <span className="truncate text-sm font-semibold">{s.name}</span>
                              <span className="shrink-0 text-[11px] text-muted">{sMods.length} modul</span>
                            </button>
                            <IconBtn label="Tambah modul" onClick={() => openForm({ kind: "module", parentId: s.id, name: "", description: "" })}><Plus className="h-4 w-4" /></IconBtn>
                            <IconBtn label="Edit subject" onClick={() => openForm({ kind: "subject", id: s.id, name: s.name, description: s.description })}><Pencil className="h-4 w-4" /></IconBtn>
                            <ConfirmButton message={confirmMsg(`subject "${s.name}"`)} onConfirm={() => remove("subject", s.id)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger">
                              <Trash2 className="h-4 w-4" aria-label="Hapus subject" />
                            </ConfirmButton>
                          </div>
                          {sOpen && (
                            <div className="space-y-2 border-t border-line/10 p-3">
                              {s.description && <p className="text-xs text-muted">{s.description}</p>}
                              {sMods.length === 0 && <p className="text-xs text-muted">Belum ada modul.</p>}
                              {sMods.map((m) => {
                                const mOpen = open.has(m.id);
                                const mLessons = lessons.filter((l) => l.module_id === m.id);
                                return (
                                  <div key={m.id} className="rounded-lg border border-line/10">
                                    <div className="flex items-center gap-1 px-2.5 py-2">
                                      <button type="button" onClick={() => toggle(m.id)} aria-expanded={mOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                        {mOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                        <span className="truncate text-sm">{m.name}</span>
                                        <span className="shrink-0 text-[11px] text-muted">{mLessons.length} lesson</span>
                                      </button>
                                      <IconBtn label="Tambah lesson" onClick={() => openForm({ kind: "lesson", parentId: m.id, name: "", description: "" })}><FilePlus2 className="h-4 w-4" /></IconBtn>
                                      <IconBtn label="Edit modul" onClick={() => openForm({ kind: "module", id: m.id, name: m.name, description: m.description })}><Pencil className="h-4 w-4" /></IconBtn>
                                      <ConfirmButton message={confirmMsg(`modul "${m.name}"`)} onConfirm={() => remove("module", m.id)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger">
                                        <Trash2 className="h-4 w-4" aria-label="Hapus modul" />
                                      </ConfirmButton>
                                    </div>
                                    {mOpen && (
                                      <ul className="border-t border-line/10">
                                        {mLessons.length === 0 && <li className="px-3 py-2 text-xs text-muted">Belum ada lesson.</li>}
                                        {mLessons.map((l) => (
                                          <li key={l.id}>
                                            <Link href={`/materi/lesson/${l.id}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface2/40">
                                              {l.bookmarked && <BookMarked className="h-3.5 w-3.5 shrink-0 text-gold" aria-label="Bookmark" />}
                                              <span className="min-w-0 flex-1 truncate">{l.title}</span>
                                              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[l.status].cls)}>{STATUS_STYLE[l.status].label}</span>
                                            </Link>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Modal open={!!form} title={form ? `${form.id ? "Edit" : "Tambah"} ${LABEL[form.kind]}` : ""} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="f-name">{form.kind === "lesson" ? "Judul lesson" : `Nama ${LABEL[form.kind].toLowerCase()}`}</label>
              <input id="f-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            {form.kind !== "category" && (
              <div>
                <label className="label" htmlFor="f-desc">Deskripsi (opsional)</label>
                <textarea id="f-desc" className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            )}
            {form.kind === "lesson" && !form.id && <p className="text-xs text-muted">Setelah dibuat, kamu langsung diarahkan ke editor untuk mengisi materinya.</p>}
            {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-lg p-2 text-muted transition hover:bg-surface2/60 hover:text-ink">
      {children}
    </button>
  );
}
