"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, Check, ExternalLink, FileText, Loader2, Paperclip, Pencil, Plus, Save, Trash2, Trophy, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";
import { awardXpOnce } from "@/lib/xp";
import { getLevel } from "@/lib/levels";
import { checkLessonAchievements } from "@/lib/achievements";
import { FILE_TYPES, IMAGE_TYPES, uploadStudyFile } from "@/lib/upload";
import { ConfirmButton } from "@/components/ui/Modal";
import { RichEditor } from "@/components/materi/RichEditor";
import { cn } from "@/lib/utils";

type Status = "not_started" | "in_progress" | "completed";
type Ref = { title: string; url: string };
type Attachment = { name: string; url: string; path: string; size: number };

type Lesson = {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  content_html: string;
  external_refs: Ref[];
  attachments: Attachment[];
  bookmarked: boolean;
  status: Status;
  modules: { name: string; subjects: { name: string; categories: { name: string } | null } | null } | null;
};

const STATUS: { id: Status; label: string }[] = [
  { id: "not_started", label: "Not Started" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
];

const LESSON_XP = 20;
const NOTE_XP = 10;

export function LessonClient({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // draft saat edit
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [refs, setRefs] = useState<Ref[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const getHtml = useRef<() => string>(() => "");
  const insertImage = useRef<(url: string) => void>(() => {});
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // catatan pribadi
  const [noteId, setNoteId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteDone, setNoteDone] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);

  const [levelUp, setLevelUp] = useState<{ level: number; title: string } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const flash = useCallback((type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      setUserId(auth.user?.id ?? "");

      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,description,objectives,content_html,external_refs,attachments,bookmarked,status,modules(name,subjects(name,categories(name)))")
        .eq("id", lessonId)
        .maybeSingle();
      if (error) return setLoadError(true);
      if (!data) return setMissing(true);

      let l = data as unknown as Lesson;
      // Membuka lesson mencatat "terakhir dibuka"; lesson baru otomatis menjadi In Progress.
      const patch: { last_opened_at: string; status?: Status } = { last_opened_at: new Date().toISOString() };
      if (l.status === "not_started") {
        patch.status = "in_progress";
        l = { ...l, status: "in_progress" };
      }
      await supabase.from("lessons").update(patch).eq("id", lessonId);
      setLesson(l);

      const { data: n } = await supabase
        .from("lesson_notes")
        .select("id,body,completed")
        .eq("lesson_id", lessonId)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (n) {
        setNoteId(n.id);
        setNote(n.body);
        setNoteDone(n.completed);
      }
    })();
  }, [lessonId]);

  // peringatan jika meninggalkan halaman dengan perubahan belum tersimpan
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const safeContent = useMemo(() => (lesson ? sanitizeHtml(lesson.content_html) : ""), [lesson]);

  function startEdit() {
    if (!lesson) return;
    setTitle(lesson.title);
    setDescription(lesson.description);
    setObjectives((lesson.objectives ?? []).join("\n"));
    setRefs(lesson.external_refs ?? []);
    setAttachments(lesson.attachments ?? []);
    setDirty(false);
    setEditing(true);
  }

  async function cancelEdit() {
    if (dirty && !window.confirm("Perubahan belum disimpan. Buang perubahan?")) return;
    setDirty(false);
    setEditing(false);
  }

  async function saveLesson() {
    if (!lesson) return;
    const t = title.trim();
    if (!t) return flash("err", "Judul wajib diisi.");
    if (t.length > 200) return flash("err", "Judul maksimal 200 karakter.");

    const cleanRefs: Ref[] = [];
    for (const r of refs) {
      const url = r.url.trim();
      const rt = r.title.trim();
      if (!url && !rt) continue;
      if (!/^https?:\/\//i.test(url)) return flash("err", `Referensi "${rt || url}": alamat harus diawali http:// atau https://`);
      cleanRefs.push({ title: rt || url, url });
    }

    const payload = {
      title: t,
      description: description.trim(),
      objectives: objectives.split("\n").map((s) => s.trim()).filter(Boolean),
      content_html: sanitizeHtml(getHtml.current()),
      external_refs: cleanRefs,
      attachments,
    };

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("lessons").update(payload).eq("id", lesson.id);
    setSaving(false);
    if (error) return flash("err", "Gagal menyimpan materi. Coba lagi.");
    setLesson({ ...lesson, ...payload });
    setDirty(false);
    setEditing(false);
    flash("ok", "Materi tersimpan.");
  }

  async function onImageChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const r = await uploadStudyFile(createClient(), userId, file, IMAGE_TYPES);
    setUploading(false);
    if (!r.ok) return flash("err", r.error);
    insertImage.current(r.url);
    setDirty(true);
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const r = await uploadStudyFile(createClient(), userId, file, FILE_TYPES);
    setUploading(false);
    if (!r.ok) return flash("err", r.error);
    setAttachments((a) => [...a, { name: r.name, url: r.url, path: r.path, size: r.size }]);
    setDirty(true);
  }

  async function removeAttachment(a: Attachment) {
    await createClient().storage.from("study-files").remove([a.path]);
    setAttachments((list) => list.filter((x) => x.path !== a.path));
    setDirty(true);
  }

  async function toggleBookmark() {
    if (!lesson) return;
    const next = !lesson.bookmarked;
    setLesson({ ...lesson, bookmarked: next });
    const { error } = await createClient().from("lessons").update({ bookmarked: next }).eq("id", lesson.id);
    if (error) {
      setLesson({ ...lesson, bookmarked: !next });
      flash("err", "Gagal menyimpan bookmark.");
    }
  }

  /** Memberi XP, lalu mengecek naik level dan achievement. Mengembalikan true bila XP baru diberikan. */
  async function rewardAndCheck(amount: number, source: "lesson_completed" | "lesson_note_completed", note: string) {
    const supabase = createClient();
    const { data: before } = await supabase.from("profiles").select("total_xp").maybeSingle();
    const awarded = await awardXpOnce(supabase, { amount, source, sourceId: lessonId, note });
    if (!awarded) return false;

    await supabase.from("notifications").insert({ type: "mission", title: `+${amount} XP: ${note}`, body: "" });

    const { data: after } = await supabase.from("profiles").select("total_xp").maybeSingle();
    if (before && after) {
      const b = getLevel(before.total_xp);
      const a = getLevel(after.total_xp);
      if (a.level > b.level) {
        setLevelUp({ level: a.level, title: a.title });
        await supabase.from("notifications").insert({ type: "level_up", title: `Naik level! Level ${a.level}: ${a.title}`, body: "" });
      }
    }
    const unlocked = await checkLessonAchievements(supabase);
    if (unlocked.length) flash("ok", `Achievement terbuka: ${unlocked.map((u) => u.title).join(", ")}`);
    return true;
  }

  async function changeStatus(next: Status) {
    if (!lesson || next === lesson.status) return;
    setStatusBusy(true);
    const supabase = createClient();
    const patch: { status: Status; completed_at: string | null } = {
      status: next,
      completed_at: next === "completed" ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from("lessons").update(patch).eq("id", lesson.id);
    if (error) {
      setStatusBusy(false);
      return flash("err", "Gagal menyimpan status.");
    }
    setLesson({ ...lesson, status: next });

    if (next === "completed") {
      const got = await rewardAndCheck(LESSON_XP, "lesson_completed", `Materi selesai: ${lesson.title}`);
      flash("ok", got ? `Materi selesai! +${LESSON_XP} XP` : "Materi selesai. XP untuk materi ini sudah pernah diberikan.");
    }
    setStatusBusy(false);
  }

  async function saveNote(markDone: boolean) {
    const body = note.trim();
    if (markDone && !body) return flash("err", "Tulis catatan dulu sebelum menandainya selesai.");
    setNoteSaving(true);
    const supabase = createClient();
    const completed = markDone || noteDone;
    let error;
    if (noteId) {
      ({ error } = await supabase.from("lesson_notes").update({ body, completed }).eq("id", noteId));
    } else {
      const r = await supabase.from("lesson_notes").insert({ lesson_id: lessonId, body, completed }).select("id").single();
      error = r.error;
      if (r.data) setNoteId((r.data as { id: string }).id);
    }
    setNoteSaving(false);
    if (error) return flash("err", "Gagal menyimpan catatan.");
    setNoteDone(completed);

    if (markDone) {
      const got = await rewardAndCheck(NOTE_XP, "lesson_note_completed", "Catatan pribadi selesai");
      flash("ok", got ? `Catatan selesai! +${NOTE_XP} XP` : "Catatan tersimpan. XP catatan untuk lesson ini sudah pernah diberikan.");
    } else flash("ok", "Catatan tersimpan.");
  }

  async function deleteLesson() {
    if (!lesson) return;
    const { error } = await createClient().from("lessons").delete().eq("id", lesson.id);
    if (error) return flash("err", "Gagal menghapus lesson.");
    router.push("/materi");
    router.refresh();
  }

  if (loadError) return <p className="card p-6 text-sm text-danger">Gagal memuat lesson. Muat ulang halaman, atau pastikan migrasi database sudah dijalankan.</p>;
  if (missing)
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-muted">Lesson tidak ditemukan (mungkin sudah dihapus).</p>
        <Link href="/materi" className="btn-ghost mt-3">Kembali ke Materi</Link>
      </div>
    );
  if (!lesson) return <p className="py-16 text-center text-sm text-muted">Memuat…</p>;

  const crumb = [lesson.modules?.subjects?.categories?.name, lesson.modules?.subjects?.name, lesson.modules?.name].filter(Boolean).join(" › ");

  return (
    <div className="space-y-5">
      <div>
        <Link href="/materi" className="text-xs font-semibold text-primary hover:underline">← Materi</Link>
        <p className="mt-2 text-xs text-muted">{crumb}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 font-display text-2xl font-extrabold sm:text-3xl">{editing ? "Edit Materi" : lesson.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={toggleBookmark} aria-pressed={lesson.bookmarked} className={cn("btn-ghost px-3 py-2 text-xs", lesson.bookmarked && "border-gold/50 text-gold")}>
              <BookMarked className="h-4 w-4" /> {lesson.bookmarked ? "Dibookmark" : "Bookmark"}
            </button>
            {!editing && (
              <button type="button" onClick={startEdit} className="btn-ghost px-3 py-2 text-xs">
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {msg && (
        <p role="status" className={cn("rounded-xl border px-3 py-2 text-sm", msg.type === "ok" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}

      {/* Status */}
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4" aria-label="Status belajar">
        <div className="flex rounded-xl border border-line/20 p-0.5" role="radiogroup" aria-label="Status belajar">
          {STATUS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={lesson.status === s.id}
              disabled={statusBusy}
              onClick={() => changeStatus(s.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
                lesson.status === s.id ? (s.id === "completed" ? "bg-success text-white" : "bg-primary text-white") : "text-muted hover:text-ink",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Menyelesaikan materi: +{LESSON_XP} XP (sekali per lesson)</p>
      </section>

      {editing ? (
        <section className="card space-y-5 p-5" aria-label="Editor materi">
          <div>
            <label className="label" htmlFor="l-title">Judul</label>
            <input id="l-title" className="input" maxLength={200} value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
          </div>
          <div>
            <label className="label" htmlFor="l-desc">Deskripsi</label>
            <textarea id="l-desc" className="input min-h-20" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} />
          </div>
          <div>
            <label className="label" htmlFor="l-obj">Learning Objectives (satu per baris)</label>
            <textarea id="l-obj" className="input min-h-24" value={objectives} onChange={(e) => { setObjectives(e.target.value); setDirty(true); }} placeholder={"Memahami konsep dasar…\nMampu menjelaskan…"} />
          </div>
          <div>
            <p className="label">Learning Content</p>
            <RichEditor
              initialHtml={sanitizeHtml(lesson.content_html)}
              onInput={() => setDirty(true)}
              onPickImage={() => imageInput.current?.click()}
              registerGetHtml={(fn) => (getHtml.current = fn)}
              registerInsertImage={(fn) => (insertImage.current = fn)}
            />
            <input ref={imageInput} type="file" accept={IMAGE_TYPES.join(",")} className="hidden" onChange={onImageChosen} />
            <p className="mt-1 text-[11px] text-muted">Teks yang ditempel menjadi teks biasa. Gambar maksimal 10 MB (JPG, PNG, WebP, GIF).</p>
          </div>

          <div>
            <p className="label">External References</p>
            <div className="space-y-2">
              {refs.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                  <input className="input" placeholder="Judul" value={r.title} onChange={(e) => { setRefs(refs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x))); setDirty(true); }} />
                  <input className="input order-last col-span-2 sm:order-none sm:col-span-1" placeholder="https://…" value={r.url} onChange={(e) => { setRefs(refs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x))); setDirty(true); }} />
                  <button type="button" aria-label="Hapus referensi" className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" onClick={() => { setRefs(refs.filter((_, j) => j !== i)); setDirty(true); }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => { setRefs([...refs, { title: "", url: "" }]); setDirty(true); }}>
                <Plus className="h-4 w-4" /> Tambah referensi
              </button>
            </div>
          </div>

          <div>
            <p className="label">File Attachments</p>
            <ul className="space-y-2">
              {attachments.map((a) => (
                <li key={a.path} className="flex items-center gap-2 rounded-xl border border-line/15 px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted">{(a.size / 1024).toFixed(0)} KB</span>
                  <button type="button" aria-label={`Hapus ${a.name}`} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" onClick={() => removeAttachment(a)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" disabled={uploading} className="btn-ghost mt-2 px-3 py-2 text-xs" onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Lampirkan file
            </button>
            <input ref={fileInput} type="file" accept={FILE_TYPES.join(",")} className="hidden" onChange={onFileChosen} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/10 pt-4">
            <ConfirmButton className="btn-ghost text-danger" message="Hapus lesson ini beserta catatannya? Tidak bisa dikembalikan." onConfirm={deleteLesson}>
              <Trash2 className="h-4 w-4" /> Hapus Lesson
            </ConfirmButton>
            <div className="flex items-center gap-2">
              {dirty && <span className="text-xs text-gold">Belum disimpan</span>}
              <button type="button" className="btn-ghost" onClick={cancelEdit}>Batal</button>
              <button type="button" disabled={saving} className="btn-primary" onClick={saveLesson}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Simpan
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          {(lesson.description || lesson.objectives?.length > 0) && (
            <section className="card space-y-4 p-5">
              {lesson.description && <p className="text-sm leading-relaxed text-muted">{lesson.description}</p>}
              {lesson.objectives?.length > 0 && (
                <div>
                  <h2 className="mb-2 font-display text-sm font-bold">Learning Objectives</h2>
                  <ul className="space-y-1.5">
                    {lesson.objectives.map((o, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="card p-5 sm:p-6" aria-label="Isi materi">
            {safeContent ? (
              <article className="lesson-content" dangerouslySetInnerHTML={{ __html: safeContent }} />
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-muted">Materi ini belum ada isinya.</p>
                <button type="button" className="btn-primary mt-3" onClick={startEdit}>Mulai menulis</button>
              </div>
            )}
          </section>

          {(lesson.external_refs?.length > 0 || lesson.attachments?.length > 0) && (
            <section className="card space-y-4 p-5">
              {lesson.external_refs?.length > 0 && (
                <div>
                  <h2 className="mb-2 font-display text-sm font-bold">External References</h2>
                  <ul className="space-y-1.5">
                    {lesson.external_refs.map((r, i) => (
                      <li key={i}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" /> {r.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lesson.attachments?.length > 0 && (
                <div>
                  <h2 className="mb-2 font-display text-sm font-bold">Lampiran</h2>
                  <ul className="space-y-1.5">
                    {lesson.attachments.map((a) => (
                      <li key={a.path}>
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <Paperclip className="h-3.5 w-3.5" /> {a.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Personal Notes */}
      <section className="card p-5" aria-label="Catatan pribadi">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold">Personal Notes</h2>
          {noteDone && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">Selesai</span>}
        </div>
        <textarea className="input min-h-28" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tulis ringkasan atau pemahamanmu dengan kata-katamu sendiri…" aria-label="Catatan pribadi" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">Menandai catatan selesai: +{NOTE_XP} XP (sekali per lesson)</p>
          <div className="flex gap-2">
            <button type="button" disabled={noteSaving} className="btn-ghost px-3 py-2 text-xs" onClick={() => saveNote(false)}>
              {noteSaving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan catatan
            </button>
            {!noteDone && (
              <button type="button" disabled={noteSaving} className="btn-primary px-3 py-2 text-xs" onClick={() => saveNote(true)}>
                <Check className="h-4 w-4" /> Simpan & tandai selesai
              </button>
            )}
          </div>
        </div>
      </section>

      {levelUp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6" role="alertdialog" aria-label="Naik level">
          <div className="card animate-fade-up px-8 py-10 text-center shadow-glow">
            <Trophy className="mx-auto h-12 w-12 text-gold" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-gold">Level Up!</p>
            <p className="mt-2 font-display text-3xl font-extrabold">Level {levelUp.level}</p>
            <p className="text-lg text-accent">{levelUp.title}</p>
            <button type="button" className="btn-primary mt-6" onClick={() => setLevelUp(null)}>Lanjut belajar</button>
          </div>
        </div>
      )}
    </div>
  );
}
