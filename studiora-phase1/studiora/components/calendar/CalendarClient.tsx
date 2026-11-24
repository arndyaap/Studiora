"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, Check, ChevronLeft, ChevronRight, Circle, Flag, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_META, type EventCategory } from "@/lib/categories";
import { Modal, ConfirmButton } from "@/components/ui/Modal";
import { cn, localDateKey } from "@/lib/utils";

type Ev = {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  starts_at: string;
  ends_at: string | null;
  is_deadline: boolean;
  remind_minutes_before: number | null;
  completed: boolean;
};

type View = "month" | "week" | "day";

const DAY_NAMES = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Senin sebagai awal minggu */
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7;
  return addDays(x, -dow);
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("id-ID", opts).format(d);
}
function timeInput(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Draft = {
  id?: string;
  title: string;
  description: string;
  category: EventCategory;
  date: string;
  startTime: string;
  endTime: string;
  is_deadline: boolean;
  remind: string; // "" = tanpa pengingat
};

function emptyDraft(date: Date): Draft {
  return {
    title: "",
    description: "",
    category: "study_session",
    date: localDateKey(date),
    startTime: "09:00",
    endTime: "",
    is_deadline: false,
    remind: "",
  };
}

export function CalendarClient() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,description,category,starts_at,ends_at,is_deadline,remind_minutes_before,completed")
      .order("starts_at", { ascending: true })
      .limit(2000);
    if (error) setError("Gagal memuat jadwal. Coba muat ulang halaman.");
    else setError(null);
    setEvents((data as Ev[]) ?? []);
    setLoading(false);
    setNow(new Date());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Pengingat: dibuat sebagai notifikasi saat halaman Kalender dibuka (sekali per jadwal).
  useEffect(() => {
    if (loading) return;
    const supabase = createClient();
    const t = Date.now();
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem("studiora-reminded") || "[]");
    } catch {}
    const due = events.filter((e) => {
      if (e.completed || e.remind_minutes_before == null) return false;
      const start = new Date(e.starts_at).getTime();
      const key = `${e.id}@${e.starts_at}`;
      return !seen.includes(key) && t >= start - e.remind_minutes_before * 60000 && t < start + 3600000;
    });
    if (due.length === 0) return;
    (async () => {
      for (const e of due) {
        const { error } = await supabase.from("notifications").insert({
          type: e.is_deadline ? "deadline" : "schedule",
          title: `${e.is_deadline ? "Deadline" : "Jadwal"}: ${e.title}`,
          body: `Mulai ${fmtTime(e.starts_at)}`,
        });
        if (!error) seen.push(`${e.id}@${e.starts_at}`);
      }
      try {
        localStorage.setItem("studiora-reminded", JSON.stringify(seen.slice(-300)));
      } catch {}
    })();
  }, [events, loading]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events) {
      const k = localDateKey(new Date(e.starts_at));
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    return m;
  }, [events]);

  function shift(dir: -1 | 1) {
    const c = new Date(cursor);
    if (view === "month") c.setMonth(c.getMonth() + dir, 1);
    else if (view === "week") c.setDate(c.getDate() + 7 * dir);
    else c.setDate(c.getDate() + dir);
    setCursor(startOfDay(c));
  }

  const title =
    view === "month"
      ? fmtDate(cursor, { month: "long", year: "numeric" })
      : view === "week"
        ? `${fmtDate(startOfWeek(cursor), { day: "numeric", month: "short" })} – ${fmtDate(addDays(startOfWeek(cursor), 6), { day: "numeric", month: "short", year: "numeric" })}`
        : fmtDate(cursor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function openNew(date: Date) {
    setFormError(null);
    setDraft(emptyDraft(date));
  }
  function openEdit(e: Ev) {
    setFormError(null);
    setDraft({
      id: e.id,
      title: e.title,
      description: e.description,
      category: e.category,
      date: localDateKey(new Date(e.starts_at)),
      startTime: timeInput(e.starts_at),
      endTime: e.ends_at ? timeInput(e.ends_at) : "",
      is_deadline: e.is_deadline,
      remind: e.remind_minutes_before == null ? "" : String(e.remind_minutes_before),
    });
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    setFormError(null);

    const title = draft.title.trim();
    if (!title) return setFormError("Judul wajib diisi.");
    if (title.length > 200) return setFormError("Judul maksimal 200 karakter.");
    if (!draft.date || !draft.startTime) return setFormError("Tanggal dan jam mulai wajib diisi.");

    const starts = new Date(`${draft.date}T${draft.startTime}:00`);
    if (isNaN(starts.getTime())) return setFormError("Tanggal atau jam tidak valid.");
    let ends: Date | null = null;
    if (draft.endTime) {
      ends = new Date(`${draft.date}T${draft.endTime}:00`);
      if (ends < starts) return setFormError("Jam selesai tidak boleh lebih awal dari jam mulai.");
    }

    const payload = {
      title,
      description: draft.description.trim(),
      category: draft.category,
      starts_at: starts.toISOString(),
      ends_at: ends ? ends.toISOString() : null,
      is_deadline: draft.is_deadline,
      remind_minutes_before: draft.remind === "" ? null : Number(draft.remind),
    };

    setSaving(true);
    const supabase = createClient();
    const { error } = draft.id
      ? await supabase.from("calendar_events").update(payload).eq("id", draft.id)
      : await supabase.from("calendar_events").insert(payload);
    setSaving(false);
    if (error) return setFormError("Gagal menyimpan jadwal. Coba lagi.");
    setDraft(null);
    await load();
  }

  async function toggleDone(e: Ev) {
    setBusyId(e.id);
    const completed = !e.completed;
    const supabase = createClient();
    const { error } = await supabase
      .from("calendar_events")
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq("id", e.id);
    setBusyId(null);
    if (error) setError("Gagal mengubah status.");
    else setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, completed } : x)));
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) return setFormError("Gagal menghapus jadwal.");
    setDraft(null);
    setEvents((prev) => prev.filter((x) => x.id !== id));
  }

  // ----- Agenda -----
  const todayKey = localDateKey(now);
  const todays = events.filter((e) => localDateKey(new Date(e.starts_at)) === todayKey && !e.completed);
  const overdue = events.filter((e) => !e.completed && new Date(e.ends_at ?? e.starts_at) < now && localDateKey(new Date(e.starts_at)) !== todayKey);
  const overdueToday = events.filter(
    (e) => !e.completed && localDateKey(new Date(e.starts_at)) === todayKey && new Date(e.ends_at ?? e.starts_at) < now,
  );
  const upcoming = events.filter((e) => !e.completed && localDateKey(new Date(e.starts_at)) > todayKey).slice(0, 8);
  const completed = events.filter((e) => e.completed).slice(-8).reverse();
  const selectedKey = localDateKey(cursor);
  const selectedList = byDay.get(selectedKey) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Kalender</h1>
        <button type="button" className="btn-primary" onClick={() => openNew(cursor)}>
          <Plus className="h-4 w-4" /> Tambah Jadwal
        </button>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="card p-4 sm:p-5 xl:col-span-2" aria-label="Kalender">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Sebelumnya" onClick={() => shift(-1)} className="rounded-lg p-2 hover:bg-surface2/60">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" aria-label="Berikutnya" onClick={() => shift(1)} className="rounded-lg p-2 hover:bg-surface2/60">
                <ChevronRight className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setCursor(startOfDay(new Date()))} className="btn-ghost ml-1 px-3 py-1.5 text-xs">
                Hari ini
              </button>
            </div>
            <h2 className="order-first w-full font-display text-lg font-bold capitalize sm:order-none sm:w-auto">{title}</h2>
            <div className="flex rounded-xl border border-line/20 p-0.5" role="tablist" aria-label="Tampilan kalender">
              {(["month", "week", "day"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition", view === v ? "bg-primary text-white" : "text-muted hover:text-ink")}
                >
                  {v === "month" ? "Bulan" : v === "week" ? "Minggu" : "Hari"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Memuat…</p>
          ) : view === "month" ? (
            <MonthGrid cursor={cursor} byDay={byDay} todayKey={todayKey} selectedKey={selectedKey} onSelect={(d) => setCursor(d)} onOpen={openEdit} />
          ) : view === "week" ? (
            <WeekList cursor={cursor} byDay={byDay} todayKey={todayKey} onSelect={(d) => { setCursor(d); setView("day"); }} onOpen={openEdit} onToggle={toggleDone} busyId={busyId} />
          ) : (
            <DayList list={selectedList} onOpen={openEdit} onToggle={toggleDone} busyId={busyId} onAdd={() => openNew(cursor)} />
          )}

          <div className="mt-4 flex flex-wrap gap-3 border-t border-line/10 pt-3 text-[11px] text-muted">
            {Object.entries(CATEGORY_META).map(([k, m]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", m.dot)} /> {m.label}
              </span>
            ))}
          </div>
        </section>

        <aside className="space-y-5" aria-label="Agenda">
          {view === "month" && (
            <AgendaCard title={`Agenda ${fmtDate(cursor, { day: "numeric", month: "long" })}`} list={selectedList} empty="Tidak ada jadwal di tanggal ini." onOpen={openEdit} onToggle={toggleDone} busyId={busyId} />
          )}
          <AgendaCard title="Today's Agenda" list={todays} empty="Tidak ada agenda hari ini." onOpen={openEdit} onToggle={toggleDone} busyId={busyId} />
          <AgendaCard title="Overdue Tasks" tone="danger" list={[...overdue, ...overdueToday]} empty="Tidak ada tugas terlambat." onOpen={openEdit} onToggle={toggleDone} busyId={busyId} showDate />
          <AgendaCard title="Upcoming Activities" list={upcoming} empty="Belum ada jadwal mendatang." onOpen={openEdit} onToggle={toggleDone} busyId={busyId} showDate />
          <AgendaCard title="Completed Activities" list={completed} empty="Belum ada aktivitas selesai." onOpen={openEdit} onToggle={toggleDone} busyId={busyId} showDate />
        </aside>
      </div>

      <Modal open={!!draft} title={draft?.id ? "Edit Jadwal" : "Tambah Jadwal"} onClose={() => setDraft(null)}>
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="label" htmlFor="ev-title">Judul</label>
              <input id="ev-title" className="input" maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="ev-cat">Kategori</label>
              <select id="ev-cat" className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as EventCategory })}>
                {Object.entries(CATEGORY_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <label className="label" htmlFor="ev-date">Tanggal</label>
                <input id="ev-date" type="date" className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="label" htmlFor="ev-start">Mulai</label>
                <input id="ev-start" type="time" className="input" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="label" htmlFor="ev-end">Selesai (opsional)</label>
                <input id="ev-end" type="time" className="input" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="ev-desc">Deskripsi</label>
              <textarea id="ev-desc" className="input min-h-20" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={draft.is_deadline} onChange={(e) => setDraft({ ...draft, is_deadline: e.target.checked })} />
                Tandai sebagai deadline
              </label>
              <div>
                <label className="label" htmlFor="ev-remind">Pengingat</label>
                <select id="ev-remind" className="input" value={draft.remind} onChange={(e) => setDraft({ ...draft, remind: e.target.value })}>
                  <option value="">Tanpa pengingat</option>
                  <option value="0">Saat mulai</option>
                  <option value="15">15 menit sebelum</option>
                  <option value="60">1 jam sebelum</option>
                  <option value="1440">1 hari sebelum</option>
                </select>
              </div>
            </div>
            {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
            <div className="flex items-center justify-between gap-2 pt-1">
              {draft.id ? (
                <ConfirmButton className="btn-ghost text-danger" onConfirm={() => remove(draft.id!)}>
                  <Trash2 className="h-4 w-4" /> Hapus
                </ConfirmButton>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function Chip({ e, onClick }: { e: Ev; onClick: () => void }) {
  const meta = CATEGORY_META[e.category] ?? CATEGORY_META.study_session;
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      className={cn("flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-white", meta.bar, e.completed && "opacity-40 line-through")}
      title={e.title}
    >
      {e.is_deadline && <Flag className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">{e.title}</span>
    </button>
  );
}

function MonthGrid({
  cursor,
  byDay,
  todayKey,
  selectedKey,
  onSelect,
  onOpen,
}: {
  cursor: Date;
  byDay: Map<string, Ev[]>;
  todayKey: string;
  selectedKey: string;
  onSelect: (d: Date) => void;
  onOpen: (e: Ev) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-semibold uppercase text-muted">
        {DAY_NAMES.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const key = localDateKey(d);
          const list = byDay.get(key) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(d)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(d)}
              aria-label={`${fmtDate(d, { day: "numeric", month: "long" })}, ${list.length} jadwal`}
              className={cn(
                "min-h-[68px] cursor-pointer rounded-lg border p-1 text-left transition sm:min-h-24",
                inMonth ? "border-line/10 bg-bg/30" : "border-transparent opacity-40",
                key === selectedKey && "border-primary/70 bg-primary/10",
                "hover:border-primary/40",
              )}
            >
              <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold", key === todayKey && "bg-primary text-white")}>
                {d.getDate()}
              </span>
              <div className="mt-0.5 space-y-0.5">
                <div className="hidden space-y-0.5 sm:block">
                  {list.slice(0, 2).map((e) => (
                    <Chip key={e.id} e={e} onClick={() => onOpen(e)} />
                  ))}
                  {list.length > 2 && <p className="px-1 text-[10px] text-muted">+{list.length - 2} lagi</p>}
                </div>
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {list.slice(0, 4).map((e) => (
                    <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", (CATEGORY_META[e.category] ?? CATEGORY_META.study_session).dot)} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventRow({ e, onOpen, onToggle, busy, showDate }: { e: Ev; onOpen: () => void; onToggle: () => void; busy: boolean; showDate?: boolean }) {
  const meta = CATEGORY_META[e.category] ?? CATEGORY_META.study_session;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line/10 bg-bg/40 px-3 py-2.5">
      <span className={cn("h-9 w-1 shrink-0 rounded-full", meta.bar)} aria-hidden="true" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className={cn("flex items-center gap-1.5 truncate text-sm font-semibold", e.completed && "text-muted line-through")}>
          {e.is_deadline && <Flag className="h-3.5 w-3.5 shrink-0 text-danger" />}
          <span className="truncate">{e.title}</span>
          {e.remind_minutes_before != null && <AlarmClock className="h-3 w-3 shrink-0 text-muted" aria-label="Ada pengingat" />}
        </p>
        <p className="text-xs text-muted">
          {showDate && `${fmtDate(new Date(e.starts_at), { day: "numeric", month: "short" })} · `}
          {fmtTime(e.starts_at)}
          {e.ends_at ? `–${fmtTime(e.ends_at)}` : ""} · {meta.label}
        </p>
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={e.completed ? "Tandai belum selesai" : "Tandai selesai"}
        className={cn("rounded-full p-1.5 transition active:scale-90", e.completed ? "bg-success/20 text-success" : "text-muted hover:bg-surface2/60 hover:text-ink")}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : e.completed ? <Check className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
      </button>
    </li>
  );
}

function WeekList({
  cursor,
  byDay,
  todayKey,
  onSelect,
  onOpen,
  onToggle,
  busyId,
}: {
  cursor: Date;
  byDay: Map<string, Ev[]>;
  todayKey: string;
  onSelect: (d: Date) => void;
  onOpen: (e: Ev) => void;
  onToggle: (e: Ev) => void;
  busyId: string | null;
}) {
  const start = startOfWeek(cursor);
  return (
    <div className="space-y-3">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
        const key = localDateKey(d);
        const list = byDay.get(key) ?? [];
        return (
          <div key={key}>
            <button type="button" onClick={() => onSelect(d)} className={cn("mb-1.5 text-xs font-bold uppercase tracking-wide hover:underline", key === todayKey ? "text-primary" : "text-muted")}>
              {fmtDate(d, { weekday: "long", day: "numeric", month: "short" })}
            </button>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line/15 px-3 py-2 text-xs text-muted">Kosong</p>
            ) : (
              <ul className="space-y-2">
                {list.map((e) => (
                  <EventRow key={e.id} e={e} onOpen={() => onOpen(e)} onToggle={() => onToggle(e)} busy={busyId === e.id} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayList({ list, onOpen, onToggle, busyId, onAdd }: { list: Ev[]; onOpen: (e: Ev) => void; onToggle: (e: Ev) => void; busyId: string | null; onAdd: () => void }) {
  if (list.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-muted">Belum ada jadwal di hari ini.</p>
        <button type="button" className="btn-ghost" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Tambah Jadwal
        </button>
      </div>
    );
  return (
    <ul className="space-y-2">
      {list.map((e) => (
        <EventRow key={e.id} e={e} onOpen={() => onOpen(e)} onToggle={() => onToggle(e)} busy={busyId === e.id} />
      ))}
    </ul>
  );
}

function AgendaCard({
  title,
  list,
  empty,
  onOpen,
  onToggle,
  busyId,
  showDate,
  tone,
}: {
  title: string;
  list: Ev[];
  empty: string;
  onOpen: (e: Ev) => void;
  onToggle: (e: Ev) => void;
  busyId: string | null;
  showDate?: boolean;
  tone?: "danger";
}) {
  return (
    <section className="card p-4">
      <h3 className={cn("mb-3 flex items-center gap-2 font-display text-sm font-bold", tone === "danger" && list.length > 0 && "text-danger")}>
        {title}
        {list.length > 0 && <span className="rounded-full bg-line/15 px-2 py-0.5 text-[10px] font-semibold text-muted">{list.length}</span>}
      </h3>
      {list.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((e) => (
            <EventRow key={e.id} e={e} onOpen={() => onOpen(e)} onToggle={() => onToggle(e)} busy={busyId === e.id} showDate={showDate} />
          ))}
        </ul>
      )}
    </section>
  );
}
