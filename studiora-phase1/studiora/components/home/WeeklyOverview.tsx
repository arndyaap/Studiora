"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMinutes, localDateKey } from "@/lib/utils";

type Day = { key: string; label: string; minutes: number; isToday: boolean };

export function WeeklyOverview({ dailyGoalMinutes }: { dailyGoalMinutes: number }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    async function run() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(today);
      start.setDate(start.getDate() - 6);

      const supabase = createClient();
      const { data, error } = await supabase
        .from("study_sessions")
        .select("started_at,duration_minutes")
        .eq("completed", true)
        .gte("started_at", start.toISOString());
      if (error) {
        setFailed(true);
        return;
      }

      const buckets = new Map<string, number>();
      for (const row of data ?? []) {
        const k = localDateKey(new Date(row.started_at));
        buckets.set(k, (buckets.get(k) ?? 0) + row.duration_minutes);
      }

      const fmt = new Intl.DateTimeFormat("id-ID", { weekday: "short" });
      const out: Day[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = localDateKey(d);
        out.push({ key, label: fmt.format(d), minutes: buckets.get(key) ?? 0, isToday: i === 6 });
      }
      setDays(out);
    }
    run();
  }, []);

  const total = days?.reduce((s, d) => s + d.minutes, 0) ?? 0;
  const max = Math.max(dailyGoalMinutes, ...(days?.map((d) => d.minutes) ?? [0]));

  return (
    <section className="card p-5" aria-labelledby="weekly-overview">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="weekly-overview" className="font-display text-base font-bold">
          Weekly Overview
        </h2>
        {days && <span className="text-xs text-muted">Total 7 hari: {formatMinutes(total)}</span>}
      </div>

      {failed ? (
        <p className="py-6 text-center text-sm text-danger">Gagal memuat aktivitas mingguan.</p>
      ) : !days ? (
        <p className="py-6 text-center text-sm text-muted">Memuat…</p>
      ) : (
        <>
          <div className="flex h-36 items-end gap-2" role="img" aria-label="Menit belajar per hari selama 7 hari terakhir">
            {days.map((d) => (
              <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] text-muted">{d.minutes > 0 ? formatMinutes(d.minutes) : ""}</span>
                <div
                  className={`w-full rounded-t-lg ${d.isToday ? "bg-primary" : "bg-softblue/60"} ${d.minutes === 0 ? "bg-line/15" : ""}`}
                  style={{ height: `${Math.max(d.minutes === 0 ? 4 : 8, (d.minutes / max) * 100)}%` }}
                />
                <span className={`text-[11px] ${d.isToday ? "font-bold text-ink" : "text-muted"}`}>{d.label}</span>
              </div>
            ))}
          </div>
          {total === 0 && (
            <p className="mt-3 text-center text-xs text-muted">
              Belum ada sesi belajar tercatat. Sesi Focus Room akan muncul di sini.
            </p>
          )}
        </>
      )}
    </section>
  );
}
