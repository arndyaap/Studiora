"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarPlus, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, localDateKey } from "@/lib/utils";
import type { Proposal } from "@/lib/server/import-schema";

type Item = { id: string; title: string; url: string | null; file_path: string | null; kind: string };
type ImportRow = { id: string; status: "pending" | "processing" | "ready" | "failed" | "applied"; error_message: string | null; extracted_chars: number; truncated: boolean; chunk_count: number; chunks_done: number; applied_subject_id: string | null; proposal: { final?: Proposal } };
type Cat = { id: string; name: string };

type DLesson = { title: string; description: string; objectives: string[]; minutes: number; sourceRef: string; checked: boolean; schedule: boolean };
type DModule = { title: string; open: boolean; lessons: DLesson[] };

type Phase = "loading" | "intro" | "running" | "review" | "applied" | "failed";

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateKey(d);
}

export function ImportClient({ itemId }: { itemId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [item, setItem] = useState<Item | null>(null);
  const [aiReady, setAiReady] = useState(true);
  const [imp, setImp] = useState<ImportRow | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [retryable, setRetryable] = useState(false);

  // draft tinjauan
  const [subjectTitle, setSubjectTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [mods, setMods] = useState<DModule[]>([]);
  const [catChoice, setCatChoice] = useState<string>(""); // id kategori atau "new"
  const [newCat, setNewCat] = useState("");
  const [startDate, setStartDate] = useState(tomorrow());
  const [startTime, setStartTime] = useState("19:00");
  const [stepDays, setStepDays] = useState(1);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ lessons: number; scheduled: number; subjectId: string } | null>(null);

  const loadDraft = useCallback((p: Proposal) => {
    setSubjectTitle(p.subject_title);
    setSummary(p.summary);
    setMods(
      p.modules.map((m, i) => ({
        title: m.title,
        open: i === 0,
        lessons: m.lessons.map((l) => ({ title: l.title, description: l.description, objectives: l.objectives, minutes: l.minutes, sourceRef: l.source_ref, checked: true, schedule: false })),
      })),
    );
  }, []);

  const fetchImport = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("material_imports")
      .select("id,status,error_message,extracted_chars,truncated,chunk_count,chunks_done,applied_subject_id,proposal")
      .eq("library_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as ImportRow | null) ?? null;
  }, [itemId]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [it, cfg, cs, latest] = await Promise.all([
        supabase.from("library_items").select("id,title,url,file_path,kind").eq("id", itemId).maybeSingle(),
        fetch("/api/imports").then((r) => (r.ok ? r.json() : { aiConfigured: false })).catch(() => ({ aiConfigured: false })),
        supabase.from("categories").select("id,name").order("position"),
        fetchImport(),
      ]);
      if (!it.data) {
        setError("Item Library tidak ditemukan.");
        setPhase("failed");
        return;
      }
      setItem(it.data as Item);
      setAiReady(Boolean(cfg.aiConfigured));
      setCats((cs.data as Cat[]) ?? []);
      setImp(latest);
      if (latest?.status === "ready" && latest.proposal.final) {
        loadDraft(latest.proposal.final);
        setPhase("review");
      } else if (latest?.status === "applied") setPhase("applied");
      else setPhase("intro");
    })();
  }, [itemId, fetchImport, loadDraft]);

  async function run() {
    setError(null);
    setRetryable(false);
    setPhase("running");
    setProgress({ done: 0, total: 0 });

    const start = await fetch("/api/imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ libraryItemId: itemId }) });
    const sj = await start.json().catch(() => ({}));
    if (!start.ok) {
      setError(sj.error ?? "Gagal memulai analisis.");
      setPhase("failed");
      return;
    }
    const total: number = sj.chunkCount;
    setProgress({ done: sj.chunksDone ?? 0, total });
    setImp((prev) => ({ ...(prev as ImportRow), id: sj.id, extracted_chars: sj.chars, truncated: sj.truncated, chunk_count: total, chunks_done: sj.chunksDone ?? 0 }) as ImportRow);

    for (let i = 0; i < total; i++) {
      const res = await fetch(`/api/imports/${sj.id}/process`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chunk: i }) });
      const pj = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(pj.error ?? "Analisis terhenti.");
        setRetryable(true); // potongan yang sudah selesai tidak diproses ulang
        setPhase("failed");
        return;
      }
      setProgress({ done: pj.chunksDone, total });
      if (pj.status === "failed") {
        setError(pj.error ?? "Dokumen tidak memuat materi yang bisa dipelajari.");
        setPhase("failed");
        return;
      }
    }

    const latest = await fetchImport();
    if (latest?.status === "ready" && latest.proposal.final) {
      setImp(latest);
      loadDraft(latest.proposal.final);
      setPhase("review");
    } else {
      setError("Hasil analisis tidak ditemukan. Coba lagi.");
      setPhase("failed");
    }
  }

  // ----- operasi draft -----
  const patchLesson = (mi: number, li: number, p: Partial<DLesson>) => setMods((ms) => ms.map((m, i) => (i !== mi ? m : { ...m, lessons: m.lessons.map((l, j) => (j !== li ? l : { ...l, ...p })) })));
  const setModuleChecked = (mi: number, v: boolean) => setMods((ms) => ms.map((m, i) => (i !== mi ? m : { ...m, lessons: m.lessons.map((l) => ({ ...l, checked: v, schedule: v ? l.schedule : false })) })));
  const setAll = (v: boolean) => setMods((ms) => ms.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, checked: v, schedule: v ? l.schedule : false })) })));
  const scheduleAllChecked = (v: boolean) => setMods((ms) => ms.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, schedule: v && l.checked })) })));

  const counts = useMemo(() => {
    let total = 0, checked = 0, sched = 0;
    for (const m of mods) for (const l of m.lessons) { total++; if (l.checked) checked++; if (l.checked && l.schedule) sched++; }
    return { total, checked, sched };
  }, [mods]);

  async function apply() {
    if (!imp) return;
    setError(null);
    const st = subjectTitle.trim();
    if (!st) return setError("Judul subject wajib diisi.");
    if (!catChoice) return setError("Pilih kategori tujuan terlebih dahulu.");
    if (catChoice === "new" && !newCat.trim()) return setError("Isi nama kategori baru.");
    if (counts.checked === 0) return setError("Pilih minimal satu lesson.");
    if (counts.sched > 0 && !startDate) return setError("Isi tanggal mulai belajar.");
    if (!Number.isInteger(stepDays) || stepDays < 1 || stepDays > 14) return setError("Jarak antar lesson harus 1 sampai 14 hari.");

    let order = 0;
    const payloadMods = [];
    for (const m of mods) {
      const lessons = [];
      for (const l of m.lessons) {
        if (!l.checked) continue;
        if (!l.title.trim()) return setError("Ada judul lesson yang kosong.");
        let schedule: { starts_at: string; ends_at: string } | null = null;
        if (l.schedule) {
          const s = new Date(`${startDate}T${startTime}:00`);
          s.setDate(s.getDate() + order * stepDays);
          const e = new Date(s.getTime() + l.minutes * 60_000);
          schedule = { starts_at: s.toISOString(), ends_at: e.toISOString() };
          order++;
        }
        lessons.push({ title: l.title.trim(), description: l.description, objectives: l.objectives, minutes: l.minutes, sourceRef: l.sourceRef, schedule });
      }
      if (lessons.length) payloadMods.push({ title: m.title.trim() || "Modul", lessons });
    }

    setApplying(true);
    const res = await fetch(`/api/imports/${imp.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: catChoice === "new" ? { newName: newCat.trim() } : { id: catChoice }, subjectTitle: st, modules: payloadMods }),
    });
    const j = await res.json().catch(() => ({}));
    setApplying(false);
    if (!res.ok) return setError(j.error ?? "Gagal menambahkan ke Materi.");
    setResult({ lessons: j.lessons, scheduled: j.scheduled, subjectId: j.subjectId });
    setPhase("applied");
  }

  if (phase === "loading") return <p className="py-16 text-center text-sm text-muted">Memuat…</p>;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/library" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Library
        </Link>
        <h1 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">Jadikan Materi</h1>
        {item && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            {item.file_path ? <FileText className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
            <span className="truncate">{item.title}</span>
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {phase === "intro" && (
        <section className="card space-y-4 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="space-y-2 text-sm leading-relaxed">
              <p>AI akan membaca dokumen ini dan menyusun <strong>usulan topik belajar</strong> (subject, modul, lesson). Kamu memilah mana yang mau dipelajari, lalu bisa langsung menjadwalkannya di Kalender.</p>
              <p className="text-muted">Isi usulan hanya berasal dari dokumen, tetapi AI bisa keliru, jadi periksa sebelum menambahkan. Mendukung PDF teks, halaman web, dan file txt/csv. PDF hasil scan belum didukung.</p>
            </div>
          </div>
          {!aiReady ? (
            <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm">
              <p className="font-semibold">Layanan AI belum dikonfigurasi</p>
              <p className="mt-1 text-muted">Tambahkan environment variable <code className="rounded bg-surface2/60 px-1">ANTHROPIC_API_KEY</code> di Netlify (centang &quot;Contains secret values&quot;), lalu deploy ulang. Panduan lengkap ada di README.</p>
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={run}>
              <Sparkles className="h-4 w-4" /> {imp?.status === "failed" ? "Coba analisis lagi" : "Mulai analisis"}
            </button>
          )}
          {imp?.status === "failed" && imp.error_message && <p className="text-xs text-muted">Percobaan terakhir gagal: {imp.error_message}</p>}
        </section>
      )}

      {phase === "running" && (
        <section className="card space-y-3 p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="h-4 w-4 animate-spin" /> {progress.total === 0 ? "Membaca dokumen…" : `Menganalisis bagian ${Math.min(progress.done + 1, progress.total)} dari ${progress.total}…`}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-line/15">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
          </div>
          <p className="text-xs text-muted">Jangan tutup halaman ini sampai selesai. Dokumen panjang dianalisis bertahap.</p>
        </section>
      )}

      {phase === "failed" && (
        <div className="flex flex-wrap gap-2">
          {retryable && (
            <button type="button" className="btn-primary" onClick={run}>
              <RefreshCw className="h-4 w-4" /> Lanjutkan
            </button>
          )}
          <Link href="/library" className="btn-ghost">Kembali ke Library</Link>
        </div>
      )}

      {phase === "review" && imp && (
        <>
          {imp.truncated && (
            <p className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
              Dokumen sangat panjang, jadi hanya bagian awalnya (sekitar {imp.extracted_chars.toLocaleString("id-ID")} karakter) yang dianalisis.
            </p>
          )}
          <section className="card space-y-4 p-5" aria-label="Tujuan penyimpanan">
            <div>
              <label className="label" htmlFor="im-subject">Nama Subject</label>
              <input id="im-subject" className="input" maxLength={160} value={subjectTitle} onChange={(e) => setSubjectTitle(e.target.value)} />
              {summary && <p className="mt-1.5 text-xs text-muted">{summary}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="im-cat">Kategori tujuan</label>
                <select id="im-cat" className="input" value={catChoice} onChange={(e) => setCatChoice(e.target.value)}>
                  <option value="">Pilih kategori</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="new">+ Buat kategori baru…</option>
                </select>
              </div>
              {catChoice === "new" && (
                <div>
                  <label className="label" htmlFor="im-newcat">Nama kategori baru</label>
                  <input id="im-newcat" className="input" maxLength={120} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
                </div>
              )}
            </div>
          </section>

          <section className="card p-5" aria-label="Usulan topik">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold">Usulan topik <span className="text-sm font-normal text-muted">({counts.checked}/{counts.total} dipilih)</span></h2>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setAll(true)}>Pilih semua</button>
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setAll(false)}>Kosongkan</button>
              </div>
            </div>

            <div className="space-y-3">
              {mods.map((m, mi) => {
                const allChecked = m.lessons.every((l) => l.checked);
                const someChecked = m.lessons.some((l) => l.checked);
                return (
                  <div key={mi} className="rounded-xl border border-line/15 bg-bg/30">
                    <div className="flex items-center gap-2 p-3">
                      <input type="checkbox" aria-label={`Pilih modul ${m.title}`} className="h-4 w-4 accent-[rgb(var(--primary))]" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={(e) => setModuleChecked(mi, e.target.checked)} />
                      <input aria-label="Judul modul" className="input flex-1 py-1.5 font-semibold" maxLength={160} value={m.title} onChange={(e) => setMods((ms) => ms.map((x, i) => (i === mi ? { ...x, title: e.target.value } : x)))} />
                      <button type="button" aria-label={m.open ? "Ciutkan" : "Buka"} aria-expanded={m.open} className="rounded-lg p-1.5 hover:bg-surface2/60" onClick={() => setMods((ms) => ms.map((x, i) => (i === mi ? { ...x, open: !x.open } : x)))}>
                        {m.open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </button>
                    </div>
                    {m.open && (
                      <ul className="space-y-2 border-t border-line/10 p-3">
                        {m.lessons.map((l, li) => (
                          <li key={li} className={cn("rounded-lg border border-line/10 p-3", !l.checked && "opacity-55")}>
                            <div className="flex items-start gap-2">
                              <input type="checkbox" aria-label={`Pilih lesson ${l.title}`} className="mt-2.5 h-4 w-4 shrink-0 accent-[rgb(var(--primary))]" checked={l.checked} onChange={(e) => patchLesson(mi, li, { checked: e.target.checked, schedule: e.target.checked ? l.schedule : false })} />
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <input aria-label="Judul lesson" className="input py-1.5 text-sm" maxLength={200} value={l.title} onChange={(e) => patchLesson(mi, li, { title: e.target.value })} />
                                {l.description && <p className="text-xs text-muted">{l.description}</p>}
                                {l.objectives.length > 0 && (
                                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
                                    {l.objectives.map((o, k) => <li key={k}>{o}</li>)}
                                  </ul>
                                )}
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-[11px] text-muted">
                                  <span>±{l.minutes} menit</span>
                                  {l.sourceRef && <span>Sumber: {l.sourceRef}</span>}
                                  <label className={cn("ml-auto flex items-center gap-1.5 text-xs", !l.checked && "pointer-events-none")}>
                                    <input type="checkbox" className="h-3.5 w-3.5 accent-[rgb(var(--primary))]" checked={l.schedule} disabled={!l.checked} onChange={(e) => patchLesson(mi, li, { schedule: e.target.checked })} />
                                    <CalendarPlus className="h-3.5 w-3.5" /> Jadwalkan
                                  </label>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card space-y-3 p-5" aria-label="Jadwal belajar">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold">Jadwal belajar <span className="text-sm font-normal text-muted">({counts.sched} lesson dijadwalkan)</span></h2>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => scheduleAllChecked(true)}>Jadwalkan semua yang dipilih</button>
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => scheduleAllChecked(false)}>Batalkan jadwal</button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="im-date">Mulai tanggal</label>
                <input id="im-date" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="im-time">Jam</label>
                <input id="im-time" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="im-step">Satu lesson setiap</label>
                <select id="im-step" className="input" value={stepDays} onChange={(e) => setStepDays(Number(e.target.value))}>
                  {[1, 2, 3, 7].map((d) => <option key={d} value={d}>{d === 1 ? "1 hari" : `${d} hari`}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted">Lesson yang dijadwalkan disebar satu per satu sesuai urutan, dengan durasi sesuai perkiraan menit. Jadwal bisa diubah nanti di Kalender.</p>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn-ghost" onClick={run}>
              <RefreshCw className="h-4 w-4" /> Analisis ulang
            </button>
            <button type="button" disabled={applying} className="btn-primary" onClick={apply}>
              {applying && <Loader2 className="h-4 w-4 animate-spin" />} Tambahkan ke Materi ({counts.checked})
            </button>
          </div>
        </>
      )}

      {phase === "applied" && (
        <section className="card space-y-3 p-6 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
          <p className="font-display text-lg font-bold">
            {result ? `${result.lessons} lesson ditambahkan ke Materi${result.scheduled ? `, ${result.scheduled} dijadwalkan` : ""}` : "Item ini sudah dijadikan materi"}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/materi" className="btn-primary">Buka Materi</Link>
            {(result?.scheduled ?? 0) > 0 && <Link href="/calendar" className="btn-ghost">Lihat Kalender</Link>}
            {aiReady && (
              <button type="button" className="btn-ghost" onClick={() => { setResult(null); run(); }}>
                <RefreshCw className="h-4 w-4" /> Analisis ulang
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
