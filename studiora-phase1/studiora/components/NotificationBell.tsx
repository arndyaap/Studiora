"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Notif = { id: string; type: string; title: string; body: string; read: boolean; created_at: string };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,read,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as Notif[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((i) => !i.read).length;

  async function markAllRead() {
    const supabase = createClient();
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`}
        aria-expanded={open}
        className="relative rounded-xl border border-line/20 bg-surface/70 p-2.5 transition hover:bg-surface2/60 active:scale-95"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden bg-surface">
          <div className="flex items-center justify-between border-b border-line/15 px-4 py-3">
            <h2 className="font-display text-sm font-bold">Notifikasi</h2>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="flex items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Tandai dibaca
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {!loaded && <li className="px-4 py-6 text-center text-sm text-muted">Memuat…</li>}
            {loaded && items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted">Belum ada notifikasi.</li>
            )}
            {items.map((n) => (
              <li key={n.id} className="border-b border-line/10 px-4 py-3 last:border-0">
                <p className={n.read ? "text-sm text-muted" : "text-sm font-semibold"}>{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
