"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Loader2, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { textToHtml } from "@/lib/sanitize";
import { Modal, ConfirmButton } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type Note = { id: string; title: string; body: string; category: string | null; tags: string[]; converted_lesson_id: string | null; created_at: string; updated_at: string };
type Draft = { id?: string; title: string; body: string; category: string; tags: string };
type Mod = { id: string; name: string; subject_id: string };
type Sub = { id: string; name: string; category_id: string };
type Cat = { id: string; name: string };

const fmt = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export function NotesClient() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // konversi ke materi
  const [convert, setConvert] = useState<Note | null>(null);
  const [tree, setTree] = useState<{ cats: Cat[]; subs: Sub[]; mods: Mod[] } | null>(null);
  const [catId, setCatId] = useState("");
  const [subId, setSubId] = useState("");
  const [modId, setModId] = useState("");
  const [convertError, setConvertError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("quick_notes").select("*").order("updated_at", { ascending: false });
    setError(error ? "Gagal memuat catatan." : null);
    setNotes((data as Note[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => Array.from(new Set(notes.map((n) => n.category).filter(Boolean) as string[])).sort(), [notes]);
  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((n) => n.tags))).sort(), [notes]);

  const shown = notes.filter((n) => {
    const q = query.trim().toLowerCase();
    return (
      (catFilter === "all" || n.category === catFilter) &&
      (tagFilter === "all" || n.tags.includes(tagFilter)) &&
      (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
    );
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title && !body) return setFormError("Isi judul atau catatan terlebih dahulu.");
    if (title.length > 200) return setFormError("Judul maksimal 200 karakter.");
    const tags = Array.from(new Set(draft.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 12);
    const payload = { title: title || body.slice(0, 40), body, category: draft.category.trim() || null, tags };

    setSaving(true);
    const supabase = createClient();
    const { error } = draft.id ? await supabase.from("quick_notes").update(payload).eq("id", draft.id) : await supabase.from("quick_notes").insert(payload);
    setSaving(false);
    if (error) return setFormError("Gagal menyimpan catatan.");
    setDraft(null);
    await load();
  }

  async function remove(id: string) {
    const { error } = await createClient().from("quick_notes").delete().eq("id", id);
    if (error) return setError("Gagal menghapus catatan.");
    setNotes((p) => p.filter((n) => n.id !== id));
  }

  async function openConvert(n: Note) {
    setConvertError(null);
    setConvert(n);
    setCatId("");
    setSubId("");
    setModId("");
    const supabase = createClient();
    const [c, s, m] = await Promise.all([
      supabase.from("categories").select("id,name").order("position"),
      supabase.from("subjects").select("id,name,category_id").order("position"),
      supabase.from("modules").select("id,name,subject_id").order("position"),
    ]);
    setTree({ cats: (c.data as Cat[]) ?? [], subs: (s.data as Sub[]) ?? [], mods: (m.data as Mod[]) ?? [] });
  }

  async function doConvert() {
    if (!convert) return;
    if (!modId) return setConvertError("Pilih modul tujuan terlebih dahulu.");
    setConverting(true);
    const supabase = createClient();
    const { data: lesson, error } = await supabase
      .from("lessons")
      .insert({ module_id: modId, title: convert.title || "Catatan", description: "Dari Quick Notes", content_html: textToHtml(convert.body) })
      .select("id")
      .single();
    if (error || !lesson) {
      setConverting(false);
      return setConvertError("Gagal membuat materi.");
    }
    await supabase.from("quick_notes").update({ converted_lesson_id: (lesson as { id: string }).id }).eq("id", convert.id);
    setConverting(false);
    setConvert(null);
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Quick Notes</h1>
          <p className="text-sm text-muted">Tangkap ide cepat, ubah jadi materi kapan saja</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => { setFormError(null); setDraft({ title: "", body: "", category: "", tags: "" }); }}>
          <Plus className="h-4 w-4" /> Catatan Baru
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Cari catatan…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cari catatan" />
        </div>
        <select className="input sm:w-44" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filter kategori">
          <option value="all">Semua kategori</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input sm:w-40" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter tag">
          <option value="all">Semua tag</option>
          {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Memuat…</p>
      ) : shown.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-muted">{notes.length === 0 ? "Belum ada catatan. Klik Catatan Baru untuk memulai." : "Tidak ada catatan yang cocok."}</div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((n) => (
            <li key={n.id} className="card card-hover flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 truncate font-display font-bold">{n.title || "Tanpa judul"}</h3>
                <div className="flex shrink-0">
                  <button type="button" aria-label="Edit catatan" className="rounded-lg p-2 text-muted hover:bg-surface2/60 hover:text-ink" onClick={() => { setFormError(null); setDraft({ id: n.id, title: n.title, body: n.body, category: n.category ?? "", tags: n.tags.join(", ") }); }}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <ConfirmButton message="Hapus catatan ini?" onConfirm={() => remove(n.id)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="h-4 w-4" aria-label="Hapus catatan" />
                  </ConfirmButton>
                </div>
              </div>
              <p className="line-clamp-5 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {n.category && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{n.category}</span>}
                {n.tags.map((t) => (
                  <button key={t} type="button" onClick={() => setTagFilter(t)} className="inline-flex items-center gap-0.5 rounded-full bg-line/15 px-2 py-0.5 text-[10px] text-muted hover:text-ink">
                    <Tag className="h-2.5 w-2.5" />{t}
                  </button>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted">{fmt(n.updated_at)}</span>
                {n.converted_lesson_id ? (
                  <Link href={`/materi/lesson/${n.converted_lesson_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-success hover:underline">
                    <BookOpenCheck className="h-3.5 w-3.5" /> Sudah jadi materi
                  </Link>
                ) : (
                  <button type="button" onClick={() => openConvert(n)} className="text-xs font-semibold text-primary hover:underline">
                    Ubah jadi materi
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!draft} title={draft?.id ? "Edit Catatan" : "Catatan Baru"} onClose={() => setDraft(null)}>
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="label" htmlFor="n-title">Judul</label>
              <input id="n-title" className="input" maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="n-body">Catatan</label>
              <textarea id="n-body" className="input min-h-36" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="n-cat">Kategori</label>
                <input id="n-cat" className="input" list="note-cats" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="mis. Ide, Rangkuman" />
                <datalist id="note-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="label" htmlFor="n-tags">Tag (pisahkan koma)</label>
                <input id="n-tags" className="input" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="excel, finance" />
              </div>
            </div>
            {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Batal</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!convert} title="Ubah catatan jadi materi" onClose={() => setConvert(null)}>
        {!tree ? (
          <p className="py-6 text-center text-sm text-muted">Memuat…</p>
        ) : tree.mods.length === 0 ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted">Belum ada modul tujuan. Buat dulu Kategori → Subject → Modul di halaman Materi.</p>
            <Link href="/materi" className="btn-primary">Buka Materi</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted">Catatan &quot;{convert?.title}&quot; akan menjadi lesson baru di modul yang dipilih. Catatan aslinya tetap tersimpan.</p>
            <div>
              <label className="label" htmlFor="c-cat">Kategori</label>
              <select id="c-cat" className="input" value={catId} onChange={(e) => { setCatId(e.target.value); setSubId(""); setModId(""); }}>
                <option value="">Pilih kategori</option>
                {tree.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="c-sub">Subject</label>
              <select id="c-sub" className="input" value={subId} disabled={!catId} onChange={(e) => { setSubId(e.target.value); setModId(""); }}>
                <option value="">Pilih subject</option>
                {tree.subs.filter((s) => s.category_id === catId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="c-mod">Modul</label>
              <select id="c-mod" className="input" value={modId} disabled={!subId} onChange={(e) => setModId(e.target.value)}>
                <option value="">Pilih modul</option>
                {tree.mods.filter((m) => m.subject_id === subId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {convertError && <p role="alert" className={cn("text-sm text-danger")}>{convertError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConvert(null)}>Batal</button>
              <button type="button" disabled={converting} className="btn-primary" onClick={doConvert}>
                {converting && <Loader2 className="h-4 w-4 animate-spin" />} Buat Materi
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
