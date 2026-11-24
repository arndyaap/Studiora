"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, ExternalLink, FileText, Loader2, Paperclip, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FILE_TYPES, uploadStudyFile } from "@/lib/upload";
import { Modal, ConfirmButton } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type Kind = "ebook" | "article" | "paper" | "website" | "resource" | "saved" | "favorite_link";
type Item = {
  id: string;
  kind: Kind;
  title: string;
  url: string | null;
  file_path: string | null;
  description: string;
  bookmarked: boolean;
  created_at: string;
};

const KINDS: { id: Kind; label: string }[] = [
  { id: "ebook", label: "E-books" },
  { id: "article", label: "Articles" },
  { id: "paper", label: "Research Papers" },
  { id: "website", label: "Website References" },
  { id: "resource", label: "Learning Resources" },
  { id: "saved", label: "Saved Materials" },
  { id: "favorite_link", label: "Favorite Links" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label])) as Record<Kind, string>;

type Draft = { id?: string; kind: Kind; title: string; url: string; description: string; file_path: string | null; fileName: string | null };
const empty: Draft = { kind: "website", title: "", url: "", description: "", file_path: null, fileName: null };

export function LibraryClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("library_items").select("*").order("created_at", { ascending: false });
    setError(error ? "Gagal memuat Library." : null);
    setItems((data as Item[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (kindFilter === "all" || i.kind === kindFilter) &&
        (!onlyBookmarked || i.bookmarked) &&
        (!q || i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || (i.url ?? "").toLowerCase().includes(q)),
    );
  }, [items, kindFilter, onlyBookmarked, query]);

  const fileUrl = (path: string) => createClient().storage.from("study-files").getPublicUrl(path).data.publicUrl;

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !draft) return;
    setFormError(null);
    setUploading(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const r = await uploadStudyFile(supabase, auth.user?.id ?? "", file, FILE_TYPES);
    setUploading(false);
    if (!r.ok) return setFormError(r.error);
    setDraft({ ...draft, file_path: r.path, fileName: r.name, title: draft.title || r.name.replace(/\.[^.]+$/, "") });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const title = draft.title.trim();
    const url = draft.url.trim();
    if (!title) return setFormError("Judul wajib diisi.");
    if (url && !/^https?:\/\//i.test(url)) return setFormError("URL harus diawali http:// atau https://");
    if (!url && !draft.file_path) return setFormError("Isi URL atau unggah file.");

    const payload = { kind: draft.kind, title, url: url || null, file_path: draft.file_path, description: draft.description.trim() };
    setSaving(true);
    const supabase = createClient();
    const { error } = draft.id ? await supabase.from("library_items").update(payload).eq("id", draft.id) : await supabase.from("library_items").insert(payload);
    setSaving(false);
    if (error) return setFormError("Gagal menyimpan. Coba lagi.");
    setDraft(null);
    await load();
  }

  async function toggleBookmark(i: Item) {
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, bookmarked: !i.bookmarked } : x)));
    const { error } = await createClient().from("library_items").update({ bookmarked: !i.bookmarked }).eq("id", i.id);
    if (error) {
      setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, bookmarked: i.bookmarked } : x)));
      setError("Gagal menyimpan bookmark.");
    }
  }

  async function remove(i: Item) {
    const supabase = createClient();
    const { error } = await supabase.from("library_items").delete().eq("id", i.id);
    if (error) return setError("Gagal menghapus.");
    if (i.file_path) await supabase.storage.from("study-files").remove([i.file_path]);
    setItems((prev) => prev.filter((x) => x.id !== i.id));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Library</h1>
          <p className="text-sm text-muted">Arsip referensi dan sumber belajar</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => { setFormError(null); setDraft(empty); }}>
          <Plus className="h-4 w-4" /> Tambah Referensi
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Cari judul, deskripsi, atau URL…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cari di Library" />
        </div>
        <button type="button" aria-pressed={onlyBookmarked} onClick={() => setOnlyBookmarked(!onlyBookmarked)} className={cn("btn-ghost", onlyBookmarked && "border-gold/50 text-gold")}>
          <BookMarked className="h-4 w-4" /> Bookmark
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter kategori">
        {[{ id: "all" as const, label: "Semua" }, ...KINDS].map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kindFilter === k.id}
            onClick={() => setKindFilter(k.id)}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition", kindFilter === k.id ? "border-primary bg-primary/15 text-primary" : "border-line/20 text-muted hover:text-ink")}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Memuat…</p>
      ) : shown.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-muted">
          {items.length === 0 ? "Library masih kosong. Simpan artikel, e-book, atau tautan favoritmu di sini." : "Tidak ada item yang cocok dengan filter."}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((i) => (
            <li key={i.id} className="card card-hover flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">{KIND_LABEL[i.kind]}</span>
                  <h3 className="mt-1.5 truncate font-display font-bold">{i.title}</h3>
                </div>
                <div className="flex shrink-0">
                  <button type="button" onClick={() => toggleBookmark(i)} aria-pressed={i.bookmarked} aria-label="Bookmark" className={cn("rounded-lg p-2 hover:bg-surface2/60", i.bookmarked ? "text-gold" : "text-muted")}>
                    <BookMarked className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Edit" className="rounded-lg p-2 text-muted hover:bg-surface2/60 hover:text-ink" onClick={() => { setFormError(null); setDraft({ id: i.id, kind: i.kind, title: i.title, url: i.url ?? "", description: i.description, file_path: i.file_path, fileName: i.file_path ? i.file_path.split("/").pop()!.slice(37) : null }); }}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <ConfirmButton message={`Hapus "${i.title}" dari Library?`} onConfirm={() => remove(i)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="h-4 w-4" aria-label="Hapus" />
                  </ConfirmButton>
                </div>
              </div>
              {i.description && <p className="line-clamp-3 text-sm text-muted">{i.description}</p>}
              <div className="mt-auto flex flex-wrap gap-3 pt-1 text-sm">
                {i.url && (
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> Buka tautan
                  </a>
                )}
                {i.file_path && (
                  <a href={fileUrl(i.file_path)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                    <FileText className="h-3.5 w-3.5" /> Buka file
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!draft} title={draft?.id ? "Edit Referensi" : "Tambah Referensi"} onClose={() => setDraft(null)}>
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="label" htmlFor="lb-kind">Kategori</label>
              <select id="lb-kind" className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lb-title">Judul</label>
              <input id="lb-title" className="input" maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="lb-url">URL</label>
              <input id="lb-url" className="input" placeholder="https://…" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            </div>
            <div>
              <p className="label">File (opsional)</p>
              <div className="flex items-center gap-2">
                <button type="button" disabled={uploading} className="btn-ghost px-3 py-2 text-xs" onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Unggah file
                </button>
                {draft.fileName && <span className="truncate text-xs text-muted">{draft.fileName}</span>}
              </div>
              <input ref={fileRef} type="file" accept={FILE_TYPES.join(",")} className="hidden" onChange={pickFile} />
              <p className="mt-1 text-[11px] text-muted">PDF, dokumen Office, EPUB, gambar, dll. Maksimal 10 MB.</p>
            </div>
            <div>
              <label className="label" htmlFor="lb-desc">Deskripsi</label>
              <textarea id="lb-desc" className="input min-h-20" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Batal</button>
              <button type="submit" disabled={saving || uploading} className="btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
