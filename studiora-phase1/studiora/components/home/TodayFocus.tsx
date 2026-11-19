"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Check, Circle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_META } from "@/lib/categories";
import { cn } from "@/lib/utils";

type Ev = {
  id: string;
  title: string;
  category: keyof typeof CATEGORY_META;
  starts_at: string;
  completed: boolean;
};

export function TodayFocus() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,category,starts_at,completed")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true });
    if (error) setError("Gagal memuat agenda hari ini.");
    setEvents((data as Ev[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(ev: Ev) {
    setBusy(ev.id);
    setError(null);
    const supabase = createClient();
    const completed = !ev.completed;
    const { error } = await supabase
      .from("calendar_events")
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq("id", ev.id);
    if (error) setError("Gagal menyimpan perubahan status.");
    else setEvents((prev) => prev?.map((e) => (e.id === ev.id ? { ...e, completed } : e)) ?? null);
    setBusy(null);
  }

  return (
    <section className="card p-5" aria-labelledby="today-focus">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="today-focus" className="font-display text-base font-bold">
          Today&apos;s Focus
        </h2>
        <Link href="/calendar" className="text-xs font-semibold text-primary hover:underline">
          Buka kalender
        </Link>
      </div>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      {events === null ? (
        <p className="py-6 text-center text-sm text-muted">Memuat…</p>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CalendarPlus className="h-7 w-7 text-muted" />
          <p className="text-sm text-muted">Belum ada kegiatan belajar hari ini.</p>
          <Link href="/calendar" className="btn-ghost mt-1 px-3 py-2 text-xs">
            Atur jadwal
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => {
            const meta = CATEGORY_META[ev.category] ?? CATEGORY_META.study_session;
            const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
              new Date(ev.starts_at),
            );
            return (
              <li
                key={ev.id}
                className="flex items-center gap-3 rounded-xl border border-line/10 bg-bg/40 px-3 py-2.5"
              >
                <span className={cn("h-8 w-1 shrink-0 rounded-full", meta.bar)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-semibold", ev.completed && "text-muted line-through")}>
                    {ev.title}
                  </p>
                  <p className="text-xs text-muted">
                    {time} · {meta.label} · {ev.completed ? "Selesai" : "Belum selesai"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(ev)}
                  disabled={busy === ev.id}
                  aria-label={ev.completed ? "Tandai belum selesai" : "Tandai selesai"}
                  className={cn(
                    "rounded-full p-1.5 transition active:scale-90",
                    ev.completed ? "bg-success/20 text-success" : "text-muted hover:bg-surface2/60 hover:text-ink",
                  )}
                >
                  {busy === ev.id ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : ev.completed ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
