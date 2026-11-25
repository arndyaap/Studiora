"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Pencil, Play, Plus, Sparkles, Trash2, X, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { checkAchievements, detectLevelUp, getTotalXp, syncMissions, userTimeZone } from "@/lib/xp";
import { Modal, ConfirmButton } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type QType = "multiple_choice" | "true_false" | "short_answer";
type Difficulty = "easy" | "medium" | "hard" | "expert";
type Question = {
  id: string;
  lesson_id: string | null;
  type: QType | "matching";
  prompt: string;
  options: string[];
  answer: unknown;
  explanation: string;
  difficulty: Difficulty;
  source: "manual" | "ai";
};
type Lesson = { id: string; title: string };
type Attempt = { id: string; lesson_id: string | null; correct_answers: number; total_questions: number; xp_awarded: number; created_at: string };
type Result = { question_id: string; correct: boolean; correct_answer: unknown; explanation: string };
type Outcome = { total: number; correct: number; score: number; xp: number; results: Result[]; extra: string; levelUp: string | null };
type Draft = { id?: string; lessonId: string; type: QType; prompt: string; options: string[]; mcAnswer: number; tfAnswer: boolean; shortAnswer: string; explanation: string; difficulty: Difficulty };

const TYPE_LABEL: Record<QType, string> = { multiple_choice: "Pilihan ganda", true_false: "Benar / Salah", short_answer: "Isian singkat" };
const MIXED = "__mixed__";

const shuffle = <T,>(a: T[]) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

function showAnswer(q: Question | undefined, a: unknown): string {
  if (!q) return "";
  if (a === null || a === undefined || a === "") return "(tidak dijawab)";
  if (q.type === "multiple_choice") return typeof a === "number" ? q.options[a] ?? "" : String(a);
  if (q.type === "true_false") return a === true ? "Benar" : "Salah";
  return Array.isArray(a) ? a.join(" / ") : String(a);
}

const emptyDraft = (lessonId: string): Draft => ({ lessonId, type: "multiple_choice", prompt: "", options: ["", "", "", ""], mcAnswer: 0, tfAnswer: true, shortAnswer: "", explanation: "", difficulty: "medium" });

export function QuizClient() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [scope, setScope] = useState<string>(MIXED);
  const [count, setCount] = useState(10);

  const [phase, setPhase] = useState<"home" | "play" | "result">("home");
  const [deck, setDeck] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const startedAt = useRef(0);
  const playLesson = useRef<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [manageLesson, setManageLesson] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [l, q, a] = await Promise.all([
      supabase.from("lessons").select("id,title").order("title"),
      supabase.from("quiz_questions").select("id,lesson_id,type,prompt,options,answer,explanation,difficulty,source").order("created_at", { ascending: false }).limit(2000),
      supabase.from("quiz_attempts").select("id,lesson_id,correct_answers,total_questions,xp_awarded,created_at").order("created_at", { ascending: false }).limit(8),
    ]);
    if (l.error || q.error || a.error) setError("Gagal memuat data quiz. Pastikan migrasi database 0004 sudah dijalankan.");
    setLessons((l.data as Lesson[]) ?? []);
    setQuestions((q.data as Question[]) ?? []);
    setAttempts((a.data as Attempt[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const playable = useMemo(() => questions.filter((q) => q.type !== "matching"), [questions]);
  const lessonTitle = useCallback((id: string | null) => lessons.find((l) => l.id === id)?.title ?? "Campuran", [lessons]);
  const countByLesson = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of playable) if (q.lesson_id) m.set(q.lesson_id, (m.get(q.lesson_id) ?? 0) + 1);
    return m;
  }, [playable]);
  const pool = scope === MIXED ? playable : playable.filter((q) => q.lesson_id === scope);

  function start() {
    if (!pool.length) return;
    const picked = shuffle(pool).slice(0, Math.min(count, pool.length));
    setDeck(picked);
    setAnswers({});
    setIdx(0);
    setOutcome(null);
    setError(null);
    playLesson.current = scope === MIXED ? null : scope;
    startedAt.current = Date.now();
    setPhase("play");
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const before = await getTotalXp(supabase);
    const payload = deck.map((q) => ({ question_id: q.id, answer: answers[q.id] ?? null }));
    const { data, error: err } = await supabase.rpc("submit_quiz", {
      p_lesson_id: playLesson.current,
      p_answers: payload,
      p_duration: Math.round((Date.now() - startedAt.current) / 1000),
      p_tz: userTimeZone(),
    });
    if (err || !data) {
      setSubmitting(false);
      return setError("Gagal mengirim jawaban. Coba lagi.");
    }
    const r = data as { total: number; correct: number; score: number; xp: number; results: Result[] };
    const missions = await syncMissions(supabase);
    const unlocked = await checkAchievements(supabase);
    const up = await detectLevelUp(supabase, before);
    const extra = [
      missions.length ? `Misi selesai: ${missions.map((m) => m.title).join(", ")}` : "",
      unlocked.length ? `Achievement terbuka: ${unlocked.map((u) => u.title).join(", ")}` : "",
    ].filter(Boolean).join(" · ");
    setOutcome({ ...r, extra, levelUp: up ? `Naik ke Level ${up.level}: ${up.title}!` : null });
    setSubmitting(false);
    setPhase("result");
    load();
  }

  function openNew(lessonId: string) {
    setDraftError(null);
    setDraft(emptyDraft(lessonId));
  }

  function openEdit(q: Question) {
    setDraftError(null);
    const t = (q.type === "matching" ? "short_answer" : q.type) as QType;
    setDraft({
      id: q.id,
      lessonId: q.lesson_id ?? "",
      type: t,
      prompt: q.prompt,
      options: t === "multiple_choice" ? [...q.options, "", "", "", ""].slice(0, Math.max(4, q.options.length)) : ["", "", "", ""],
      mcAnswer: typeof q.answer === "number" ? q.answer : 0,
      tfAnswer: q.answer === true,
      shortAnswer: Array.isArray(q.answer) ? (q.answer as string[]).join(", ") : typeof q.answer === "string" ? q.answer : "",
      explanation: q.explanation,
      difficulty: q.difficulty,
    });
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const prompt = draft.prompt.trim();
    if (prompt.length < 3) return setDraftError("Tulis pertanyaannya terlebih dahulu.");
    let options: string[] = [];
    let answer: unknown;
    if (draft.type === "multiple_choice") {
      options = draft.options.map((o) => o.trim()).filter(Boolean);
      const correctText = draft.options[draft.mcAnswer]?.trim();
      if (options.length < 2) return setDraftError("Isi minimal 2 opsi.");
      if (!correctText) return setDraftError("Opsi yang ditandai benar tidak boleh kosong.");
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return setDraftError("Ada opsi yang dobel.");
      answer = options.indexOf(correctText);
    } else if (draft.type === "true_false") {
      answer = draft.tfAnswer;
    } else {
      const list = Array.from(new Set(draft.shortAnswer.split(",").map((s) => s.trim()).filter(Boolean)));
      if (!list.length) return setDraftError("Isi minimal satu jawaban yang diterima.");
      answer = list;
    }
    setSaving(true);
    const row = { lesson_id: draft.lessonId || null, type: draft.type, prompt, options, answer, explanation: draft.explanation.trim(), difficulty: draft.difficulty };
    const supabase = createClient();
    const { error: err } = draft.id ? await supabase.from("quiz_questions").update(row).eq("id", draft.id) : await supabase.from("quiz_questions").insert({ ...row, source: "manual" });
    setSaving(false);
    if (err) return setDraftError("Gagal menyimpan soal.");
    setDraft(null);
    await load();
  }

  async function removeQuestion(id: string) {
    const { error: err } = await createClient().from("quiz_questions").delete().eq("id", id);
    if (err) return setError("Gagal menghapus soal.");
    setQuestions((p) => p.filter((q) => q.id !== id));
  }

  async function generate(lessonId: string) {
    setAiBusy(lessonId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/quiz/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessonId, count: 5 }) });
      const j = (await res.json().catch(() => ({}))) as { created?: number; error?: string };
      if (!res.ok) setError(j.error ?? "Gagal membuat soal dengan AI.");
      else {
        setNotice(`${j.created} soal dibuat oleh AI. Periksa dulu sebelum dipakai: AI bisa keliru.`);
        await load();
      }
    } catch {
      setError("Tidak bisa terhubung ke server.");
    }
    setAiBusy(null);
  }

  const q = deck[idx];
  const answered = Object.values(answers).filter((v) => v !== null && v !== undefined && v !== "").length;
  const managed = manageLesson ? questions.filter((x) => x.lesson_id === manageLesson) : [];

  /* ---------------- Bermain ---------------- */
  if (phase === "play" && q) {
    const cur = answers[q.id];
    const setAns = (v: unknown) => setAnswers((p) => ({ ...p, [q.id]: v }));
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between text-sm text-muted">
          <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => confirm("Keluar dari quiz? Jawabanmu belum dikirim dan tidak akan disimpan.") && setPhase("home")}><X className="h-4 w-4" /> Keluar</button>
          <span>Soal {idx + 1} dari {deck.length}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface2"><div className="h-full bg-primary transition-all" style={{ width: `${((idx + 1) / deck.length) * 100}%` }} /></div>
        <div className="card space-y-4 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{TYPE_LABEL[q.type as QType]}</p>
          <h2 className="font-display text-lg font-bold">{q.prompt}</h2>
          {q.type === "multiple_choice" && (
            <ul className="space-y-2">
              {q.options.map((o, i) => (
                <li key={i}><button type="button" onClick={() => setAns(i)} className={cn("w-full rounded-xl border px-4 py-3 text-left text-sm transition", cur === i ? "border-primary bg-primary/15" : "border-line/20 hover:bg-surface2/50")}>{o}</button></li>
              ))}
            </ul>
          )}
          {q.type === "true_false" && (
            <div className="grid grid-cols-2 gap-3">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" onClick={() => setAns(v)} className={cn("rounded-xl border px-4 py-3 text-sm font-semibold transition", cur === v ? "border-primary bg-primary/15" : "border-line/20 hover:bg-surface2/50")}>{v ? "Benar" : "Salah"}</button>
              ))}
            </div>
          )}
          {q.type === "short_answer" && <input className="input" placeholder="Ketik jawabanmu" value={typeof cur === "string" ? cur : ""} onChange={(e) => setAns(e.target.value)} aria-label="Jawaban" />}
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-between">
          <button type="button" className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Sebelumnya</button>
          {idx < deck.length - 1 ? (
            <button type="button" className="btn-primary" onClick={() => setIdx(idx + 1)}>Berikutnya</button>
          ) : (
            <button type="button" className="btn-primary" disabled={submitting} onClick={submit}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Kirim jawaban ({answered}/{deck.length})</button>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- Hasil ---------------- */
  if (phase === "result" && outcome) {
    const byId = new Map(deck.map((d) => [d.id, d]));
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="card p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Hasil quiz</p>
          <p className="font-display text-5xl font-extrabold text-primary">{outcome.score}%</p>
          <p className="mt-1 text-sm text-muted">{outcome.correct} dari {outcome.total} benar</p>
          <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-gold/20 px-3 py-1 text-sm font-semibold text-gold"><Zap className="h-4 w-4" />{outcome.xp > 0 ? `+${outcome.xp} XP` : "Tidak ada XP baru"}</p>
          {outcome.xp === 0 && <p className="mt-2 text-xs text-muted">XP quiz hanya diberikan untuk satu percobaan per materi per hari (maks. 100 XP quiz per hari).</p>}
          {outcome.levelUp && <p className="mt-2 font-semibold text-accent">{outcome.levelUp}</p>}
          {outcome.extra && <p className="mt-2 text-sm text-success">{outcome.extra}</p>}
        </div>
        <ul className="space-y-3">
          {outcome.results.map((r, i) => {
            const qq = byId.get(r.question_id);
            return (
              <li key={r.question_id} className={cn("card p-4", r.correct ? "border-success/30" : "border-danger/30")}>
                <p className="text-sm font-semibold">{i + 1}. {qq?.prompt}</p>
                <p className="mt-1 text-sm"><span className="text-muted">Jawabanmu: </span><span className={r.correct ? "text-success" : "text-danger"}>{showAnswer(qq, answers[r.question_id])}</span></p>
                {!r.correct && <p className="text-sm"><span className="text-muted">Jawaban benar: </span>{showAnswer(qq, r.correct_answer)}</p>}
                {r.explanation && <p className="mt-1 text-xs text-muted">{r.explanation}</p>}
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between"><button type="button" className="btn-ghost" onClick={() => setPhase("home")}><ArrowLeft className="h-4 w-4" /> Kembali</button><button type="button" className="btn-primary" onClick={start}>Ulangi</button></div>
      </div>
    );
  }

  /* ---------------- Beranda quiz ---------------- */
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/misi" className="text-xs text-muted hover:text-ink">← Misi</Link>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Knowledge Quiz</h1>
          <p className="text-sm text-muted">Uji pemahamanmu dari soal yang kamu buat sendiri atau dibuat AI</p>
        </div>
      </div>

      {notice && <p role="status" className="card border-success/40 p-3 text-sm text-success">{notice}</p>}
      {error && <p role="alert" className="card border-danger/40 p-3 text-sm text-danger">{error}</p>}

      {loading ? <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p> : (
        <>
          <section className="card space-y-4 p-5" aria-label="Mulai quiz">
            <h2 className="font-display font-bold">Mulai quiz</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div><label className="label" htmlFor="q-scope">Materi</label>
                <select id="q-scope" className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value={MIXED}>Campuran semua materi ({playable.length} soal)</option>
                  {lessons.filter((l) => countByLesson.get(l.id)).map((l) => <option key={l.id} value={l.id}>{l.title} ({countByLesson.get(l.id)} soal)</option>)}
                </select></div>
              <div><label className="label" htmlFor="q-count">Jumlah soal</label>
                <select id="q-count" className="input sm:w-32" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
              <div className="flex items-end"><button type="button" className="btn-primary w-full" disabled={!pool.length} onClick={start}><Play className="h-4 w-4" /> Mulai</button></div>
            </div>
            {!playable.length && <p className="text-sm text-muted">Belum ada soal. Buat soal di bagian “Bank soal” di bawah, atau minta AI membuatkannya dari isi materi.</p>}
          </section>

          <section className="space-y-3" aria-label="Bank soal">
            <h2 className="font-display font-bold">Bank soal</h2>
            {lessons.length === 0 ? <p className="card p-5 text-sm text-muted">Belum ada materi. Buat lesson di menu Materi dulu, lalu kembali ke sini untuk membuat soal.</p> : (
              <ul className="space-y-2">
                {lessons.map((l) => {
                  const n = countByLesson.get(l.id) ?? 0;
                  const open = manageLesson === l.id;
                  return (
                    <li key={l.id} className="card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" className="text-left" onClick={() => setManageLesson(open ? null : l.id)} aria-expanded={open}>
                          <span className="font-semibold">{l.title}</span><span className="ml-2 text-xs text-muted">{n} soal</span>
                        </button>
                        <div className="flex gap-2">
                          <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={aiBusy === l.id} onClick={() => generate(l.id)}>{aiBusy === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Buat 5 soal dengan AI</button>
                          <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openNew(l.id)}><Plus className="h-3.5 w-3.5" /> Soal</button>
                        </div>
                      </div>
                      {open && (managed.length === 0 ? <p className="mt-3 text-sm text-muted">Belum ada soal untuk materi ini.</p> : (
                        <ul className="mt-3 divide-y divide-line/10">
                          {managed.map((m) => (
                            <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                              <div><p>{m.prompt}</p><p className="text-xs text-muted">{TYPE_LABEL[m.type as QType] ?? m.type}{m.source === "ai" ? " · AI" : ""}</p></div>
                              <div className="flex shrink-0 gap-1">
                                <button type="button" aria-label="Ubah soal" className="rounded-lg p-1.5 text-muted hover:bg-surface2/60 hover:text-ink" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></button>
                                <ConfirmButton onConfirm={() => removeQuestion(m.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface2/60 hover:text-danger" message="Hapus soal ini?"><Trash2 className="h-4 w-4" /><span className="sr-only">Hapus</span></ConfirmButton>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {attempts.length > 0 && (
            <section className="card p-5" aria-label="Riwayat quiz">
              <h2 className="font-display font-bold">Riwayat terakhir</h2>
              <ul className="mt-3 divide-y divide-line/10">
                {attempts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{lessonTitle(a.lesson_id)}<span className="ml-2 text-xs text-muted">{new Date(a.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span></span>
                    <span className="text-muted">{a.correct_answers}/{a.total_questions}{a.xp_awarded ? ` · +${a.xp_awarded} XP` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Modal open={!!draft} title={draft?.id ? "Ubah Soal" : "Soal Baru"} onClose={() => setDraft(null)} wide>
        {draft && (
          <form onSubmit={saveDraft} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
                <button key={t} type="button" onClick={() => setDraft({ ...draft, type: t })} className={cn("rounded-xl border px-2 py-2 text-xs font-semibold sm:text-sm", draft.type === t ? "border-primary bg-primary/15 text-primary" : "border-line/20 text-muted")}>{TYPE_LABEL[t]}</button>
              ))}
            </div>
            <div><label className="label" htmlFor="d-prompt">Pertanyaan</label><textarea id="d-prompt" className="input" rows={2} maxLength={500} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} /></div>
            {draft.type === "multiple_choice" && (
              <fieldset className="space-y-2"><legend className="label">Opsi (pilih yang benar)</legend>
                {draft.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="mc" checked={draft.mcAnswer === i} onChange={() => setDraft({ ...draft, mcAnswer: i })} aria-label={`Opsi ${i + 1} benar`} />
                    <input className="input" value={o} maxLength={200} placeholder={`Opsi ${i + 1}`} onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, k) => (k === i ? e.target.value : x)) })} />
                  </div>
                ))}
              </fieldset>
            )}
            {draft.type === "true_false" && (
              <div className="flex gap-4 text-sm">
                {[true, false].map((v) => <label key={String(v)} className="flex items-center gap-2"><input type="radio" name="tf" checked={draft.tfAnswer === v} onChange={() => setDraft({ ...draft, tfAnswer: v })} /> Pernyataan ini {v ? "benar" : "salah"}</label>)}
              </div>
            )}
            {draft.type === "short_answer" && <div><label className="label" htmlFor="d-short">Jawaban yang diterima (pisahkan dengan koma)</label><input id="d-short" className="input" value={draft.shortAnswer} onChange={(e) => setDraft({ ...draft, shortAnswer: e.target.value })} placeholder="jakarta, dki jakarta" /></div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="d-expl">Penjelasan (opsional)</label><input id="d-expl" className="input" maxLength={600} value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} /></div>
              <div><label className="label" htmlFor="d-diff">Kesulitan</label>
                <select id="d-diff" className="input" value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Difficulty })}>
                  <option value="easy">Mudah</option><option value="medium">Sedang</option><option value="hard">Sulit</option><option value="expert">Expert</option></select></div>
            </div>
            {draftError && <p role="alert" className="text-sm text-danger">{draftError}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Batal</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
